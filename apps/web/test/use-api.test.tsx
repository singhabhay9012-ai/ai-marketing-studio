import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';

const api = vi.fn();
let org: { organizationId: string } | null = { organizationId: 'o1' };

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: (...a: unknown[]): unknown => api(...a) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ org }) }));

beforeEach(() => {
  api.mockReset();
  org = { organizationId: 'o1' };
});

describe('useApi', () => {
  it('loads data for the active organisation', async () => {
    api.mockResolvedValue([{ id: 1 }]);
    const { result } = renderHook(() => useApi<{ id: number }[]>('/brands'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(result.current.error).toBeNull();
  });

  it('exposes a readable error when the request fails', async () => {
    api.mockRejectedValue(new ApiError(500, 'Server exploded'));
    const { result } = renderHook(() => useApi('/brands'));
    await waitFor(() => expect(result.current.error).toBe('Server exploded'));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('does not fetch without an organisation or a path', () => {
    org = null;
    renderHook(() => useApi('/brands'));
    renderHook(() => useApi(null));
    expect(api).not.toHaveBeenCalled();
  });
});
