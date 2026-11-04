'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Field } from '@/components/ui';
import { api, errorText } from '@/lib/api';

export default function ResetPasswordPage() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await api('/auth/reset-password', { body: { token, password: new FormData(e.currentTarget).get('password') } });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!token) return <Alert>This reset link is incomplete. Request a new one.</Alert>;
  return (
    <form onSubmit={submit} className="space-y-5">
      <h1 className="text-3xl">Choose a new password</h1>
      {done ? (
        <>
          <Alert kind="ok">Password updated. You’ve been signed out everywhere for safety.</Alert>
          <Link href="/auth/login" className="btn-primary w-full">
            Sign in
          </Link>
        </>
      ) : (
        <>
          {error && <Alert>{error}</Alert>}
          <Field label="New password" hint="At least 10 characters, with a letter and a number.">
            <input className="input" name="password" type="password" autoComplete="new-password" required minLength={10} />
          </Field>
          <button className="btn-primary w-full">Update password</button>
        </>
      )}
    </form>
  );
}
