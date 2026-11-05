'use client';

import Link from 'next/link';
import { Badge, Empty, PageHeader, Spinner, Stat } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';

interface Usage {
  credits: { balance: number; reserved: number; available: number };
  counts: { products: number; members: number; brands: number };
}
interface Job {
  id: string;
  jobType: string;
  status: string;
  createdAt: string;
  productId: string | null;
  error: string | null;
}

export default function DashboardPage() {
  const { org } = useAuth();
  const usage = useApi<Usage>('/billing/usage');
  const jobs = useApi<{ items: Job[] }>('/ai/jobs?pageSize=8');

  return (
    <>
      <PageHeader title={org?.organizationName ?? 'Dashboard'} subtitle="Workspace overview, recent AI jobs and credit usage." />
      {!usage.data ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Credits available" value={usage.data.credits.available} note={usage.data.credits.reserved ? `${usage.data.credits.reserved} held by running jobs` : undefined} />
          <Stat label="Products" value={usage.data.counts.products} />
          <Stat label="Brands" value={usage.data.counts.brands} />
          <Stat label="Team members" value={usage.data.counts.members} />
        </div>
      )}

      {usage.data && usage.data.counts.brands === 0 && (
        <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="text-xl">Start with your brand</h2>
            <p className="text-muted">Colours, fonts and tone of voice feed every piece of content we generate.</p>
          </div>
          <Link href="/brands" className="btn-accent">
            Set up brand
          </Link>
        </div>
      )}

      <h2 className="mt-10 mb-3 text-xl">Recent AI jobs</h2>
      {jobs.data?.items.length === 0 ? (
        <Empty title="No jobs yet">Open a product and run an analysis to get started.</Empty>
      ) : (
        <div className="card divide-y divide-line">
          {jobs.data?.items.map((j) => (
            <Link key={j.id} href={j.productId ? `/products/${j.productId}` : '#'} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-canvas">
              <span className="font-mono text-xs">{j.jobType.replace(/_/g, ' ').toLowerCase()}</span>
              <span className="truncate text-xs text-bad">{j.status === 'FAILED' ? j.error : ''}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted">{new Date(j.createdAt).toLocaleString()}</span>
                <Badge value={j.status} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
