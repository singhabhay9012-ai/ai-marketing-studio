'use client';

import { use, useCallback, useEffect, useState } from 'react';
import type { ChannelContent, Platform, ProductAnalysis } from '@amp/shared-types';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, PLATFORM_SPECS } from '@amp/validation';
import { Alert, Badge, Field, PageHeader, Spinner } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { useApi } from '@/lib/use-api';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  price: string | null;
  currency: string;
  features: string[];
  audience: string | null;
  status: string;
  analysis: (ProductAnalysis & { confirmedAt?: string; sourceJobId?: string }) | null;
  brand: { name: string };
  images: Array<{ id: string; mimeType: string }>;
}
interface Job {
  id: string;
  jobType: string;
  status: string;
  progress: number;
  error: string | null;
  outputData: unknown;
}
interface Asset {
  id: string;
  platform: Platform;
  version: number;
  status: string;
  contentData: ChannelContent;
}

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const canEdit = useCan('EDITOR');
  const product = useApi<Product>(`/products/${id}`);
  const jobs = useApi<{ items: Job[] }>(`/ai/jobs?productId=${id}&pageSize=10`);
  const content = useApi<Asset[]>(`/content?productId=${id}`);
  const [notice, setNotice] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const latest = (type: string) => jobs.data?.items.find((j) => j.jobType === type);
  const analysisJob = latest('PRODUCT_ANALYSIS');
  const contentJob = latest('CONTENT');
  const running = jobs.data?.items.some((j) => j.status === 'QUEUED' || j.status === 'PROCESSING');

  // Poll while a job is in flight.
  const { reload: reloadJobs } = jobs;
  const { reload: reloadProduct } = product;
  const { reload: reloadContent } = content;
  // Poll while a job runs, plus a few ticks after it finishes (fast jobs can
  // complete before the first poll, so "running" alone isn't enough).
  const [settleTicks, setSettleTicks] = useState(0);
  useEffect(() => {
    if (!running && settleTicks === 0) return;
    const t = setInterval(() => {
      void reloadJobs();
      void reloadProduct();
      void reloadContent();
      if (!running) setSettleTicks((n) => Math.max(0, n - 1));
    }, 1500);
    return () => clearInterval(t);
  }, [running, settleTicks, reloadJobs, reloadProduct, reloadContent]);

  async function start(path: string, body: unknown) {
    setNotice(null);
    try {
      await api(path, { body });
      setSettleTicks(3);
      await jobs.reload();
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    }
  }

  if (product.error) return <Alert>{product.error}</Alert>;
  if (!product.data) return <Spinner />;
  const p = product.data;

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={[p.brand.name, p.category, p.sku].filter(Boolean).join(' · ')}
        actions={<Badge value={p.status} />}
      />
      {notice && <div className="mb-6"><Alert kind={notice.kind}>{notice.text}</Alert></div>}

      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-8">
          <Images product={p} canEdit={canEdit} onChange={() => void product.reload()} />
          <Details product={p} canEdit={canEdit} onSaved={() => void product.reload()} />
        </div>

        <div className="space-y-8">
          <section>
            <Step n={1} title="Product analysis" done={Boolean(p.analysis)} />
            <p className="mb-4 text-muted">AI reads your photos and details, and flags anything it can’t confirm instead of guessing.</p>
            {analysisJob && analysisJob.status !== 'COMPLETED' && <JobStatus job={analysisJob} />}
            {analysisJob?.status === 'COMPLETED' && p.analysis?.sourceJobId !== analysisJob.id && canEdit ? (
              <ConfirmAnalysis job={analysisJob} onConfirmed={() => { void product.reload(); setNotice({ kind: 'ok', text: 'Analysis confirmed. Content will only use confirmed details.' }); }} />
            ) : p.analysis ? (
              <AnalysisSummary analysis={p.analysis} />
            ) : null}
            {canEdit && (
              <button className="btn-accent mt-4" disabled={running} onClick={() => start('/ai/product-analysis', { productId: id })}>
                {p.analysis ? 'Re-run analysis' : 'Analyse product'} · 2 credits
              </button>
            )}
          </section>

          <section>
            <Step n={2} title="Channel content" done={(content.data?.length ?? 0) > 0} />
            {!p.analysis ? (
              <p className="text-muted">Confirm the analysis first — public-facing copy is only generated from details you’ve approved.</p>
            ) : (
              <>
                {contentJob && contentJob.status !== 'COMPLETED' && <JobStatus job={contentJob} />}
                {canEdit && <GenerateContent disabled={running} onStart={(platforms) => start('/ai/content', { productId: id, platforms })} />}
                <div className="mt-6 space-y-4">
                  {content.data?.map((a) => <ContentCard key={a.id} asset={a} />)}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Step({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <h2 className="mb-1 flex items-center gap-3 text-xl">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs ${done ? 'bg-ok text-white' : 'bg-ink text-canvas'}`}>{done ? '✓' : n}</span>
      {title}
    </h2>
  );
}

function JobStatus({ job }: { job: Job }) {
  if (job.status === 'FAILED') return <Alert>Job failed: {job.error ?? 'unknown error'}. Credits were returned.</Alert>;
  if (job.status === 'CANCELLED') return <Alert kind="info">Job cancelled. Credits were returned.</Alert>;
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between text-xs text-muted"><span>{job.status === 'QUEUED' ? 'Queued…' : 'Working…'}</span><span>{job.progress}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent transition-all" style={{ width: `${Math.max(job.progress, 5)}%` }} /></div>
    </div>
  );
}

function ConfirmAnalysis({ job, onConfirmed }: { job: Job; onConfirmed: () => void }) {
  const original = job.outputData as ProductAnalysis;
  const [draft, setDraft] = useState<ProductAnalysis>(original);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    try {
      await api(`/ai/product-analysis/${job.id}/confirm`, { body: { analysis: draft } });
      onConfirmed();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <Alert kind="warn">Review before confirming. Edit anything that’s wrong — these details become the source of truth for your copy.</Alert>
      {error && <Alert>{error}</Alert>}
      <Field label="Summary"><textarea className="input" rows={3} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} /></Field>
      <Field label="Category"><input className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></Field>
      {draft.uncertain.length > 0 && (
        <div>
          <span className="label">Needs your confirmation</span>
          <ul className="space-y-2">
            {draft.uncertain.map((u, i) => (
              <li key={i} className="rounded-md border border-warn/30 bg-warn/5 p-3">
                <div className="flex justify-between text-xs"><span className="font-mono">{u.field}</span><span className="text-warn">{Math.round(u.confidence * 100)}% confident</span></div>
                <div className="mt-1">{u.value}</div>
                <div className="text-xs text-muted">{u.reason}</div>
                <button className="mt-2 text-xs underline" onClick={() => setDraft({ ...draft, uncertain: draft.uncertain.filter((_, j) => j !== i) })}>Dismiss</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {draft.missingInformation.length > 0 && (
        <p className="text-sm text-muted">Missing: {draft.missingInformation.join(', ')}. Add these to the product for stronger copy.</p>
      )}
      <button className="btn-primary" onClick={confirm}>Confirm analysis</button>
    </div>
  );
}

function AnalysisSummary({ analysis }: { analysis: ProductAnalysis & { confirmedAt?: string } }) {
  return (
    <div className="card space-y-3 p-5">
      <p>{analysis.summary}</p>
      {analysis.differentiators.length > 0 && <p className="text-sm"><span className="label inline">Differentiators</span> {analysis.differentiators.join(' · ')}</p>}
      {analysis.audienceHypotheses.length > 0 && <p className="text-sm"><span className="label inline">Audience</span> {analysis.audienceHypotheses.join(' · ')}</p>}
      {analysis.confirmedAt && <p className="font-mono text-xs text-ok">Confirmed {new Date(analysis.confirmedAt).toLocaleString()}</p>}
    </div>
  );
}

const CHANNELS: Platform[] = ['INSTAGRAM', 'FACEBOOK', 'WEBSITE', 'LINKEDIN', 'PINTEREST', 'GOOGLE_BUSINESS', 'GOOGLE_ADS', 'WHATSAPP', 'YOUTUBE'];

function GenerateContent({ disabled, onStart }: { disabled?: boolean; onStart: (p: Platform[]) => void }) {
  const [picked, setPicked] = useState<Platform[]>(['INSTAGRAM', 'WEBSITE']);
  const toggle = (p: Platform) => setPicked((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {CHANNELS.map((c) => (
          <button key={c} type="button" onClick={() => toggle(c)} aria-pressed={picked.includes(c)}
            className={`rounded-full border px-3 py-1 text-xs ${picked.includes(c) ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface hover:border-ink'}`}>
            {c.replace(/_/g, ' ').toLowerCase()}
          </button>
        ))}
      </div>
      <button className="btn-accent" disabled={disabled || picked.length === 0} onClick={() => onStart(picked)}>
        Generate for {picked.length} channel{picked.length === 1 ? '' : 's'} · {picked.length} credit{picked.length === 1 ? '' : 's'}
      </button>
    </div>
  );
}

