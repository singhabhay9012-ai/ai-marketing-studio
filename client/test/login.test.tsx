import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import LoginPage from '@/app/auth/login/page';

const replace = vi.fn();
let nextParam: string | null = null;
const login = vi.fn<(email: string, password: string) => Promise<void>>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => ({ get: (k: string) => (k === 'next' ? nextParam : null) }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ login }) }));

async function fill(email = 'ada@example.com', password = 'Password123!') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  nextParam = null;
  replace.mockReset();
  login.mockReset();
});

describe('LoginPage', () => {
  it('does not submit when fields are empty (required)', async () => {
    render(<LoginPage />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));
    expect(login).not.toHaveBeenCalled();
  });

  it('submits the typed credentials and goes to the dashboard', async () => {
    login.mockResolvedValue();
    render(<LoginPage />);
    await fill();
    expect(login).toHaveBeenCalledWith('ada@example.com', 'Password123!');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows the API error and re-enables the button on failure', async () => {
    login.mockRejectedValue(new ApiError(401, 'Invalid email or password'));
    render(<LoginPage />);
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows a generic message for unexpected errors (no internals leaked)', async () => {
    login.mockRejectedValue(new Error('ECONNRESET 10.0.0.5'));
    render(<LoginPage />);
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
  });

  it('disables the button while signing in', async () => {
    login.mockReturnValue(new Promise(() => undefined));
    render(<LoginPage />);
    await fill();
    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
  });

  it('follows a same-origin ?next path', async () => {
    nextParam = '/products';
    login.mockResolvedValue();
    render(<LoginPage />);
    await fill();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/products'));
  });

  it.each(['//evil.example', 'https://evil.example'])('ignores unsafe ?next=%s (no open redirect)', async (bad) => {
    nextParam = bad;
    login.mockResolvedValue();
    render(<LoginPage />);
    await fill();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });
});
