import { useState, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function SignReader({ lang = 'en', onDescription }: Readonly<{ lang?: string, onDescription: (text: string) => void }>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 1_300_000) {
      setError('Choose an image smaller than 1.3 MB so it can be read securely.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Compress and convert to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;

        try {
          const res = await fetch(`${API_BASE}/api/vision/sign-reader`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_b64: base64, lang }),
          });

          if (!res.ok) throw new Error('Failed to read sign');
          const data = await res.json();
          onDescription(data.description);
        } catch {
          setError('Could not process the image.');
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setError('Failed to read file.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={fileInputRef}
        onChange={handleCapture}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-xl border border-surface-700 bg-surface-900 px-4 py-3 text-sm font-semibold text-surface-50 transition hover:bg-surface-800 disabled:opacity-50"
      >
        <span role="img" aria-hidden="true">📷</span>
        {loading ? 'Reading sign...' : 'Read a sign'}
      </button>
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
    </div>
  );
}
