import { addMember, as, bootApp, createBrand, createProduct, prisma, resetDb, signUp, TestApp } from './helpers';

/**
 * MVP acceptance criterion: "A user from one organisation cannot access another
 * organisation's products, assets, jobs or integrations."
 */
describe('Tenant isolation and roles', () => {
  let t: TestApp;
  beforeAll(async () => {
    await resetDb();
    t = await bootApp();
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  it('requires an organisation context on org-scoped routes', async () => {
    const a = await signUp(t);
    await as(t, a).get('/api/v1/products').expect(400);
    await as(t, a, 'not-a-uuid').get('/api/v1/products').expect(400);
  });

  it('blocks access to another organisation by header', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await as(t, b, a.orgId).get('/api/v1/products').expect(403);
    await as(t, b, a.orgId).get('/api/v1/brands').expect(403);
    await as(t, b, a.orgId).get('/api/v1/billing/usage').expect(403);
    await as(t, b, a.orgId).get('/api/v1/ai/jobs').expect(403);
    await as(t, b).get(`/api/v1/organizations/${a.orgId}`).expect(403);
    await as(t, b).get(`/api/v1/organizations/${a.orgId}/members`).expect(403);
  });

  it("returns 404 for another org's resources even with a valid own-org header", async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    const brandA = await createBrand(t, a);
    const productA = await createProduct(t, a, brandA.id);

    await as(t, b, b.orgId).get(`/api/v1/products/${productA.id}`).expect(404);
    await as(t, b, b.orgId).patch(`/api/v1/products/${productA.id}`).send({ name: 'pwned' }).expect(404);
    await as(t, b, b.orgId).delete(`/api/v1/products/${productA.id}`).expect(404);
    await as(t, b, b.orgId).get(`/api/v1/brands/${brandA.id}`).expect(404);
    await as(t, b, b.orgId).post(`/api/v1/products/${productA.id}/images`).send({ fileName: 'x.png', mimeType: 'image/png', fileSize: 100 }).expect(404);
    await as(t, b, b.orgId).post('/api/v1/ai/product-analysis').send({ productId: productA.id }).expect(404);

    // Cannot attach a product in B to A's brand either.
    await as(t, b, b.orgId).post('/api/v1/products').send({ brandId: brandA.id, name: 'Sneaky' }).expect(404);

    const untouched = await prisma.product.findUniqueOrThrow({ where: { id: productA.id } });
    expect(untouched.name).toBe('Linen Shirt');
  });

  it('lists only own-organisation data', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await createProduct(t, a, (await createBrand(t, a)).id);
    const list = await as(t, b, b.orgId).get('/api/v1/products').expect(200);
    expect(list.body.total).toBe(0);
  });

  it('rejects mismatched URL and header organisations', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await as(t, a, b.orgId).get(`/api/v1/organizations/${a.orgId}`).expect(400);
  });

  it('enforces role hierarchy on write operations', async () => {
    const owner = await signUp(t);
    const brand = await createBrand(t, owner);
    const viewer = await addMember(t, owner, 'VIEWER');
    const editor = await addMember(t, owner, 'EDITOR');
    const manager = await addMember(t, owner, 'MANAGER');

    await as(t, viewer, owner.orgId).get('/api/v1/products').expect(200);
    await as(t, viewer, owner.orgId).post('/api/v1/products').send({ brandId: brand.id, name: 'No' }).expect(403);

    const p = await as(t, editor, owner.orgId).post('/api/v1/products').send({ brandId: brand.id, name: 'Yes' }).expect(201);
    await as(t, editor, owner.orgId).delete(`/api/v1/products/${p.body.id}`).expect(403);
    await as(t, editor, owner.orgId).post('/api/v1/brands').send({ name: 'Nope' }).expect(403);

    await as(t, manager, owner.orgId).post('/api/v1/brands').send({ name: 'Manager brand' }).expect(201);
    await as(t, manager, owner.orgId).delete(`/api/v1/products/${p.body.id}`).expect(204);
    await as(t, manager, owner.orgId).delete(`/api/v1/brands/${brand.id}`).expect(403);
    await as(t, manager).post(`/api/v1/organizations/${owner.orgId}/invitations`).send({ email: 'x@test.dev', role: 'VIEWER' }).expect(403);
  });

  it('invitations: role limits, email binding, single use', async () => {
    const owner = await signUp(t);
    const admin = await addMember(t, owner, 'ADMIN');

    // Admins can't create peers; owners can. Nobody can invite an OWNER.
    await as(t, admin).post(`/api/v1/organizations/${owner.orgId}/invitations`).send({ email: 'peer@test.dev', role: 'ADMIN' }).expect(403);
    await as(t, owner).post(`/api/v1/organizations/${owner.orgId}/invitations`).send({ email: 'peer@test.dev', role: 'ADMIN' }).expect(201);
    await as(t, owner).post(`/api/v1/organizations/${owner.orgId}/invitations`).send({ email: 'boss@test.dev', role: 'OWNER' }).expect(400);

    const intended = await signUp(t, { org: null });
    const stranger = await signUp(t, { org: null });
    await as(t, admin).post(`/api/v1/organizations/${owner.orgId}/invitations`).send({ email: intended.email, role: 'EDITOR' }).expect(201);
    const token = t.mail.outbox.filter((m) => m.to === intended.email).at(-1)!.meta!.token;

    await as(t, stranger).post('/api/v1/invitations/accept').send({ token }).expect(403);
    const ok = await as(t, intended).post('/api/v1/invitations/accept').send({ token }).expect(200);
    expect(ok.body).toEqual({ organizationId: owner.orgId, role: 'EDITOR' });
    await as(t, intended).post('/api/v1/invitations/accept').send({ token }).expect(400);
  });

  it('member management: cannot remove owner, cannot self-promote, admins cannot touch admins', async () => {
    const owner = await signUp(t);
    const admin = await addMember(t, owner, 'ADMIN');
    const admin2 = await addMember(t, owner, 'ADMIN');
    const editor = await addMember(t, owner, 'EDITOR');
    const base = `/api/v1/organizations/${owner.orgId}/members`;

    await as(t, admin).delete(`${base}/${owner.userId}`).expect(400);
    await as(t, admin).patch(`${base}/${admin.userId}`).send({ role: 'OWNER' }).expect(400);
    await as(t, admin).patch(`${base}/${admin2.userId}`).send({ role: 'VIEWER' }).expect(403);
    await as(t, admin).patch(`${base}/${editor.userId}`).send({ role: 'MANAGER' }).expect(200);
    await as(t, admin).patch(`${base}/${editor.userId}`).send({ role: 'ADMIN' }).expect(403);

    // Members can leave on their own; afterwards they lose access.
    await as(t, editor).delete(`${base}/${editor.userId}`).expect(204);
    await as(t, editor, owner.orgId).get('/api/v1/products').expect(403);
  });

  it('soft-deleted organisations become inaccessible', async () => {
    const owner = await signUp(t);
    const admin = await addMember(t, owner, 'ADMIN');
    await as(t, admin).delete(`/api/v1/organizations/${owner.orgId}`).expect(403);
    await as(t, owner).delete(`/api/v1/organizations/${owner.orgId}`).expect(204);
    await as(t, owner, owner.orgId).get('/api/v1/products').expect(403);
    const mine = await as(t, owner).get('/api/v1/organizations').expect(200);
    expect(mine.body).toHaveLength(0);
  });
});
