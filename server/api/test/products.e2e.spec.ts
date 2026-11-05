import { as, bootApp, createBrand, createProduct, PNG_1PX, prisma, resetDb, signUp, TestApp } from './helpers';

describe('Brands and products', () => {
  let t: TestApp;
  beforeAll(async () => {
    await resetDb();
    t = await bootApp();
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  it('brand CRUD with validated colours and soft delete', async () => {
    const a = await signUp(t);
    const api = as(t, a, a.orgId);
    await api.post('/api/v1/brands').send({ name: 'Bad', colors: ['red'] }).expect(400);
    const b = await api.post('/api/v1/brands').send({ name: 'Good', colors: ['#AABBCC'], fonts: ['Inter'], voice: 'Calm', guidelines: { emoji: 'no' } }).expect(201);
    const patched = await api.patch(`/api/v1/brands/${b.body.id}`).send({ voice: 'Bold' }).expect(200);
    expect(patched.body).toMatchObject({ voice: 'Bold', colors: ['#AABBCC'], fonts: ['Inter'] }); // PATCH doesn't reset defaults
    await api.delete(`/api/v1/brands/${b.body.id}`).expect(204);
    await api.get(`/api/v1/brands/${b.body.id}`).expect(404);
  });

  it('product create/update/list/search/archive', async () => {
    const a = await signUp(t);
    const api = as(t, a, a.orgId);
    const brand = await createBrand(t, a);

    const p1 = await createProduct(t, a, brand.id, { sku: 'LS-1', category: 'Apparel' });
    const p2 = await createProduct(t, a, brand.id);
    expect(p1.slug).toBe('linen-shirt');
    expect(p2.slug).not.toBe(p1.slug);

    await api.post('/api/v1/products').send({ brandId: brand.id, name: 'Dup', sku: 'LS-1' }).expect(409);
    await api.post('/api/v1/products').send({ brandId: brand.id, name: 'X', price: 10, salePrice: 20 }).expect(400);
    await api.patch(`/api/v1/products/${p1.id}`).send({ salePrice: 5000 }).expect(400); // > existing price 1999

    const updated = await api.patch(`/api/v1/products/${p1.id}`).send({ description: 'Breathable', salePrice: 1499 }).expect(200);
    expect(updated.body).toMatchObject({ description: 'Breathable', salePrice: '1499', price: '1999' });

    const search = await api.get('/api/v1/products?search=apparel').expect(200);
    expect(search.body.items.map((p: { id: string }) => p.id)).toEqual([p1.id]);

    await api.delete(`/api/v1/products/${p1.id}`).expect(204);
    const list = await api.get('/api/v1/products').expect(200);
    expect(list.body.total).toBe(1);
    const archived = await api.get('/api/v1/products?status=ARCHIVED').expect(200);
    expect(archived.body.total).toBe(1);
  });

  it('signed image upload: request → PUT → confirm → signed download', async () => {
    const a = await signUp(t);
    const api = as(t, a, a.orgId);
    const product = await createProduct(t, a, (await createBrand(t, a)).id);

    const req = await api.post(`/api/v1/products/${product.id}/images`).send({ fileName: 'shirt.png', mimeType: 'image/png', fileSize: PNG_1PX.length }).expect(201);
    const { imageId, upload } = req.body;
    expect(upload.method).toBe('PUT');
    const uploadPath = new URL(upload.url).pathname;

    // Wrong content type and oversized bodies are refused by the signature.
    await t.http().put(uploadPath).set('content-type', 'image/jpeg').send(PNG_1PX).expect(400);
    await t.http().put(uploadPath).set('content-type', 'image/png').send(Buffer.concat([PNG_1PX, Buffer.alloc(10)])).expect(400);
    await t.http().put(uploadPath).set('content-type', 'image/png').send(PNG_1PX).expect(200);
    // Tampered signature is refused.
    await t.http().put(uploadPath.slice(0, -2) + 'xx').set('content-type', 'image/png').send(PNG_1PX).expect(403);

    const confirmed = await api.post(`/api/v1/products/${product.id}/images/${imageId}/confirm`).expect(200);
    expect(confirmed.body.status).toBe('UPLOADED');
    expect(confirmed.body.storageKey.startsWith(`orgs/${a.orgId}/`)).toBe(true);

    const dl = await api.get(`/api/v1/products/${product.id}/images/${imageId}/url`).expect(200);
    const file = await t.http().get(new URL(dl.body.url).pathname).expect(200);
    expect(Buffer.compare(file.body, PNG_1PX)).toBe(0);

    const detail = await api.get(`/api/v1/products/${product.id}`).expect(200);
    expect(detail.body.images).toHaveLength(1);
  });

  it('rejects uploads whose bytes are not the declared image type', async () => {
    const a = await signUp(t);
    const api = as(t, a, a.orgId);
    const product = await createProduct(t, a, (await createBrand(t, a)).id);
    const fake = Buffer.from('<?php echo "not an image"; ?>');
    const req = await api.post(`/api/v1/products/${product.id}/images`).send({ fileName: 'x.png', mimeType: 'image/png', fileSize: fake.length }).expect(201);
    await t.http().put(new URL(req.body.upload.url).pathname).set('content-type', 'image/png').send(fake).expect(200);
    const res = await api.post(`/api/v1/products/${product.id}/images/${req.body.imageId}/confirm`).expect(400);
    expect(res.body.message).toMatch(/does not match/);
    await api.post('/api/v1/products/x/images').expect(400);
    await api.post(`/api/v1/products/${product.id}/images`).send({ fileName: 'x.gif', mimeType: 'image/gif', fileSize: 10 }).expect(400);
    await api.post(`/api/v1/products/${product.id}/images`).send({ fileName: 'x.png', mimeType: 'image/png', fileSize: 50 * 1024 * 1024 }).expect(400);
  });

  it('bulk CSV import reports successful and failed rows with reasons', async () => {
    const a = await signUp(t);
    const api = as(t, a, a.orgId);
    const brand = await createBrand(t, a);
    await createProduct(t, a, brand.id, { sku: 'EXISTING' });

    const csv = [
      'Name,SKU,Category,Price,Currency,Features',
      'Cotton Tee,TEE-1,Apparel,499,INR,Soft|Breathable',
      ',TEE-2,Apparel,499,INR,',
      'Wool Cap,TEE-1,Accessories,299,INR,',
      'Silk Scarf,EXISTING,Accessories,999,INR,',
      'Canvas Bag,,Bags,abc,INR,',
      'Steel Bottle,,Kitchen,,,',
    ].join('\n');

    const res = await api.post(`/api/v1/products/import?brandId=${brand.id}&fileName=catalog.csv`).set('content-type', 'text/csv').send(csv).expect(201);
    expect(res.body.batch).toMatchObject({ totalRows: 6, importedRows: 2, invalidRows: 4, status: 'COMPLETED' });
    const reasons = Object.fromEntries(res.body.failedRows.map((r: { rowNumber: number; errors: Array<{ field: string; message: string }> }) => [r.rowNumber, r.errors.map((e) => e.field)]));
    expect(reasons).toEqual({ 3: ['name'], 4: ['sku'], 5: ['sku'], 6: ['price'] });

    const batch = await api.get(`/api/v1/products/import/${res.body.batch.id}`).expect(200);
    expect(batch.body.rows).toHaveLength(6);
    const tee = await prisma.product.findFirstOrThrow({ where: { organizationId: a.orgId, sku: 'TEE-1' } });
    expect(tee.features).toEqual(['Soft', 'Breathable']);
  });
});
