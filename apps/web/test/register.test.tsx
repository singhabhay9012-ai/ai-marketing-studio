import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import RegisterPage from '@/app/auth/register/page';

const replace = vi.fn();
let nextParam: string | null = null;
const register = vi.fn<(input: Record<string, string>) => Promise<void>>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => ({ get: (k: string) => (k === 'next' ? nextParam : null) }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ register }) }));

async function fill(opts: { password?: string; business?: string | null } = {}) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Your name'), 'Ada Lovelace');
  await user.type(screen.getByLabelText('Email'), 'Ada@Example.com');
  await user.type(screen.getByLabelText(/^Password/), opts.password ?? 'Longenough123');
  if (opts.business !== null) await user.type(screen.getByLabelText('Business name'), opts.business ?? 'Analytical Engines');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

beforeEach(() => {
  nextParam = null;
  replace.mockReset();
  register.mockReset();
});

describe('RegisterPage', () => {
  it('shows the shared-schema error and does not call the API for a password without a number', async () => {
    render(<RegisterPage />);
    await fill({ password: 'onlyletterspassword' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('submits the parsed (normalised) payload and redirects to the dashboard', async () => {
    register.mockResolvedValue();
    render(<RegisterPage />);
    await fill();
    expect(register).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'Longenough123',
      name: 'Ada Lovelace',
      organizationName: 'Analytical Engines',
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows the API error (e.g. duplicate email) and re-enables the button', async () => {
    register.mockRejectedValue(new ApiError(409, 'Email already registered'));
    render(<RegisterPage />);
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows field-level API validation errors', async () => {
    register.mockRejectedValue(new ApiError(422, 'Validation failed', [{ path: 'email', message: 'Invalid email' }]));
    render(<RegisterPage />);
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent('email: Invalid email');
  });

  it('when joining via invite it hides the business name and omits organizationName', async () => {
    nextParam = '/auth/accept-invite?token=abc';
    register.mockResolvedValue();
    render(<RegisterPage />);
    expect(screen.queryByLabelText('Business name')).not.toBeInTheDocument();
    await fill({ business: null });
    expect(register).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'Longenough123', name: 'Ada Lovelace' });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/accept-invite?token=abc'));
  });

  it('ignores an unsafe ?next target', async () => {
    nextParam = '//evil.example';
    register.mockResolvedValue();
    render(<RegisterPage />);
    await fill();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });
});
