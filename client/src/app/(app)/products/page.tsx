'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Badge, Empty, Field, LoadError, PageHeader, Spinner } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { useApi } from '@/lib/use-api';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  price: string | null;
  currency: string;
  status: string;
  brand: { name: string };
  updatedAt: string;
}
interface Brand {
  id: string;
  name: string;
}
interface ImportResult {
  batch: { totalRows: number; importedRows: number; invalidRows: number };
  failedRows: Array<{ rowNumber: number; errors: Array<{ field: string; message: string }> }>;
}

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'new' | 'import' | null>(null);
  const canEdit = useCan('EDITOR');
  const products = useApi<{ items: Product[]; total: number }>(`/products?pageSize=50${query ? `&search=${encodeURIComponent(query)}` : ''}`);
  const brands = useApi<Brand[]>('/brands');

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Upload product photos and details once; every campaign builds on them."
        actions={
          canEdit && (
            <>
              <button className="btn-ghost" onClick={() => setPanel(panel === 'import' ? null : 'import')}>Bulk import</button>
              <button className="btn-primary" onClick={() => setPanel(panel === 'new' ? null : 'new')}>New product</button>
            </>
          )
        }
      />

      {panel && brands.data?.length === 0 && <div className="mb-6"><Alert kind="warn">Create a brand first — every product belongs to one. <Link className="underline" href="/brands">Go to brands</Link></Alert></div>}
      {panel === 'new' && !!brands.data?.length && <NewProduct brands={brands.data} />}
      {panel === 'import' && !!brands.data?.length && <BulkImport brands={brands.data} onDone={() => void products.reload()} />}

      <form onSubmit={(e) => { e.preventDefault(); setQuery(search); }} className="mb-4 flex gap-2">
        <input className="input max-w-sm" placeholder="Search name, SKU or category" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-ghost">Search</button>
      </form>

      {products.error && products.data && <div className="mb-4"><LoadError message={products.error} onRetry={() => void products.reload()} /></div>}
      {products.loading ? (
        <Spinner />
      ) : products.error && !products.data ? (
        <LoadError message={products.error} onRetry={() => void products.reload()} />
      ) : products.data?.items.length === 0 ? (
        <Empty title={query ? 'No matches' : 'No products yet'}>{!query && 'Add a product or import a CSV.'}</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-line text-xs text-muted uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Product</th>
                <th className="px-4 py-2 font-medium">Brand</th>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.data?.items.map((p) => (
                <tr key={p.id} className="hover:bg-canvas">
                  <td className="px-4 py-2.5">
                    <Link href={`/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    {p.category && <div className="text-xs text-muted">{p.category}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{p.brand.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.sku ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.price ? `${p.currency} ${Number(p.price).toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-2.5"><Badge value={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-line px-4 py-2 text-xs text-muted">{products.data?.total} products</div>
        </div>
      )}
    </>
  );
}

function NewProduct({ brands }: { brands: Brand[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const p = await api<{ id: string }>('/products', {
        body: {
          brandId: f.brandId,
          name: f.name,
          category: f.category || undefined,
          sku: f.sku || undefined,
          price: f.price ? Number(f.price) : undefined,
          description: f.description || undefined,
          features: f.features.split('\n').map((s) => s.trim()).filter(Boolean),
        },
      });
      router.push(`/products/${p.id}`);
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <form onSubmit={submit} className="card mb-8 grid gap-4 p-6 md:grid-cols-3">
      {error && <div className="md:col-span-3"><Alert>{error}</Alert></div>}
      <Field label="Name"><input className="input" name="name" required /></Field>
      <Field label="Brand">
        <select className="input" name="brandId">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </Field>
      <Field label="Category"><input className="input" name="category" /></Field>
      <Field label="SKU"><input className="input font-mono" name="sku" /></Field>
      <Field label="Price (INR)"><input className="input" name="price" type="number" min="0" step="0.01" /></Field>
      <div />
      <div className="md:col-span-2"><Field label="Description"><textarea className="input" rows={3} name="description" /></Field></div>
      <Field label="Features" hint="One per line"><textarea className="input" rows={3} name="features" /></Field>
      <div className="md:col-span-3"><button className="btn-primary">Create product</button></div>
    </form>
  );
}

function BulkImport({ brands, onDone }: { brands: Brand[]; onDone: () => void }) {
  const [brandId, setBrandId] = useState(brands[0].id);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<ImportResult>(`/products/import?brandId=${brandId}&fileName=${encodeURIComponent(file.name)}`, { raw: await file.text(), contentType: 'text/csv' });
      setResult(r);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-8 space-y-4 p-6">
      <div>
        <h2 className="text-xl">Bulk import</h2>
        <p className="text-muted">
          CSV with columns <code className="font-mono text-xs">name, sku, category, description, price, currency, features</code>. Separate features with <code className="font-mono">|</code>. Up to 1,000 rows.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Import into brand">
          <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </Field>
        <label className="btn-primary cursor-pointer">
          {busy ? 'Importing…' : 'Choose CSV'}
          <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        </label>
      </div>
      {error && <Alert>{error}</Alert>}
      {result && (
        <div className="space-y-2">
          <Alert kind={result.batch.invalidRows ? 'warn' : 'ok'}>
            Imported {result.batch.importedRows} of {result.batch.totalRows} rows.{result.batch.invalidRows ? ` ${result.batch.invalidRows} need attention.` : ''}
          </Alert>
          {result.failedRows.length > 0 && (
            <ul className="divide-y divide-line rounded-md border border-line text-sm">
              {result.failedRows.map((r) => (
                <li key={r.rowNumber} className="flex gap-4 px-3 py-2">
                  <span className="w-16 shrink-0 font-mono text-xs text-muted">Row {r.rowNumber}</span>
                  <span>{r.errors.map((e) => `${e.field}: ${e.message}`).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
