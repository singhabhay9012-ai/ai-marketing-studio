import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandsPage from '@/app/(app)/brands/page';

interface Result {
  data: unknown;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: () => void;
}
let result: Result;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/use-api', () => ({ useApi: () => result }));
vi.mock('@/lib/auth', () => ({ useCan: () => true }));

const res = (data: unknown, over: Partial<Result> = {}): Result => ({
  data,
  error: null,
  loading: false,
  reload: () => Promise.resolve(),
  setData: () => undefined,
  ...over,
});

beforeEach(() => {
  result = res([]);
});

describe('BrandsPage', () => {
  it('shows the empty state when there are no brands', () => {
    render(<BrandsPage />);
    expect(screen.getByText('No brands yet')).toBeInTheDocument();
  });

  it('lists brands with their product count', () => {
    result = res([{ id: 'b1', name: 'Acme', colors: ['#112233'], fonts: [], voice: null, guidelines: null, _count: { products: 3 } }]);
    render(<BrandsPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByText(/3 products/)).toBeInTheDocument();
  });

  it('shows an error with a retry instead of the empty state when loading fails', async () => {
    const reload = vi.fn(() => Promise.resolve());
    result = res(null, { error: 'Network error', reload });
    render(<BrandsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.t load this page: Network error/);
    expect(screen.queryByText('No brands yet')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('BrandsPage after a failed reload', () => {
  it('keeps the loaded brands visible and shows the error above them', () => {
    result = res([{ id: 'b1', name: 'Acme', colors: [], fonts: [], voice: null, guidelines: null, _count: { products: 0 } }], {
      error: 'Network error',
    });
    render(<BrandsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Network error/);
    expect(screen.getByRole('heading', { level: 2, name: 'Acme' })).toBeInTheDocument();
  });
});
