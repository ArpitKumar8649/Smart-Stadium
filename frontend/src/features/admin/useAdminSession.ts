import { useState, useEffect } from 'react';
import { onIdTokenChanged, User } from 'firebase/auth';
import { auth } from '../../lib/firebase';

export function useAdminSession() {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          setToken(idToken);
          setAuthed(true);
        } catch {
          setAuthError('Failed to get auth token.');
          setAuthed(false);
          setToken('');
        }
      } else {
        setToken('');
        setAuthed(false);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      await auth.signOut();
      setToken('');
      setAuthed(false);
      setUser(null);
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  const clearError = () => setAuthError(null);

  return {
    token,
    authed,
    user,
    setAuthed,
    authError,
    authLoading,
    signOut,
    clearError,
  };
}
