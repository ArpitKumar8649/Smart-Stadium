import { useState, type FormEvent } from 'react';
import { Wordmark } from '../../components/brand/Logo.tsx';

interface AdminLoginFormProps {
  onLogin: (token: string) => void;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

export function AdminLoginForm({ onLogin, loading, error, clearError }: AdminLoginFormProps) {
  const [inputValue, setInputValue] = useState('');

  const authenticate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onLogin(inputValue);
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center px-4">
      <form className="w-full max-w-sm space-y-4 rounded-2xl border border-surface-800 bg-surface-900 p-6 shadow-xl" onSubmit={authenticate}>
        <Wordmark className="justify-center" />
        <p className="text-center text-sm text-surface-400">Operations Command Center</p>
        <div>
          <label htmlFor="admin-passcode" className="sr-only">Admin passcode</label>
          <input
            id="admin-passcode"
            type="password"
            placeholder="Admin Passcode"
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); clearError(); }}
            autoComplete="current-password"
            className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-surface-50 focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {error && <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>}
        </div>
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-surface-950 transition hover:bg-primary-400 disabled:opacity-60">
          {loading ? 'Checking…' : 'Authenticate'}
        </button>
      </form>
    </main>
  );
}
