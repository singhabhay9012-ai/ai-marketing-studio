import { MockAiProvider, processAiJob, RetryableProviderError } from '@amp/ai';
import { getCreditSummary, InsufficientCreditsError, reconcileCredits, reserveCredits, settleCredits } from '@amp/database';
import { as, bootApp, createBrand, createProduct, prisma, resetDb, signUp, TestApp } from './helpers';

/** MVP acceptance: credits are reserved, settled and released correctly, including retry and failure cases. */
describe('AI jobs and credit ledger', () => {
  let t: TestApp;
  const provider = new MockAiProvider();
  const run = (id: string, isFinalAttempt = true, p = provider) => processAiJob(prisma, p, id, { isFinalAttempt });

  beforeAll(async () => {
    await resetDb();
    t = await bootApp();
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  async function setup() {
    const a = await signUp(t);
    const product = await createProduct(t, a, (await createBrand(t, a)).id, { description: 'Relaxed-fit shirt woven from European flax, garment-washed for softness.' });
    return { a, api: as(t, a, a.orgId), product };
  }

  it('analysis → reserve, process, settle, confirm, then content per platform', async () => {
    const { a, api, product } = await setup();

    const job = await api.post('/api/v1/ai/product-analysis').send({ productId: product.id }).expect(202);
    expect(job.body).toMatchObject({ status: 'QUEUED', creditsReserved: 2 });
    expect(await getCreditSummary(prisma, a.orgId)).toEqual({ balance: 20, reserved: 2, available: 18 });

    // Content is blocked until the analysis has been human-confirmed.
    await api.post('/api/v1/ai/content').send({ productId: product.id, platforms: ['INSTAGRAM'] }).expect(400);

    expect(await run(job.body.id)).toBe('completed');
    const done = await api.get(`/api/v1/ai/jobs/${job.body.id}`).expect(200);
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.outputData.uncertain.length).toBeGreaterThan(0); // flags uncertainty instead of inventing
    expect(await getCreditSummary(prisma, a.orgId)).toEqual({ balance: 18, reserved: 0, available: 18 });

    const corrected = { ...done.body.outputData, category: 'Apparel', uncertain: [] };
    const confirmed = await api.post(`/api/v1/ai/product-analysis/${job.body.id}/confirm`).send({ analysis: corrected }).expect(200);
    expect(confirmed.body.status).toBe('ACTIVE');
    expect(confirmed.body.analysis.category).toBe('Apparel');

    const content = await api.post('/api/v1/ai/content').send({ productId: product.id, platforms: ['INSTAGRAM', 'WEBSITE', 'INSTAGRAM'] }).expect(202);
    expect(content.body.creditsReserved).toBe(2); // de-duplicated platforms × 1 credit
    expect(await run(content.body.id)).toBe('completed');

    const assets = await prisma.contentAsset.findMany({ where: { productId: product.id } });
    expect(assets.map((x) => x.platform).sort()).toEqual(['INSTAGRAM', 'WEBSITE']);
    const web = assets.find((x) => x.platform === 'WEBSITE')!.contentData as { seo: { metaTitle: string }; keywordSuggestions: { source: string } };
    expect(web.seo.metaTitle.length).toBeLessThanOrEqual(60);
    expect(web.keywordSuggestions.source).toBe('ai-suggestion');

    // Editing creates a new version and archives the old one.
    const listed = await api.get(`/api/v1/content?productId=${product.id}`).expect(200);
    const ig = listed.body.find((x: { platform: string }) => x.platform === 'INSTAGRAM');
    const edited = { ...ig.contentData, variants: [{ body: 'Hand-edited caption', hashtags: [] }] };
    const v2 = await api.patch(`/api/v1/content/${ig.id}`).send({ contentData: edited, status: 'APPROVED' }).expect(200);
    expect(v2.body).toMatchObject({ version: 2, previousId: ig.id, status: 'APPROVED' });
    const after = await api.get(`/api/v1/content?productId=${product.id}`).expect(200);
    expect(after.body.map((x: { id: string }) => x.id)).not.toContain(ig.id);

    // Regenerating replaces the WEBSITE draft but keeps the approved INSTAGRAM v2.
    const regen = await api.post('/api/v1/ai/content').send({ productId: product.id, platforms: ['INSTAGRAM', 'WEBSITE'] }).expect(202);
    expect(await run(regen.body.id)).toBe('completed');
    const live = await api.get(`/api/v1/content?productId=${product.id}`).expect(200);
    const byPlatform = (pl: string) => live.body.filter((x: { platform: string }) => x.platform === pl);
    expect(byPlatform('WEBSITE')).toHaveLength(1);
    expect(byPlatform('INSTAGRAM').map((x: { status: string }) => x.status).sort()).toEqual(['APPROVED', 'DRAFT']);
    const webBody = (byPlatform('WEBSITE')[0].contentData as { variants: Array<{ body: string }> }).variants[0].body;
    expect(webBody.length).toBeGreaterThan(60); // body uses shortDescription limit, not metaTitle

    const usage = await api.get('/api/v1/billing/usage').expect(200);
    expect(usage.body.credits).toEqual({ balance: 14, reserved: 0, available: 14 });
    expect(usage.body.transactions.items.filter((x: { type: string }) => x.type === 'DEBIT').map((x: { amount: number }) => x.amount)).toEqual([-2, -2, -2]);
  });

  it('returns 402 when credits are insufficient and holds nothing', async () => {
    const { a, api, product } = await setup();
    await prisma.creditAccount.update({ where: { organizationId: a.orgId }, data: { balance: 1 } });
    const res = await api.post('/api/v1/ai/product-analysis').send({ productId: product.id }).expect(402);
    expect(res.body).toMatchObject({ available: 1, required: 2 });
    expect((await getCreditSummary(prisma, a.orgId)).reserved).toBe(0);
  });

  it('cancellation releases the hold without charging', async () => {
    const { a, api, product } = await setup();
    const job = await api.post('/api/v1/ai/product-analysis').send({ productId: product.id }).expect(202);
    await api.post(`/api/v1/ai/jobs/${job.body.id}/cancel`).expect(200);
    expect(await getCreditSummary(prisma, a.orgId)).toEqual({ balance: 20, reserved: 0, available: 20 });
    expect(await run(job.body.id)).toBe('cancelled'); // a late worker pickup is harmless
    expect(await getCreditSummary(prisma, a.orgId)).toEqual({ balance: 20, reserved: 0, available: 20 });
  });

  it('retryable failures keep the hold; final failure releases it', async () => {
    const { a, api, product } = await setup();
    const flaky = new MockAiProvider();
    let calls = 0;
    flaky.analyzeProduct = async () => {
      calls++;
      throw new RetryableProviderError('rate limited');
    };
    const job = await api.post('/api/v1/ai/product-analysis').send({ productId: product.id }).expect(202);

    await expect(run(job.body.id, false, flaky)).rejects.toThrow('rate limited');
    expect((await prisma.aIJob.findUniqueOrThrow({ where: { id: job.body.id } })).status).toBe('QUEUED');
    expect((await getCreditSummary(prisma, a.orgId)).reserved).toBe(2);

    expect(await run(job.body.id, true, flaky)).toBe('failed');
    const failed = await prisma.aIJob.findUniqueOrThrow({ where: { id: job.body.id } });
    expect(failed).toMatchObject({ status: 'FAILED', attempts: 2, error: 'rate limited' });
    expect(calls).toBe(2);
    expect(await getCreditSummary(prisma, a.orgId)).toEqual({ balance: 20, reserved: 0, available: 20 });
  });

  it('invalid provider output fails safely and releases credits', async () => {
    const { a, api, product } = await setup();
    const broken = new MockAiProvider();
    broken.analyzeProduct = async () => ({ model: 'x', output: { summary: '' } as never });
    const job = await api.post('/api/v1/ai/product-analysis').send({ productId: product.id }).expect(202);
    expect(await run(job.body.id, true, broken)).toBe('failed');
    const failed = await prisma.aIJob.findUniqueOrThrow({ where: { id: job.body.id } });
    expect(failed.error).toBe('The AI response did not match the expected format.');
    expect((await getCreditSummary(prisma, a.orgId)).available).toBe(20);
  });

  it('reservation and settlement are idempotent', async () => {
    const { a } = await setup();
    await reserveCredits(prisma, a.orgId, 'ref-1', 5);
    await reserveCredits(prisma, a.orgId, 'ref-1', 5);
    expect((await getCreditSummary(prisma, a.orgId)).reserved).toBe(5);
    await settleCredits(prisma, 'ref-1', 3);
    await settleCredits(prisma, 'ref-1', 3);
    expect(await getCreditSummary(prisma, a.orgId)).toEqual({ balance: 17, reserved: 0, available: 17 });
    expect(await prisma.creditTransaction.count({ where: { organizationId: a.orgId, type: 'DEBIT' } })).toBe(1);
  });

  it('concurrent reservations never overdraw', async () => {
    const { a } = await setup();
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => reserveCredits(prisma, a.orgId, `race-${i}`, 3)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(6); // 20 credits / 3 = 6
    expect(results.filter((r) => r.status === 'rejected').every((r) => r.reason instanceof InsufficientCreditsError)).toBe(true);
    expect(await getCreditSummary(prisma, a.orgId)).toEqual({ balance: 20, reserved: 18, available: 2 });
  });

  it('reconcile detects and repairs drift from the ledger', async () => {
    const { a } = await setup();
    await prisma.creditAccount.update({ where: { organizationId: a.orgId }, data: { balance: 999 } });
    const r = await reconcileCredits(prisma, a.orgId);
    expect(r).toEqual({ balance: 20, reserved: 0, drift: { balance: 979, reserved: 0 } });
    expect((await getCreditSummary(prisma, a.orgId)).balance).toBe(20);
  });
});
