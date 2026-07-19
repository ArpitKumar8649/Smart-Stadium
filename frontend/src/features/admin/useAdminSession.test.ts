import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAdminSession } from './useAdminSession';
import { onIdTokenChanged, type User } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { logger } from '../../lib/telemetry';

vi.mock('../../lib/telemetry', () => ({
  logger: { error: vi.fn() }
}));

describe('useAdminSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with loading state and handles unauthenticated user', () => {
    vi.mocked(onIdTokenChanged).mockImplementationOnce((_auth, cb) => {
      // Simulate immediate auth resolution with no user
      if (typeof cb === 'function') {
        cb(null);
      }
      return vi.fn();
    });

    const { result } = renderHook(() => useAdminSession());
    expect(result.current.authLoading).toBe(false);
    expect(result.current.authed).toBe(false);
    expect(result.current.token).toBe('');
    expect(result.current.user).toBe(null);
  });

  it('handles authenticated user successfully', async () => {
    const mockUser = {
      getIdToken: vi.fn().mockResolvedValue('mock-token-123')
    } as unknown as User;

    vi.mocked(onIdTokenChanged).mockImplementationOnce((_auth, cb) => {
      // Resolve with user
      if (typeof cb === 'function') {
        cb(mockUser);
      }
      return vi.fn();
    });

    const { result } = renderHook(() => useAdminSession());

    // We have to wait for the async getIdToken inside the effect
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.authLoading).toBe(false);
    expect(result.current.authed).toBe(true);
    expect(result.current.token).toBe('mock-token-123');
    expect(result.current.user).toBe(mockUser);
  });

  it('handles error when getting id token fails', async () => {
    const mockUser = {
      getIdToken: vi.fn().mockRejectedValue(new Error('Token error'))
    } as unknown as User;

    vi.mocked(onIdTokenChanged).mockImplementationOnce((_auth, cb) => {
      if (typeof cb === 'function') {
        cb(mockUser);
      }
      return vi.fn();
    });

    const { result } = renderHook(() => useAdminSession());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.authed).toBe(false);
    expect(result.current.token).toBe('');
    expect(result.current.authError).toBe('Failed to get auth token.');
  });

  it('can clear error', () => {
    const { result } = renderHook(() => useAdminSession());

    act(() => {
      result.current.clearError();
    });

    expect(result.current.authError).toBe(null);
  });

  it('can sign out successfully', async () => {
    vi.mocked(auth.signOut).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAdminSession());

    await act(async () => {
      await result.current.signOut();
    });

    expect(auth.signOut).toHaveBeenCalled();
    expect(result.current.authed).toBe(false);
    expect(result.current.token).toBe('');
    expect(result.current.user).toBe(null);
  });

  it('handles sign out error', async () => {
    const error = new Error('Signout failed');
    vi.mocked(auth.signOut).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useAdminSession());

    await act(async () => {
      await result.current.signOut();
    });

    expect(logger.error).toHaveBeenCalledWith('Error signing out', error);
  });
});
