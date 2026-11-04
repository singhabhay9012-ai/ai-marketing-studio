import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@amp/database';
import { createApp } from '../src/bootstrap';
import { MailService } from '../src/common/core.module';

export const prisma = new PrismaClient();

/** Wipes every table (except migrations) and re-inserts reference data. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);

  const effectiveFrom = new Date('2026-01-01T00:00:00Z');
  await prisma.plan.create({ data: { code: 'free', name: 'Free', priceMinor: 0, monthlyCredits: 20, effectiveFrom } });
  await prisma.creditCost.createMany({
    data: [
      { jobType: 'PRODUCT_ANALYSIS', credits: 2, effectiveFrom },
      { jobType: 'STRATEGY', credits: 3, effectiveFrom },
      { jobType: 'CONTENT', credits: 1, effectiveFrom },
      { jobType: 'IMAGE_GENERATION', credits: 5, effectiveFrom },
    ],
  });
}

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  mail: MailService;
  close: () => Promise<void>;
}

export async function bootApp(): Promise<TestApp> {
  const app = await createApp();
  await app.init();
  return {
    app,
    http: () => request(app.getHttpServer()),
    mail: app.get(MailService),
    close: async () => {
      await app.close();
    },
  };
}

let counter = 0;
export interface Actor {
  userId: string;
  email: string;
  token: string;
  refreshToken: string;
  orgId: string;
}

/** Registers a user with their own organisation. */
export async function signUp(t: TestApp, opts: { email?: string; org?: string | null } = {}): Promise<Actor> {
  counter++;
  const email = opts.email ?? `user${counter}-${Date.now()}@test.dev`;
  const res = await t
    .http()
    .post('/api/v1/auth/register')
    .send({ email, password: 'Sup3rSecretPass', name: `User ${counter}`, ...(opts.org === null ? {} : { organizationName: opts.org ?? `Org ${counter}` }) })
    .expect(201);
  const me = await t.http().get('/api/v1/auth/me').set('authorization', `Bearer ${res.body.accessToken}`).expect(200);
  return { userId: me.body.id, email, token: res.body.accessToken, refreshToken: res.body.refreshToken, orgId: me.body.memberships[0]?.organizationId };
}

/** Authenticated request builder scoped to an organisation. */
export function as(t: TestApp, actor: Pick<Actor, 'token'>, orgId?: string) {
  const wrap = (r: request.Test) => {
    r.set('authorization', `Bearer ${actor.token}`);
    if (orgId) r.set('x-organization-id', orgId);
    return r;
  };
  return {
    get: (url: string) => wrap(t.http().get(url)),
    post: (url: string) => wrap(t.http().post(url)),
    patch: (url: string) => wrap(t.http().patch(url)),
    put: (url: string) => wrap(t.http().put(url)),
    delete: (url: string) => wrap(t.http().delete(url)),
  };
}

/** Invite + accept, returning the new member as an Actor in `orgId`. */
export async function addMember(t: TestApp, owner: Actor, role: 'ADMIN' | 'MANAGER' | 'EDITOR' | 'VIEWER'): Promise<Actor> {
  const member = await signUp(t, { org: null });
  await as(t, owner).post(`/api/v1/organizations/${owner.orgId}/invitations`).send({ email: member.email, role }).expect(201);
  const token = t.mail.outbox.filter((m) => m.to === member.email).at(-1)!.meta!.token;
  await as(t, member).post('/api/v1/invitations/accept').send({ token }).expect(200);
  return { ...member, orgId: owner.orgId };
}

export async function createBrand(t: TestApp, actor: Actor, name = 'Brand') {
  const res = await as(t, actor, actor.orgId).post('/api/v1/brands').send({ name, colors: ['#112233'] }).expect(201);
  return res.body as { id: string };
}

export async function createProduct(t: TestApp, actor: Actor, brandId: string, extra: Record<string, unknown> = {}) {
  const res = await as(t, actor, actor.orgId)
    .post('/api/v1/products')
    .send({ brandId, name: 'Linen Shirt', price: 1999, features: ['100% linen'], ...extra })
    .expect(201);
  return res.body as { id: string; slug: string };
}

// Minimal valid PNG (1×1) for upload tests.
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
