'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { registerSchema } from '@amp/validation';
import { Alert, Field } from '@/components/ui';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  // Joining via invite: no new workspace needed.
  const joining = Boolean(next?.startsWith('/auth/accept-invite'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const input = { email: f.email, password: f.password, name: f.name, ...(joining ? {} : { organizationName: f.organizationName }) };
    // Same Zod schema the API uses — instant feedback, identical rules.
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues.map((i) => i.message).join(' · '));
    setBusy(true);
    setError(null);
    try {
      await register(parsed.data);
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-3xl">Create your account</h1>
        <p className="mt-1 text-muted">{joining ? 'Then you’ll join the team that invited you.' : 'Set up a workspace for your business.'}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Field label="Your name">
        <input className="input" name="name" autoComplete="name" required />
      </Field>
      <Field label="Email">
        <input className="input" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" hint="At least 10 characters, with a letter and a number.">
        <input className="input" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      {!joining && (
        <Field label="Business name">
          <input className="input" name="organizationName" required minLength={2} />
        </Field>
      )}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
      <p className="text-sm text-muted">
        Already have an account?{' '}
        <Link href="/auth/login" className="font-medium text-accent underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
