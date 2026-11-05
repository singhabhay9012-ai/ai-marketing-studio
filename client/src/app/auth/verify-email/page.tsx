'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui';
import { api, errorText } from '@/lib/api';

export default function VerifyEmailPage() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<string>('pending') // 'pending' | 'ok' | error text;

  useEffect(() => {
    if (!token) return setState('This link is incomplete.');
    api('/auth/verify-email', { body: { token } })
      .then(() => setState('ok'))
      .catch((e) => setState(errorText(e)));
  }, [token]);

  return (
    <div className="space-y-5">
      <h1 className="text-3xl">Email verification</h1>
      {state === 'pending' && <p className="text-muted">Verifying…</p>}
      {state === 'ok' && <Alert kind="ok">Your email is verified.</Alert>}
      {state !== 'pending' && state !== 'ok' && <Alert>{state}</Alert>}
      <Link href="/dashboard" className="btn-primary w-full">
        Continue
      </Link>
    </div>
  );
}
