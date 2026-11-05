import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductsPage from '@/app/(app)/products/page';

interface Result {
  data: unknown;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: () => void;
}
const results: Record<string, Result> = {};
const useApi = vi.fn((path: string | null) => results[(path ?? '').split('?')[0]]);
let canEdit = true;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/use-api', () => ({ useApi: (p: string | null) => useApi(p) }));
vi.mock('@/lib/auth', () => ({ useCan: () => canEdit }));

const res = (data: unknown, over: Partial<Result> = {}): Result => ({
  data,
  error: null,
  loading: false,
  reload: () => Promise.resolve(),
  setData: () => undefined,
  ...over,
});

beforeEach(() => {
  canEdit = true;
  useApi.mockClear();
  results['/products'] = res({ items: [], total: 0 });
  results['/brands'] = res([{ id: 'b1', name: 'Acme' }]);
});

describe('ProductsPage', () => {
  it('shows a loading indicator while fetching', () => {
    results['/products'] = res(null, { loading: true });
    render(<ProductsPage />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the empty state when there are no products', () => {
    render(<ProductsPage />);
    expect(screen.getByText('No products yet')).toBeInTheDocument();
    expect(screen.getByText('Add a product or import a CSV.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows "No matches" after a search returns nothing', async () => {
    render(<ProductsPage />);
    await userEvent.setup().type(screen.getByPlaceholderText(/Search name/), 'zzz{Enter}');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(useApi.mock.calls.some(([p]) => p?.includes('search=zzz'))).toBe(true);
  });

  it('renders products with brand, SKU, price and status', () => {
    results['/products'] = res({
      total: 1,
      items: [{ id: 'p1', name: 'Ghee', sku: 'G-1', category: 'Food', price: '499', currency: 'INR', status: 'ACTIVE', brand: { name: 'Acme' }, updatedAt: '' }],
    });
    render(<ProductsPage />);
    expect(screen.getByRole('link', { name: 'Ghee' })).toHaveAttribute('href', '/products/p1');
    expect(screen.getByText('G-1')).toBeInTheDocument();
    expect(screen.getByText('INR 499')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('1 products')).toBeInTheDocument();
  });

  it('hides create/import actions from users who cannot edit', () => {
    canEdit = false;
    render(<ProductsPage />);
    expect(screen.queryByRole('button', { name: 'New product' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bulk import' })).not.toBeInTheDocument();
  });

  it('warns that a brand is needed first when none exist', async () => {
    results['/brands'] = res([]);
    render(<ProductsPage />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'New product' }));
    expect(screen.getByText(/Create a brand first/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to brands' })).toHaveAttribute('href', '/brands');
  });

  it('shows an error with a retry instead of an empty table when loading fails', async () => {
    const reload = vi.fn(() => Promise.resolve());
    results['/products'] = res(null, { error: 'Network error', reload });
    render(<ProductsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.t load this page: Network error/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('No products yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined products/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
