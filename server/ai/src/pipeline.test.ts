/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@amp/database';
import { MockAiProvider, processAiJob, RetryableProviderError } from './index';
import type { AiProvider } from './provider';

/**
 * Minimal in-memory stand-in for the Prisma client, implementing only what
 * processAiJob and the real settleCredits/releaseCredits touch. It lets us
 * test the pipeline's credit and status rules without a database.
 */
function makeFakeDb(opts: { jobType?: string; status?: string; platforms?: string[]; cancelDuringProvider?: boolean } = {}) {
  const state = {
    job: {
      id: 'job1',
      organizationId: 'org1',
      productId: 'prod1',
      campaignId: null as string | null,
      jobType: opts.jobType ?? 'PRODUCT_ANALYSIS',
      status: opts.status ?? 'QUEUED',
      attempts: 0,
      startedAt: null as Date | null,
      progress: 0,
      error: null as string | null,
      model: 'unset',
      creditsReserved: 5,
      creditsUsed: 0,
      inputData: { objective: 'Launch', platforms: opts.platforms ?? ['INSTAGRAM'] } as Record<string, unknown>,
      outputData: null as unknown,
    },
    account: { balance: 100, reserved: 5 },
    reservation: { id: 'r1', organizationId: 'org1', referenceId: 'job1', amount: 5, status: 'RESERVED', settledAmount: 0 },
    ledger: [] as Array<{ amount: number; idempotencyKey: string }>,
    assets: [] as Array<Record<string, unknown>>,
  };
  const product = {
    id: 'prod1',
    name: 'Trail Bottle',
    category: 'Outdoor',
    description: 'Insulated bottle',
    features: ['Leak proof'],
    price: { toString: () => '1299' },
    currency: 'INR',
    audience: 'Hikers',
    offerDetails: null,
    attributes: {},
    analysis: null,
    brand: { name: 'Acme', voice: null, audience: null, guidelines: null },
    images: [],
  };
  const db: any = {
    aIJob: {
      findUnique: async ({ select }: any) => {
        // The lookup that uses `select` is the post-provider cancellation check.
        if (select && opts.cancelDuringProvider) state.job.status = 'CANCELLED';
        return { ...state.job };
      },
      updateMany: async ({ where, data }: any) => {
        if (!where.status.in.includes(state.job.status)) return { count: 0 };
        const { attempts, ...rest } = data;
        Object.assign(state.job, rest);
        if (attempts) state.job.attempts += attempts.increment;
        return { count: 1 };
      },
      update: async ({ data }: any) => {
        Object.assign(state.job, data);
        return { ...state.job };
      },
    },
    product: { findFirstOrThrow: async () => product },
    campaign: { updateMany: async () => ({ count: 0 }), findFirst: async () => null },
    contentAsset: {
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: any) => {
        const a = { id: `asset${state.assets.length + 1}`, ...data };
        state.assets.push(a);
        return a;
      },
    },
    creditReservation: {
      findUnique: async () => ({ ...state.reservation }),
      update: async ({ data }: any) => Object.assign(state.reservation, data),
    },
    creditAccount: {
      create: async () => ({}),
      update: async ({ data }: any) => {
        if (data.reserved?.decrement) state.account.reserved -= data.reserved.decrement;
        if (typeof data.balance === 'number') state.account.balance = data.balance;
        return state.account;
      },
    },
    creditTransaction: {
      create: async ({ data }: any) => {
        state.ledger.push({ amount: data.amount, idempotencyKey: data.idempotencyKey });
        return data;
      },
    },
    $queryRaw: async () => [{ ...state.account }],
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db: db as PrismaClient, state };
}

class FailingProvider extends MockAiProvider {
  constructor(
    private readonly err: Error | null,
    private readonly badOutput?: unknown,
  ) {
    super();
  }
  override async analyzeProduct(...args: Parameters<MockAiProvider['analyzeProduct']>): ReturnType<MockAiProvider['analyzeProduct']> {
    if (this.err) throw this.err;
    if (this.badOutput !== undefined) return { model: 'bad', output: this.badOutput as never };
    return super.analyzeProduct(...args);
  }
}

