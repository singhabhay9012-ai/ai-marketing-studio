'use client';

import { useState } from 'react';
import { brandSchema } from '@amp/validation';
import { Alert, Empty, Field, PageHeader, Spinner } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { useApi } from '@/lib/use-api';

interface Brand {
  id: string;
  name: string;
  colors: string[];
  fonts: string[];
  voice: string | null;
  audience: string | null;
  _count?: { products: number };
}

export default function BrandsPage() {
  const { data, loading, reload } = useApi<Brand[]>('/brands');
  const canEdit = useCan('MANAGER');
  const [editing, setEditing] = useState<Brand | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Brands"
        subtitle="Brand memory: logo, colours, typography and voice used across every campaign."
        actions={canEdit && <button className="btn-primary" onClick={() => setEditing('new')}>New brand</button>}
      />
      {editing && <BrandForm brand={editing === 'new' ? null : editing} onDone={() => { setEditing(null); void reload(); }} />}
      {loading ? (
        <Spinner />
      ) : data?.length === 0 ? (
        <Empty title="No brands yet">Products belong to a brand. Create one to begin.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data?.map((b) => (
            <article key={b.id} className="card p-5">
              <div className="flex items-start justify-between">
                <h2 className="text-xl">{b.name}</h2>
                {canEdit && <button className="text-sm text-muted hover:text-ink" onClick={() => setEditing(b)}>Edit</button>}
              </div>
              <div className="mt-3 flex gap-1.5">
                {b.colors.map((c) => (
                  <span key={c} title={c} className="h-6 w-6 rounded-full border border-line" style={{ background: c }} />
                ))}
              </div>
              {b.voice && <p className="mt-3 text-muted">“{b.voice}”</p>}
              <p className="mt-3 font-mono text-xs text-muted">
                {b._count?.products ?? 0} products{b.fonts.length ? ` · ${b.fonts.join(', ')}` : ''}
              </p>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function BrandForm({ brand, onDone }: { brand: Brand | null; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
    const input = { name: f.name, colors: list(f.colors), fonts: list(f.fonts), voice: f.voice || undefined, audience: f.audience || undefined };
    const parsed = brandSchema.safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
    setBusy(true);
    try {
      const { guidelines: _g, ...body } = parsed.data;
      await api(brand ? `/brands/${brand.id}` : '/brands', { method: brand ? 'PATCH' : 'POST', body });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-8 grid gap-4 p-6 md:grid-cols-2">
      <h2 className="text-xl md:col-span-2">{brand ? `Edit ${brand.name}` : 'New brand'}</h2>
      {error && <div className="md:col-span-2"><Alert>{error}</Alert></div>}
      <Field label="Name"><input className="input" name="name" defaultValue={brand?.name} required /></Field>
      <Field label="Colours" hint="Comma-separated hex, e.g. #0F172A, #F97316"><input className="input font-mono" name="colors" defaultValue={brand?.colors.join(', ')} /></Field>
      <Field label="Fonts" hint="Comma-separated"><input className="input" name="fonts" defaultValue={brand?.fonts.join(', ')} /></Field>
      <Field label="Audience"><input className="input" name="audience" defaultValue={brand?.audience ?? ''} /></Field>
      <div className="md:col-span-2">
        <Field label="Tone of voice"><textarea className="input" rows={2} name="voice" defaultValue={brand?.voice ?? ''} placeholder="Warm, confident and practical" /></Field>
      </div>
      <div className="flex gap-2 md:col-span-2">
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save brand'}</button>
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
