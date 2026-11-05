import { as, bootApp, prisma, resetDb, signUp, TestApp } from './helpers';

describe('Auth', () => {
  let t: TestApp;
  beforeAll(async () => {
    await resetDb();
    t = await bootApp();
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  it('registers, creates an organisation with OWNER role and initial credits', async () => {
    const a = await signUp(t, { org: 'Acme Retail' });
    const me = await as(t, a).get('/api/v1/auth/me').expect(200);
    expect(me.body.memberships).toEqual([expect.objectContaining({ organizationName: 'Acme Retail', role: 'OWNER', slug: 'acme-retail' })]);

    const usage = await as(t, a, a.orgId).get('/api/v1/billing/usage').expect(200);
    expect(usage.body.credits).toEqual({ balance: 20, reserved: 0, available: 20 });
    expect(usage.body.transactions.items[0]).toMatchObject({ type: 'CREDIT', amount: 20, balanceAfter: 20 });
  });

  it('rejects duplicate emails, weak passwords and unknown fields', async () => {
    const a = await signUp(t);
    await t.http().post('/api/v1/auth/register').send({ email: a.email.toUpperCase(), password: 'Sup3rSecretPass', name: 'x' }).expect(409);
    const weak = await t.http().post('/api/v1/auth/register').send({ email: 'weak@test.dev', password: 'short', name: 'x' }).expect(400);
    expect(weak.body.errors[0].path).toBe('password');
    const extra = await t.http().post('/api/v1/auth/register').send({ email: 'x@test.dev', password: 'Sup3rSecretPass', name: 'x', isAdmin: true }).expect(400);
    expect(extra.body.errors).toEqual([{ path: 'isAdmin', message: 'Unknown field' }]);
  });

  it('logs in with correct credentials only, with the same error for unknown emails', async () => {
    const a = await signUp(t);
    await t.http().post('/api/v1/auth/login').send({ email: a.email, password: 'Sup3rSecretPass' }).expect(200);
    const wrong = await t.http().post('/api/v1/auth/login').send({ email: a.email, password: 'nope-nope-1' }).expect(401);
    const unknown = await t.http().post('/api/v1/auth/login').send({ email: 'ghost@test.dev', password: 'nope-nope-1' }).expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('requires a valid bearer token on protected routes', async () => {
    await t.http().get('/api/v1/auth/me').expect(401);
    await t.http().get('/api/v1/auth/me').set('authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('rotates refresh tokens and revokes the family when an old token is replayed', async () => {
    const a = await signUp(t);
    const r1 = await t.http().post('/api/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(a.refreshToken);

    // Replaying the first (rotated) token = theft signal.
    await t.http().post('/api/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    // ...which also kills the legitimately rotated token.
    await t.http().post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
  });

  it('accepts the refresh token from the httpOnly cookie', async () => {
    const a = await signUp(t);
    const login = await t.http().post('/api/v1/auth/login').send({ email: a.email, password: 'Sup3rSecretPass' }).expect(200);
    const cookie = login.headers['set-cookie'] as unknown as string[];
    expect(cookie[0]).toMatch(/amp_refresh=.*HttpOnly.*SameSite=Strict/i);
    await t.http().post('/api/v1/auth/refresh').set('Cookie', cookie[0].split(';')[0]).send({}).expect(200);
  });

  it('logout revokes the session', async () => {
    const a = await signUp(t);
    await t.http().post('/api/v1/auth/logout').send({ refreshToken: a.refreshToken }).expect(204);
    await t.http().post('/api/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
  });

  it('password reset: generic response, single-use token, signs out all sessions', async () => {
    const a = await signUp(t);
    const unknown = await t.http().post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.dev' }).expect(202);
    const known = await t.http().post('/api/v1/auth/forgot-password').send({ email: a.email }).expect(202);
    expect(known.body).toEqual(unknown.body);

    const token = t.mail.outbox.filter((m) => m.to === a.email && m.subject.includes('Reset')).at(-1)!.meta!.token;
    await t.http().post('/api/v1/auth/reset-password').send({ token, password: 'BrandNewPass99' }).expect(204);
    await t.http().post('/api/v1/auth/reset-password').send({ token, password: 'AnotherPass99' }).expect(400);

    await t.http().post('/api/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await t.http().post('/api/v1/auth/login').send({ email: a.email, password: 'Sup3rSecretPass' }).expect(401);
    await t.http().post('/api/v1/auth/login').send({ email: a.email, password: 'BrandNewPass99' }).expect(200);
  });

  it('verifies email with a one-time token', async () => {
    const a = await signUp(t);
    const token = t.mail.outbox.filter((m) => m.to === a.email && m.subject.includes('Verify')).at(-1)!.meta!.token;
    await t.http().post('/api/v1/auth/verify-email').send({ token }).expect(204);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: a.userId } });
    expect(user.emailVerifiedAt).not.toBeNull();
    await t.http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
  });

  it('rate-limits credential endpoints', async () => {
    process.env.THROTTLE_DISABLED = 'false';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        statuses.push((await t.http().post('/api/v1/auth/login').send({ email: 'rl@test.dev', password: 'whatever-1' })).status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
    } finally {
      process.env.THROTTLE_DISABLED = 'true';
    }
  });

  it('stores only hashes of refresh tokens', async () => {
    const a = await signUp(t);
    const stored = await prisma.session.findMany({ where: { userId: a.userId } });
    expect(stored.some((s) => s.tokenHash === a.refreshToken)).toBe(false);
  });
});
