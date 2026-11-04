'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Field } from '@/components/ui';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await login(text(f.get('email')), text(f.get('password')));
      // Only follow same-origin relative paths (no open redirect).
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-3xl">Sign in</h1>
        <p className="mt-1 text-muted">Welcome back.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Field label="Email">
        <input className="input" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password">
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="flex justify-between text-sm">
        <Link href="/auth/forgot-password" className="text-muted underline-offset-4 hover:underline">
          Forgot password?
        </Link>
        <Link href={`/auth/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-accent underline-offset-4 hover:underline">
          Create account
        </Link>
      </div>
    </form>
  );
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}
