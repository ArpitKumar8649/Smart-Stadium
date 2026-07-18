import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function useAdminSession() {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const authenticate = async (candidateToken: string) => {
    const candidate = candidateToken.trim();
    if (!candidate) {
      setAuthError('Enter the operator passcode.');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/session`, {
        headers: { Authorization: `Bearer ${candidate}` },
      });
      if (!response.ok) {
        setAuthError('Invalid passcode.');
        return;
      }
      setToken(candidate);
      setAuthed(true);
    } catch {
      setAuthError('Could not reach the admin service.');
    } finally {
      setAuthLoading(false);
    }
  };

  const clearError = () => setAuthError(null);

  return {
    token,
    authed,
    setAuthed,
    authError,
    authLoading,
    authenticate,
    clearError,
  };
}
