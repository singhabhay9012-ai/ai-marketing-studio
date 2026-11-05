import { Job, UnrecoverableError, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createAiProvider, processAiJob } from '@amp/ai';
import { PrismaClient } from '@amp/database';
import { QUEUES, type AiJobPayload } from '@amp/shared-types';

/**
 * Worker service: consumes BullMQ queues. Each queue has its own concurrency
 * so a burst of image jobs can't starve text generation.
 * Queues for bulk-import, exports, publishing and webhooks are registered as
 * their processors land (Sprints 6–7 and the publishing phase).
 */

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'worker', msg, ...extra }));

const prisma = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const provider = createAiProvider();

/** Short-lived image URLs for vision models (S3/R2 only; local files aren't reachable by providers). */
function imageUrlFactory() {
  if (process.env.STORAGE_DRIVER !== 's3') return undefined;
  const s3 = new S3Client({
    region: process.env.STORAGE_REGION ?? 'auto',
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.STORAGE_ENDPOINT),
    credentials: process.env.STORAGE_ACCESS_KEY
      ? { accessKeyId: process.env.STORAGE_ACCESS_KEY, secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '' }
      : undefined,
  });
  return (keys: string[]) =>
    Promise.all(keys.map((Key) => getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key }), { expiresIn: 600 })));
}
const imageUrls = imageUrlFactory();

async function handleAiJob(job: Job<AiJobPayload>) {
  const started = Date.now();
  const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  const outcome = await processAiJob(prisma, provider, job.data.aiJobId, { imageUrls, isFinalAttempt });
  log('ai job processed', { queue: job.queueName, aiJobId: job.data.aiJobId, outcome, attempt: job.attemptsMade + 1, ms: Date.now() - started });
  if (outcome === 'failed') throw new UnrecoverableError('AI job failed permanently'); // → failed set for manual review
  return { outcome };
}

const workers = [
  new Worker(QUEUES.AI_ANALYSIS, handleAiJob, { connection, concurrency: Number(process.env.AI_ANALYSIS_CONCURRENCY ?? 4) }),
  new Worker(QUEUES.AI_CONTENT, handleAiJob, { connection, concurrency: Number(process.env.AI_CONTENT_CONCURRENCY ?? 4) }),
  new Worker(QUEUES.IMAGE_GENERATION, handleAiJob, { connection, concurrency: Number(process.env.IMAGE_CONCURRENCY ?? 2) }),
];

for (const w of workers) {
  w.on('failed', (job, err) => log('job failed', { queue: w.name, jobId: job?.id, attempts: job?.attemptsMade, error: err.message }));
  w.on('error', (err) => log('worker error', { queue: w.name, error: err.message }));
}

log('worker started', { provider: provider.name, queues: workers.map((w) => w.name) });

async function shutdown(signal: string) {
  log('shutting down', { signal });
  await Promise.all(workers.map((w) => w.close()));
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
