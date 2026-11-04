'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthTokens, MeResponse } from '@amp/shared-types';
import { api, refreshSession, session } from './api';

type Membership = MeResponse['memberships'][number];

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  org: Membership | null;
  switchOrg: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name: string; organizationName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const data = await api<MeResponse>('/auth/me', { noOrg: true });
    setMe(data);
    const stored = session.storedOrg();
    const pick = data.memberships.find((m) => m.organizationId === stored) ?? data.memberships[0];
    session.setOrg(pick?.organizationId ?? null);
    setOrgId(pick?.organizationId ?? null);
  }, []);

  useEffect(() => {
    session.onAuthLost(() => {
      session.setToken(null);
      setMe(null);
      router.replace('/auth/login');
    });
    (async () => {
      try {
        if (await refreshSession()) await reload();
      } finally {
        setLoading(false);
      }
    })();
  }, [reload, router]);

  const value = useMemo<AuthState>(
    () => ({
      me,
      loading,
      org: me?.memberships.find((m) => m.organizationId === orgId) ?? null,
      switchOrg: (id) => {
        session.setOrg(id);
        setOrgId(id);
      },
      login: async (email, password) => {
        const t = await api<AuthTokens>('/auth/login', { body: { email, password } });
        session.setToken(t.accessToken);
        await reload();
      },
      register: async (input) => {
        const t = await api<AuthTokens>('/auth/register', { body: input });
        session.setToken(t.accessToken);
        await reload();
      },
      logout: async () => {
        await api('/auth/logout', { body: {} }).catch(() => undefined);
        session.setToken(null);
        session.setOrg(null);
        setMe(null);
        router.replace('/auth/login');
      },
      reload,
    }),
    [me, loading, orgId, reload, router],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

const RANK = { VIEWER: 10, EDITOR: 20, MANAGER: 30, ADMIN: 40, OWNER: 50 } as const;
export function useCan(min: keyof typeof RANK) {
  const { org } = useAuth();
  return org ? RANK[org.role] >= RANK[min] : false;
}
