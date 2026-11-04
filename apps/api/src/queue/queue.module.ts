import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUES, type AiJobPayload, type QueueName } from '@amp/shared-types';
import { env } from '../config/env';

/** Producer side of BullMQ. Consumers live in apps/worker. */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger('Queue');
  private connection?: IORedis;
  private readonly queues = new Map<QueueName, Queue>();

  get enabled() {
    return env().QUEUE_ENABLED;
  }

  redis(): IORedis {
    this.connection ??= new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
    return this.connection;
  }

  private queue(name: QueueName) {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: this.redis(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 7 * 86_400 },
        },
      });
      this.queues.set(name, q);
    }
    return q;
  }

  /** jobId = AIJob.id so re-enqueueing the same job is a no-op (idempotent). */
  async enqueueAiJob(jobType: string, payload: AiJobPayload) {
    if (!this.enabled) {
      this.logger.warn(`Queue disabled; AIJob ${payload.aiJobId} left QUEUED`);
      return;
    }
    const name = jobType === 'PRODUCT_ANALYSIS' ? QUEUES.AI_ANALYSIS : jobType === 'IMAGE_GENERATION' ? QUEUES.IMAGE_GENERATION : QUEUES.AI_CONTENT;
    await this.queue(name).add(jobType, payload, { jobId: payload.aiJobId });
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection?.quit().catch(() => undefined);
  }
}

@Global()
@Module({ providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
