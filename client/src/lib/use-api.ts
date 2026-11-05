'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from './api';
import { useAuth } from './auth';

/** Minimal data hook: refetches when the active organisation changes. */
export function useApi<T>(path: string | null) {
  const { org } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!path || !org) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [path, org]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}
