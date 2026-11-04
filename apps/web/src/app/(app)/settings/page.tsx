'use client';

import { useState } from 'react';
import type { OrgRole } from '@amp/shared-types';
import { Alert, Badge, Field, PageHeader, Spinner } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { useApi } from '@/lib/use-api';

interface Member {
  userId: string;
  role: OrgRole;
  user: { email: string; name: string | null };
}
interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
}
interface Usage {
  credits: { balance: number; reserved: number; available: number };
  transactions: { items: Array<{ id: string; type: string; amount: number; balanceAfter: number; description: string | null; createdAt: string }> };
}

const ASSIGNABLE: OrgRole[] = ['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER'];

export default function SettingsPage() {
  const { org, me } = useAuth();
  const isAdmin = useCan('ADMIN');
  const base = `/organizations/${org!.organizationId}`;
  const members = useApi<Member[]>(`${base}/members`);
  const invites = useApi<Invitation[]>(isAdmin ? `${base}/invitations` : null);
  const usage = useApi<Usage>('/billing/usage');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await Promise.all([members.reload(), isAdmin ? invites.reload() : null]);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as { email: string; role: OrgRole };
    await act(async () => {
      await api(`${base}/invitations`, { body: f, noOrg: true });
      setSent(f.email);
      form.reset();
    });
  }

  const canAssign = (r: OrgRole) => org!.role === 'OWNER' || (r !== 'ADMIN' && r !== 'OWNER');

  return (
    <>
      <PageHeader title="Settings" subtitle={`${org!.organizationName} · you are ${org!.role.toLowerCase()}`} />
      {error && <div className="mb-6"><Alert>{error}</Alert></div>}

      <section className="mb-10">
        <h2 className="mb-3 text-xl">Team</h2>
        {members.loading ? <Spinner /> : (
          <div className="card divide-y divide-line">
            {members.data?.map((m) => (
              <div key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-medium">{m.user.name ?? m.user.email}{m.userId === me?.id && <span className="text-muted"> (you)</span>}</div>
                  <div className="text-xs text-muted">{m.user.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && m.role !== 'OWNER' && m.userId !== me?.id ? (
                    <>
                      <select className="input w-auto py-1" value={m.role} onChange={(e) => act(() => api(`${base}/members/${m.userId}`, { method: 'PATCH', body: { role: e.target.value }, noOrg: true }))}>
                        {ASSIGNABLE.filter((r) => canAssign(r) || r === m.role).map((r) => <option key={r}>{r}</option>)}
                      </select>
                      <button className="text-xs text-bad hover:underline" onClick={() => act(() => api(`${base}/members/${m.userId}`, { method: 'DELETE', noOrg: true }))}>Remove</button>
                    </>
                  ) : (
                    <Badge value={m.role} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="mb-10">
          <h2 className="mb-3 text-xl">Invite someone</h2>
          {sent && <div className="mb-3"><Alert kind="ok">Invitation sent to {sent}.</Alert></div>}
          <form onSubmit={invite} className="card flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-64 flex-1"><Field label="Email"><input className="input" name="email" type="email" required /></Field></div>
            <Field label="Role">
              <select className="input" name="role" defaultValue="EDITOR">{ASSIGNABLE.filter(canAssign).map((r) => <option key={r}>{r}</option>)}</select>
            </Field>
            <button className="btn-primary">Send invitation</button>
          </form>
          {!!invites.data?.length && (
            <div className="card mt-3 divide-y divide-line">
              {invites.data.map((i) => (
                <div key={i.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{i.email} <span className="text-muted">· {i.role.toLowerCase()} · expires {new Date(i.expiresAt).toLocaleDateString()}</span></span>
                  <button className="text-xs text-muted hover:text-bad" onClick={() => act(() => api(`${base}/invitations/${i.id}`, { method: 'DELETE', noOrg: true }))}>Revoke</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xl">Credits</h2>
        {usage.data && (
          <>
            <p className="mb-3 text-muted">{usage.data.credits.available} available{usage.data.credits.reserved ? ` · ${usage.data.credits.reserved} held` : ''}. Paid plans and top-ups arrive with billing in Sprint 7.</p>
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs text-muted uppercase"><tr><th className="px-4 py-2 font-medium">When</th><th className="px-4 py-2 font-medium">Description</th><th className="px-4 py-2 text-right font-medium">Change</th><th className="px-4 py-2 text-right font-medium">Balance</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {usage.data.transactions.items.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2 text-muted">{new Date(t.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2">{t.description ?? t.type}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${t.amount < 0 ? 'text-bad' : 'text-ok'}`}>{t.amount > 0 ? '+' : ''}{t.amount}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{t.balanceAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
