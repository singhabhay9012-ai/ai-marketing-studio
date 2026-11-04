'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AcceptInvitePage() {
  const token = useSearchParams().get('token') ?? '';
  const { me, loading, reload, switchOrg } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const here = `/auth/accept-invite?token=${encodeURIComponent(token)}`;

  async function accept() {
    try {
      const r = await api<{ organizationId: string }>('/invitations/accept', { body: { token }, noOrg: true });
      await reload();
      switchOrg(r.organizationId);
      router.replace('/dashboard');
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (loading) return null;
  if (!token) return <Alert>This invitation link is incomplete.</Alert>;
  return (
    <div className="space-y-5">
      <h1 className="text-3xl">You’ve been invited</h1>
      {error && <Alert>{error}</Alert>}
      {me ? (
        <>
          <p className="text-muted">
            Signed in as <strong className="text-ink">{me.email}</strong>. The invitation must match this email.
          </p>
          <button onClick={accept} className="btn-primary w-full">
            Accept invitation
          </button>
        </>
      ) : (
        <div className="flex gap-2">
          <Link href={`/auth/login?next=${encodeURIComponent(here)}`} className="btn-primary flex-1">
            Sign in
          </Link>
          <Link href={`/auth/register?next=${encodeURIComponent(here)}`} className="btn-ghost flex-1">
            Create account
          </Link>
        </div>
      )}
    </div>
  );
}