test('success: job completes, credits settle once, prompt version recorded', async () => {
  const { db, state } = makeFakeDb();
  const outcome = await processAiJob(db, new MockAiProvider(), 'job1', { isFinalAttempt: false });
  assert.equal(outcome, 'completed');
  assert.equal(state.job.status, 'COMPLETED');
  assert.equal(state.job.progress, 100);
  assert.equal(state.job.creditsUsed, 5);
  assert.equal(state.job.model, 'mock-1');
  assert.equal((state.job.inputData as any).promptVersion, 1);
  assert.equal(state.reservation.status, 'SETTLED');
  assert.equal(state.account.balance, 95);
  assert.equal(state.account.reserved, 0);
  assert.deepEqual(state.ledger, [{ amount: -5, idempotencyKey: 'settle:job1' }]);
});

test('already completed job is skipped without touching credits', async () => {
  const { db, state } = makeFakeDb({ status: 'COMPLETED' });
  assert.equal(await processAiJob(db, new MockAiProvider(), 'job1', { isFinalAttempt: false }), 'skipped');
  assert.equal(state.reservation.status, 'RESERVED');
  assert.equal(state.ledger.length, 0);
});

test('cancelled job releases its hold and is not charged', async () => {
  const { db, state } = makeFakeDb({ status: 'CANCELLED' });
  assert.equal(await processAiJob(db, new MockAiProvider(), 'job1', { isFinalAttempt: false }), 'cancelled');
  assert.equal(state.reservation.status, 'RELEASED');
  assert.equal(state.account.balance, 100);
  assert.equal(state.account.reserved, 0);
  assert.equal(state.ledger.length, 0);
});

test('cancellation during the provider call releases credits and does not complete the job', async () => {
  const { db, state } = makeFakeDb({ cancelDuringProvider: true });
  assert.equal(await processAiJob(db, new MockAiProvider(), 'job1', { isFinalAttempt: false }), 'cancelled');
  assert.equal(state.reservation.status, 'RELEASED');
  assert.equal(state.ledger.length, 0);
  assert.notEqual(state.job.status, 'COMPLETED');
});

test('invalid provider output is rejected: job FAILED with safe message, credits released', async () => {
  const { db, state } = makeFakeDb();
  const outcome = await processAiJob(db, new FailingProvider(null, { summary: 'only this' }), 'job1', { isFinalAttempt: false });
  assert.equal(outcome, 'failed');
  assert.equal(state.job.status, 'FAILED');
  assert.equal(state.job.error, 'The AI response did not match the expected format.');
  assert.equal(state.job.outputData, null, 'invalid output must not be stored');
  assert.equal(state.reservation.status, 'RELEASED');
  assert.equal(state.account.balance, 100);
  assert.equal(state.ledger.length, 0);
});

test('retryable error before the final attempt re-queues, rethrows and keeps credits held', async () => {
  const { db, state } = makeFakeDb();
  const err = new RetryableProviderError('rate limited');
  await assert.rejects(processAiJob(db, new FailingProvider(err), 'job1', { isFinalAttempt: false }), (e) => e === err);
  assert.equal(state.job.status, 'QUEUED');
  assert.match(state.job.error ?? '', /^Retrying: rate limited/);
  assert.equal(state.reservation.status, 'RESERVED');
  assert.equal(state.account.reserved, 5);
});

test('retryable error on the final attempt fails the job and releases credits', async () => {
  const { db, state } = makeFakeDb();
  const outcome = await processAiJob(db, new FailingProvider(new RetryableProviderError('timeout')), 'job1', { isFinalAttempt: true });
  assert.equal(outcome, 'failed');
  assert.equal(state.job.status, 'FAILED');
  assert.equal(state.reservation.status, 'RELEASED');
  assert.equal(state.ledger.length, 0);
});

test('non-retryable error fails immediately even before the final attempt', async () => {
  const { db, state } = makeFakeDb();
  const outcome = await processAiJob(db, new FailingProvider(new Error('bad request')), 'job1', { isFinalAttempt: false });
  assert.equal(outcome, 'failed');
  assert.equal(state.reservation.status, 'RELEASED');
});