function ContentCard({ asset }: { asset: Asset }) {
  const c = asset.contentData;
  const spec = PLATFORM_SPECS[asset.platform];
  const limit = spec.textLimits[spec.bodyField];
  return (
    <article className="card p-5">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-xs tracking-wider uppercase">{asset.platform.replace(/_/g, ' ')}</h3>
        <span className="flex items-center gap-2 text-xs text-muted">v{asset.version} <Badge value={asset.status} /></span>
      </header>
      <div className="space-y-3">
        {c.variants.map((v, i) => (
          <div key={i} className="rounded-md bg-canvas p-3">
            {v.headline && <div className="font-medium">{v.headline}</div>}
            <p className="whitespace-pre-wrap">{v.body}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              {v.cta && <span className="rounded bg-surface px-1.5 py-0.5">{v.cta}</span>}
              {v.hashtags?.join(' ')}
              {limit && <span className={`ml-auto font-mono ${v.body.length > limit ? 'text-bad' : ''}`}>{v.body.length}/{limit}</span>}
            </div>
          </div>
        ))}
        {c.seo && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Meta title</dt><dd>{c.seo.metaTitle}</dd>
            <dt className="text-muted">Meta description</dt><dd>{c.seo.metaDescription}</dd>
            <dt className="text-muted">Alt text</dt><dd>{c.seo.altText}</dd>
          </dl>
        )}
        <p className="text-xs text-muted">Keyword ideas (AI suggestions, not search-volume data): {c.keywordSuggestions.keywords.join(', ')}</p>
        {c.qualityWarnings.length > 0 && <Alert kind="warn">{c.qualityWarnings.join(' · ')}</Alert>}
      </div>
    </article>
  );
}

