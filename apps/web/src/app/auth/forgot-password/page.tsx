'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Field } from '@/components/ui';
import { api, errorText } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await api('/auth/forgot-password', { body: { email: new FormData(e.currentTarget).get('email') } });
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <h1 className="text-3xl">Reset password</h1>
      {sent ? (
        <Alert kind="ok">If an account exists for that email, we’ve sent a reset link. It expires in one hour.</Alert>
      ) : (
        <>
          {error && <Alert>{error}</Alert>}
          <Field label="Email">
            <input className="input" name="email" type="email" required />
          </Field>
          <button className="btn-primary w-full">Send reset link</button>
        </>
      )}
      <Link href="/auth/login" className="block text-sm text-muted hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
