import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkProductRowSchema, checkTextAgainstSpec, inviteMemberSchema, productSchema, registerSchema } from './index';

test('register rejects weak passwords', () => {
  const r = registerSchema.safeParse({ email: 'a@b.co', password: 'short', name: 'A' });
  assert.equal(r.success, false);
});

test('register normalises email', () => {
  const r = registerSchema.parse({ email: '  Foo@Example.COM ', password: 'longenough1', name: 'A' });
  assert.equal(r.email, 'foo@example.com');
});

test('invitations cannot grant OWNER', () => {
  assert.equal(inviteMemberSchema.safeParse({ email: 'x@y.co', role: 'OWNER' }).success, false);
  assert.equal(inviteMemberSchema.safeParse({ email: 'x@y.co', role: 'EDITOR' }).success, true);
});

test('sale price may not exceed price', () => {
  const r = productSchema.safeParse({
    brandId: '00000000-0000-4000-8000-000000000000',
    name: 'X',
    price: 100,
    salePrice: 150,
  });
  assert.equal(r.success, false);
});

test('bulk row splits pipe-delimited features and blanks optional fields', () => {
  const r = bulkProductRowSchema.parse({ name: 'Mug', features: 'Ceramic | 350ml', sku: '', price: '' });
  assert.deepEqual(r.features, ['Ceramic', '350ml']);
  assert.equal(r.sku, undefined);
  assert.equal(r.price, undefined);
});

test('platform spec flags over-long captions and hashtags', () => {
  const v = checkTextAgainstSpec('INSTAGRAM', { caption: 'x'.repeat(2300) }, Array(31).fill('#a'));
  assert.equal(v.length, 2);
});
