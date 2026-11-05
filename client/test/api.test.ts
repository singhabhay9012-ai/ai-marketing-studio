import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ApiModule = typeof import('@/lib/api');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let mod: ApiModule;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.resetModules(); // api.ts keeps token/org in module state
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  mod = await import('@/lib/api');
});
afterEach(() => vi.unstubAllGlobals());

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: url as string, init: init as RequestInit, headers: (init?.headers ?? {}) as Record<string, string> };
}

describe('api()', () => {
  it('sends bearer token, organisation header and JSON body', async () => {
    mod.session.setToken('tok');
    mod.session.setOrg('org_1');
    fetchMock.mockResolvedValueOnce(json({ id: 'p1' }));

    const out = await mod.api<{ id: string }>('/products', { body: { name: 'X' } });

    expect(out).toEqual({ id: 'p1' });
    const c = lastCall();
    expect(c.url).toBe(`${mod.API_URL}/products`);
    expect(c.init.method).toBe('POST');
    expect(c.init.credentials).toBe('include');
    expect(c.init.body).toBe(JSON.stringify({ name: 'X' }));
    expect(c.headers).toMatchObject({ Authorization: 'Bearer tok', 'x-organization-id': 'org_1', 'Content-Type': 'application/json' });
  });

  it('defaults to GET and omits org header with noOrg', async () => {
    mod.session.setOrg('org_1');
    fetchMock.mockResolvedValueOnce(json({}));
    await mod.api('/auth/me', { noOrg: true });
    const c = lastCall();
    expect(c.init.method).toBe('GET');
    expect(c.headers['x-organization-id']).toBeUndefined();
    expect(c.headers.Authorization).toBeUndefined();
  });

  it('persists the organisation to localStorage and clears it', () => {
    mod.session.setOrg('org_9');
    expect(mod.session.storedOrg()).toBe('org_9');
    mod.session.setOrg(null);
    expect(mod.session.storedOrg()).toBeNull();
  });

  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(mod.api('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('maps error bodies to ApiError (array messages joined, field errors kept)', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: ['a bad', 'b bad'] }, 400));
    await expect(mod.api('/x')).rejects.toMatchObject({ status: 400, message: 'a bad, b bad' });

    fetchMock.mockResolvedValueOnce(json({ message: 'Validation failed', errors: [{ path: 'email', message: 'Invalid' }] }, 422));
    const err = await mod.api('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(mod.ApiError);
    expect((err as InstanceType<ApiModule['ApiError']>).errors).toEqual([{ path: 'email', message: 'Invalid' }]);
  });

  it('falls back to statusText when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 502, statusText: 'Bad Gateway' }));
    await expect(mod.api('/x')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
  });

  it('on 401 refreshes once, stores the new token and retries the request', async () => {
    mod.session.setToken('old');
    fetchMock
      .mockResolvedValueOnce(json({ message: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'new' }))
      .mockResolvedValueOnce(json({ ok: true }));

    await expect(mod.api('/brands')).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(`${mod.API_URL}/auth/refresh`);
    const retry = lastCall();
    expect(retry.url).toBe(`${mod.API_URL}/brands`);
    expect(retry.headers.Authorization).toBe('Bearer new');
  });

  it('when refresh fails it calls onAuthLost and throws the 401', async () => {
    const lost = vi.fn();
    mod.session.onAuthLost(lost);
    fetchMock.mockResolvedValueOnce(json({ message: 'Unauthorized' }, 401)).mockResolvedValueOnce(json({}, 401));

    await expect(mod.api('/brands')).rejects.toMatchObject({ status: 401 });
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('does not attempt refresh for /auth/ routes (wrong password is a plain error)', async () => {
    const lost = vi.fn();
    mod.session.onAuthLost(lost);
    fetchMock.mockResolvedValueOnce(json({ message: 'Invalid credentials' }, 401));

    await expect(mod.api('/auth/login', { body: { email: 'a', password: 'b' } })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid credentials',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lost).not.toHaveBeenCalled();
  });

  it('does not retry more than once if the retried request is still 401', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ message: 'no' }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'new' }))
      .mockResolvedValueOnce(json({ message: 'still no' }, 401));
    await expect(mod.api('/brands')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('refreshSession()', () => {
  it('is single-flight: parallel callers share one refresh request', async () => {
    fetchMock.mockResolvedValue(json({ accessToken: 't' }));
    const [a, b] = await Promise.all([mod.refreshSession(), mod.refreshSession()]);
    expect([a, b]).toEqual([true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves false on network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    await expect(mod.refreshSession()).resolves.toBe(false);
  });
});

describe('errorText()', () => {
  it('formats field errors, plain ApiError messages and unknown errors', () => {
    expect(mod.errorText(new mod.ApiError(422, 'x', [{ path: 'email', message: 'Invalid' }, { path: '', message: 'Bad' }]))).toBe(
      'email: Invalid · Bad',
    );
    expect(mod.errorText(new mod.ApiError(409, 'Email already registered'))).toBe('Email already registered');
    expect(mod.errorText(new Error('secret internals'))).toBe('Something went wrong. Please try again.');
  });
});