test('error messages are truncated and API keys redacted', async () => {
  const { db, state } = makeFakeDb();
  await processAiJob(db, new FailingProvider(new Error(`auth failed for sk-abc123_DEF-456 ${'x'.repeat(600)}`)), 'job1', { isFinalAttempt: true });
  assert.ok(!state.job.error!.includes('sk-abc123'));
  assert.ok(state.job.error!.includes('[redacted]'));
  assert.ok(state.job.error!.length <= 500);
});

test('duplicate delivery of a completed job does not double-charge', async () => {
  const { db, state } = makeFakeDb();
  const provider = new MockAiProvider();
  assert.equal(await processAiJob(db, provider, 'job1', { isFinalAttempt: false }), 'completed');
  assert.equal(await processAiJob(db, provider, 'job1', { isFinalAttempt: false }), 'skipped');
  assert.equal(state.ledger.length, 1);
  assert.equal(state.account.balance, 95);
});

test('a job that is not claimable (another worker or unknown state) is skipped', async () => {
  const { db, state } = makeFakeDb({ status: 'SOMETHING_ELSE' });
  assert.equal(await processAiJob(db, new MockAiProvider(), 'job1', { isFinalAttempt: false }), 'skipped');
  assert.equal(state.ledger.length, 0);
});

test('unknown job id is skipped', async () => {
  const { db } = makeFakeDb();
  (db as any).aIJob.findUnique = async () => null;
  assert.equal(await processAiJob(db, new MockAiProvider(), 'nope', { isFinalAttempt: false }), 'skipped');
});

test('CONTENT job creates one asset per platform and settles credits', async () => {
  const { db, state } = makeFakeDb({ jobType: 'CONTENT', platforms: ['INSTAGRAM', 'WEBSITE'] });
  assert.equal(await processAiJob(db, new MockAiProvider(), 'job1', { isFinalAttempt: false }), 'completed');
  assert.equal(state.assets.length, 2);
  assert.deepEqual((state.job.outputData as any).contentAssetIds, ['asset1', 'asset2']);
  assert.equal((state.job.inputData as any).promptVersion, 1);
  assert.equal(state.reservation.status, 'SETTLED');
});

test('CONTENT job: output exceeding platform limits is flagged in qualityWarnings, not truncated', async () => {
  const { db, state } = makeFakeDb({ jobType: 'CONTENT', platforms: ['FACEBOOK'] });
  const long = 'y'.repeat(400); // FACEBOOK primaryText limit is 125
  const provider: AiProvider = Object.assign(new MockAiProvider(), {
    generateContent: async () => ({
      model: 'm',
      output: {
        platform: 'FACEBOOK',
        variants: [{ headline: 'h', body: long, cta: 'Shop now', hashtags: [] }],
        keywordSuggestions: { source: 'ai-suggestion', keywords: [] },
        qualityWarnings: [],
      },
    }),
  });
  assert.equal(await processAiJob(db, provider, 'job1', { isFinalAttempt: false }), 'completed');
  const data = state.assets[0].contentData as { variants: Array<{ body: string }>; qualityWarnings: string[] };
  assert.equal(data.variants[0].body, long);
  assert.ok(data.qualityWarnings.length > 0);
});

test('STRATEGY job completes and stores the strategy', async () => {
  const { db, state } = makeFakeDb({ jobType: 'STRATEGY' });
  assert.equal(await processAiJob(db, new MockAiProvider(), 'job1', { isFinalAttempt: false }), 'completed');
  assert.equal((state.job.outputData as any).objectives[0], 'Launch');
});

test('unsupported job type fails and releases credits', async () => {
  const { db, state } = makeFakeDb({ jobType: 'IMAGE_GENERATION' });
  assert.equal(await processAiJob(db, new MockAiProvider(), 'job1', { isFinalAttempt: false }), 'failed');
  assert.match(state.job.error ?? '', /Unsupported job type/);
  assert.equal(state.reservation.status, 'RELEASED');
});
