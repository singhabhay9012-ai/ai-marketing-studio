/**
 * Content-Security-Policy for the web app.
 *
 * Scripts are allowed only with a per-request nonce ('strict-dynamic' lets Next.js's
 * nonce'd loader pull in its own chunks). Network and image access is limited to this
 * origin, the API origin and, when configured, the file-storage origin used for signed
 * upload/download URLs (S3/R2). Pure function so it can be unit-tested.
 */
export interface CspOptions {
  nonce: string;
  /** e.g. http://localhost:4000/api/v1 — only its origin is used. */
  apiUrl: string;
  /** Optional origin of signed storage URLs, e.g. https://bucket.s3.ap-south-1.amazonaws.com */
  storageOrigin?: string;
  /** Development needs 'unsafe-eval' for React Refresh / webpack. */
  isDev: boolean;
}

/** Returns the origin of a URL, or null if it isn't a valid absolute http(s) URL. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, apiUrl, storageOrigin, isDev }: CspOptions): string {
  const api = originOf(apiUrl);
  const storage = originOf(storageOrigin);
  const remote = [...new Set([api, storage].filter((o): o is string => !!o))];

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // Tailwind and React style props (brand colour swatches, progress bars) need inline styles.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...remote],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...remote, ...(isDev ? ['ws:'] : [])],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'worker-src': ["'self'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };

  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  // Only upgrade when the API itself is HTTPS; on plain-http localhost it would break API calls.
  if (!isDev && api?.startsWith('https:')) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

/** 128-bit random nonce, base64-encoded (Edge and Node runtimes both provide Web Crypto). */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
