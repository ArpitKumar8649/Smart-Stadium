import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminLoginForm } from './AdminLoginForm';
import { signInWithPopup, type UserCredential } from 'firebase/auth';
import { logger } from '../../lib/telemetry';

vi.mock('../../lib/telemetry', () => ({
  logger: { error: vi.fn() }
}));

describe('AdminLoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login button and handles successful login', async () => {
    const user = userEvent.setup();
    const clearError = vi.fn();
    vi.mocked(signInWithPopup).mockResolvedValueOnce({} as unknown as UserCredential);

    render(<AdminLoginForm error={null} clearError={clearError} />);

    expect(screen.getByRole('button', { name: /Sign in with Google/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Sign in with Google/i }));

    expect(clearError).toHaveBeenCalled();
    expect(signInWithPopup).toHaveBeenCalled();
  });

  it('displays passed in error', () => {
    render(<AdminLoginForm error="Session expired" clearError={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Session expired');
  });

  it('handles and displays login errors', async () => {
    const user = userEvent.setup();
    const error = new Error('Popup blocked');
    vi.mocked(signInWithPopup).mockRejectedValueOnce(error);

    render(<AdminLoginForm error={null} clearError={vi.fn()} />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Sign in with Google/i }));
    });

    expect(logger.error).toHaveBeenCalledWith("Login failed:", error);
    expect(screen.getByRole('alert')).toHaveTextContent('Popup blocked');
  });

  it('handles non-Error objects in catch block', async () => {
    const user = userEvent.setup();
    vi.mocked(signInWithPopup).mockRejectedValueOnce('String error');

    render(<AdminLoginForm error={null} clearError={vi.fn()} />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Sign in with Google/i }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to sign in with Google');
  });
});