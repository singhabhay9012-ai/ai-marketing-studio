'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const NAV: Array<{ href: string; label: string; soon?: string }> = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/brands', label: 'Brands' },
  { href: '/products', label: 'Products' },
  { href: '/campaigns', label: 'Campaigns', soon: 'Sprint 4' },
  { href: '/creative-studio', label: 'Creative studio', soon: 'Sprint 5' },
  { href: '/marketing-kits', label: 'Marketing kits', soon: 'Sprint 6' },
  { href: '/publishing', label: 'Publishing', soon: 'Later phase' },
  { href: '/analytics', label: 'Analytics', soon: 'Later phase' },
  { href: '/settings', label: 'Settings' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, loading, org, switchOrg, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace(`/auth/login?next=${encodeURIComponent(path)}`);
  }, [loading, me, router, path]);
  useEffect(() => setOpen(false), [path]);

  if (loading || !me) return <Spinner />;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <span className="font-display text-lg">Workspace</span>
        <button className="btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="sidenav">
          Menu
        </button>
      </header>

      <aside id="sidenav" className={`${open ? 'block' : 'hidden'} border-r border-line bg-surface lg:sticky lg:top-0 lg:block lg:h-screen`}>
        <div className="flex h-full flex-col p-4">
          <div className="mb-6 hidden px-2 lg:block">
            <span className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">Marketing</span>
            <div className="font-display text-xl">Workspace</div>
          </div>

          {me.memberships.length > 0 && (
            <label className="mb-5 block">
              <span className="label px-2">Organisation</span>
              <select className="input" value={org?.organizationId ?? ''} onChange={(e) => switchOrg(e.target.value)}>
                {me.memberships.map((m) => (
                  <option key={m.organizationId} value={m.organizationId}>
                    {m.organizationName} · {m.role.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          )}

          <nav className="flex-1 space-y-0.5">
            {NAV.map((n) => {
              const active = path === n.href || path.startsWith(`${n.href}/`);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 ${active ? 'bg-ink text-canvas' : 'text-ink hover:bg-canvas'} ${n.soon && !active ? 'text-muted' : ''}`}
                >
                  {n.label}
                  {n.soon && <span className="font-mono text-[10px] opacity-60">soon</span>}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 border-t border-line pt-4 text-xs">
            <div className="truncate px-2 text-muted">{me.email}</div>
            <button onClick={logout} className="mt-1 px-2 text-muted underline-offset-4 hover:text-ink hover:underline">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-10">
        {org ? children : <NoOrg />}
      </main>
    </div>
  );
}

function NoOrg() {
  const { reload, switchOrg } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { api, errorText } = await import('@/lib/api');
    try {
      const org = await api<{ id: string }>('/organizations', { body: { name }, noOrg: true });
      await reload();
      switchOrg(org.id);
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <form onSubmit={create} className="card mx-auto mt-16 max-w-md space-y-4 p-8">
      <h1 className="text-2xl">Create a workspace</h1>
      <p className="text-muted">You’re not part of any organisation yet. Create one, or ask a teammate for an invitation.</p>
      {error && <p className="text-sm text-bad">{error}</p>}
      <input className="input" placeholder="Business name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      <button className="btn-primary w-full">Create</button>
    </form>
  );
}
