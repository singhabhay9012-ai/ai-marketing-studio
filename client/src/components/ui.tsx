'use client';

import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div>
        <h1 className="text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'ok' | 'warn' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-bad/30 bg-bad/5 text-bad',
    ok: 'border-ok/30 bg-ok/5 text-ok',
    warn: 'border-warn/30 bg-warn/5 text-warn',
    info: 'border-line bg-canvas text-muted',
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  );
}

/** Shown when a list or page fails to load, with a way to try again. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert>
      <span>Couldn&apos;t load this page: {message}</span>{' '}
      <button type="button" className="underline" onClick={onRetry}>
        Try again
      </button>
    </Alert>
  );
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-ok/10 text-ok',
  COMPLETED: 'bg-ok/10 text-ok',
  APPROVED: 'bg-ok/10 text-ok',
  UPLOADED: 'bg-ok/10 text-ok',
  DRAFT: 'bg-line text-muted',
  QUEUED: 'bg-line text-muted',
  PROCESSING: 'bg-accent-soft text-accent',
  ANALYSIS_PENDING: 'bg-accent-soft text-accent',
  REVIEW: 'bg-accent-soft text-accent',
  FAILED: 'bg-bad/10 text-bad',
  CANCELLED: 'bg-line text-muted',
  ARCHIVED: 'bg-line text-muted',
};

export function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] tracking-wide ${STATUS_TONE[value] ?? 'bg-line text-muted'}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <p className="font-display text-xl">{title}</p>
      {children && <div className="mt-2 max-w-md text-muted">{children}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="py-12 text-center text-muted">Loading…</div>;
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="card p-5">
      <div className="label">{label}</div>
      <div className="font-display text-3xl">{value}</div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  );
}
