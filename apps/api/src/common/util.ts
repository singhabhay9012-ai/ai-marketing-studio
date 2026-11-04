import { createHash, randomBytes } from 'node:crypto';

/** URL-safe random token for refresh/reset/invite links. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Tokens are stored hashed; a DB leak doesn't yield usable tokens. */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  );
}

export function parsePagination(query: { page?: string; pageSize?: string }) {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? '20', 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
