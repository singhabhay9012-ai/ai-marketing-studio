import { describe, expect, it } from 'vitest';
import { buildCsp, createNonce, originOf } from '@/lib/csp';
import robots from '@/app/robots';

const directives = (csp: string) => Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));

describe('Content-Security-Policy', () => {
  const base = { nonce: 'abc123', apiUrl: 'http://localhost:4000/api/v1', isDev: false };

  it('allows scripts only with the nonce, and blocks objects, framing and foreign forms', () => {
    const d = directives(buildCsp(base));
    expect(d['script-src']).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(d['script-src']).not.toContain("'unsafe-inline'");
    expect(d['script-src']).not.toContain("'unsafe-eval'");
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['frame-ancestors']).toEqual(["'none'"]);
    expect(d['base-uri']).toEqual(["'self'"]);
    expect(d['form-action']).toEqual(["'self'"]);
  });

  it('allows network and images only to self, the API origin and the storage origin', () => {
    const d = directives(buildCsp({ ...base, storageOrigin: 'https://bucket.s3.ap-south-1.amazonaws.com' }));
    expect(d['connect-src']).toEqual(["'self'", 'http://localhost:4000', 'https://bucket.s3.ap-south-1.amazonaws.com']);
    expect(d['img-src']).toEqual(["'self'", 'data:', 'blob:', 'http://localhost:4000', 'https://bucket.s3.ap-south-1.amazonaws.com']);
  });

  it('ignores an invalid storage origin and de-duplicates origins', () => {
    expect(directives(buildCsp({ ...base, storageOrigin: 'javascript:alert(1)' }))['connect-src']).toEqual(["'self'", 'http://localhost:4000']);
    expect(directives(buildCsp({ ...base, storageOrigin: 'http://localhost:4000/files' }))['connect-src']).toEqual(["'self'", 'http://localhost:4000']);
  });

  it('adds unsafe-eval and websockets only in development', () => {
    const d = directives(buildCsp({ ...base, isDev: true }));
    expect(d['script-src']).toContain("'unsafe-eval'");
    expect(d['connect-src']).toContain('ws:');
  });

  it('upgrades insecure requests only when the API is served over HTTPS', () => {
    expect(buildCsp(base)).not.toContain('upgrade-insecure-requests');
    expect(buildCsp({ ...base, apiUrl: 'https://api.example.com/api/v1' })).toContain('upgrade-insecure-requests');
  });

  it('parses origins safely', () => {
    expect(originOf('https://api.example.com/api/v1')).toBe('https://api.example.com');
    expect(originOf('not a url')).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });

  it('creates a fresh, unguessable nonce per call', () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
  });
});

describe('robots.txt', () => {
  it('disallows indexing of every route', () => {
    expect(robots()).toEqual({ rules: [{ userAgent: '*', disallow: '/' }] });
  });
});