function Images({ product, canEdit, onChange }: { product: Product; canEdit: boolean; onChange: () => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadUrls = useCallback(async () => {
    const entries = await Promise.all(
      product.images.map(async (img) => [img.id, (await api<{ url: string }>(`/products/${product.id}/images/${img.id}/url`)).url] as const),
    );
    setUrls(Object.fromEntries(entries));
  }, [product.id, product.images]);
  useEffect(() => void loadUrls().catch(() => undefined), [loadUrls]);

  async function upload(file: File) {
    setError(null);
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return setError('Use a JPEG, PNG or WebP image.');
    if (file.size > MAX_IMAGE_BYTES) return setError('Images must be 10 MB or smaller.');
    setBusy(true);
    try {
      const { imageId, upload: u } = await api<{ imageId: string; upload: { url: string; method: string; headers: Record<string, string> } }>(
        `/products/${product.id}/images`,
        { body: { fileName: file.name, mimeType: file.type, fileSize: file.size } },
      );
      const put = await fetch(u.url, { method: u.method, headers: u.headers, body: file });
      if (!put.ok) throw new Error('Upload failed');
      await api(`/products/${product.id}/images/${imageId}/confirm`, { body: {} });
      onChange();
    } catch (e) {
      setError(e instanceof Error && !('status' in e) ? e.message : errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-xl">Photos</h2>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <div className="grid grid-cols-3 gap-2">
        {product.images.map((img) => (
          <div key={img.id} className="aspect-square overflow-hidden rounded-md border border-line bg-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {urls[img.id] && <img src={urls[img.id]} alt={`${product.name} photo`} className="h-full w-full object-cover" />}
          </div>
        ))}
        {canEdit && (
          <label className="flex aspect-square cursor-pointer items-center justify-center rounded-md border border-dashed border-line text-sm text-muted hover:border-ink hover:text-ink">
            {busy ? 'Uploading…' : '+ Add photo'}
            <input type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          </label>
        )}
      </div>
    </section>
  );
}

function Details({ product, canEdit, onSaved }: { product: Product; canEdit: boolean; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      await api(`/products/${product.id}`, {
        method: 'PATCH',
        body: {
          name: f.name,
          category: f.category || undefined,
          description: f.description || undefined,
          price: f.price ? Number(f.price) : undefined,
          audience: f.audience || undefined,
          features: f.features.split('\n').map((s) => s.trim()).filter(Boolean),
        },
      });
      setSaved(true);
      setError(null);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4" onChange={() => setSaved(false)}>
      <h2 className="text-xl">Details</h2>
      {error && <Alert>{error}</Alert>}
      {saved && <Alert kind="ok">Saved.</Alert>}
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Name"><input className="input" name="name" defaultValue={product.name} required /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category"><input className="input" name="category" defaultValue={product.category ?? ''} /></Field>
          <Field label={`Price (${product.currency})`}><input className="input" name="price" type="number" step="0.01" min="0" defaultValue={product.price ?? ''} /></Field>
        </div>
        <Field label="Description"><textarea className="input" rows={4} name="description" defaultValue={product.description ?? ''} /></Field>
        <Field label="Features" hint="One per line"><textarea className="input" rows={3} name="features" defaultValue={product.features.join('\n')} /></Field>
        <Field label="Target audience"><input className="input" name="audience" defaultValue={product.audience ?? ''} /></Field>
        {canEdit && <button className="btn-primary">Save details</button>}
      </fieldset>
    </form>
  );
}
