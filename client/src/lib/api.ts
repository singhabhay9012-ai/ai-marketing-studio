'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
  }
}

/**
 * Access token lives in memory only. The refresh token is an httpOnly cookie
 * set by the API, so page scripts can never read it.
 */
let accessToken: string | null = null;
let organizationId: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onAuthLost: (() => void) | null = null;

export const session = {
  setToken: (t: string | null) => (accessToken = t),
  hasToken: () => accessToken !== null,
  setOrg: (id: string | null) => {
    organizationId = id;
    try {
      if (id) localStorage.setItem('amp.org', id);
      else localStorage.removeItem('amp.org');
    } catch {
      /* storage unavailable */
    }
  },
  getOrg: () => organizationId,
  storedOrg: () => {
    try {
      return localStorage.getItem('amp.org');
    } catch {
      return null;
    }
  },
  onAuthLost: (fn: () => void) => (onAuthLost = fn),
};

/** Single-flight refresh so parallel 401s trigger one rotation, not several. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) return false;
      accessToken = ((await res.json()) as { accessToken: string }).accessToken;
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

/** Error body shape returned by the API (Nest defaults + ZodPipe). */
interface ErrorBody {
  message?: string | string[];
  errors?: Array<{ path: string; message: string }>;
}

interface Options {
  method?: string;
  body?: unknown;
  raw?: BodyInit;
  contentType?: string;
  /** Omit the organisation header (account-level routes). */
  noOrg?: boolean;
}

export async function api<T = unknown>(path: string, opts: Options = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (organizationId && !opts.noOrg) headers['x-organization-id'] = organizationId;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.contentType) headers['Content-Type'] = opts.contentType;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.raw ? 'POST' : 'GET'),
    headers,
    credentials: 'include',
    body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, opts, false);
    onAuthLost?.();
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as ErrorBody;
  if (!res.ok) {
    const message = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? res.statusText);
    throw new ApiError(res.status, message, data.errors ?? []);
  }
  return data as T;
}

export function errorText(e: unknown) {
  if (e instanceof ApiError) {
    if (e.errors.length) return e.errors.map((x) => (x.path ? `${x.path}: ${x.message}` : x.message)).join(' · ');
    return e.message;
  }
  return 'Something went wrong. Please try again.';
}
