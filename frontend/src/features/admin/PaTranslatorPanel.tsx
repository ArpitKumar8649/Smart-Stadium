import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/** Target languages for PA announcements — CosyVoice-supported multilingual set. */
const TARGET_LANGS = [
  { code: 'es', label: 'Español' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ar', label: 'العربية' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
];

interface Rendered {
  code: string;
  label: string;
  url: string;
  text: string;
  cached: boolean;
}

type PaTranslatorPanelProps = {
  adminToken: string;
  onUnauthorized: () => void;
};

/**
 * PA Translator (Tier 1) — generative multilingual announcements.
 *
 * An operator types one English announcement, picks languages, and hears it
 * spoken back in each — translated by Qwen, voiced by CosyVoice generative TTS.
 * This is generative audio (real prosody), not the flat browser voice: "GenAI
 * beyond an LLM". A "generated live" badge keeps us honest about what's synthetic.
 */
export function PaTranslatorPanel({ adminToken, onUnauthorized }: PaTranslatorPanelProps) {
  const [text, setText] = useState('Gate C is now closing. Please proceed to your seats.');
  const [selected, setSelected] = useState<string[]>(['es', 'hi', 'ar']);
  const [busy, setBusy] = useState(false);
  const [rendered, setRendered] = useState<Rendered[]>([]);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generatedUrls = useRef<string[]>([]);

  useEffect(() => () => {
    generatedUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const toggle = (code: string) =>
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  const announce = useCallback(async () => {
    const clean = text.trim();
    if (!clean || selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    generatedUrls.current.forEach((url) => URL.revokeObjectURL(url));
    generatedUrls.current = [];
    setRendered([]);

    const results: Rendered[] = [];
    try {
      for (const code of selected) {
        const label = TARGET_LANGS.find((l) => l.code === code)?.label ?? code;
        const res = await fetch(`${API_BASE}/api/audio/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ text: clean, lang: code, source_lang: 'en' }),
        });
        if (res.status === 401) {
          onUnauthorized();
          throw new Error('Your operator session expired. Please sign in again.');
        }
        if (!res.ok) throw new Error(`Synthesis failed for ${label} (${res.status})`);
        const cached = res.headers.get('X-TTS-Cached') === '1';
        const spoken = decodeURIComponent(res.headers.get('X-TTS-Text') ?? '');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        generatedUrls.current.push(url);
        results.push({ code, label, url, text: spoken, cached });
        setRendered([...results]); // progressive reveal as each language completes
      }
      // Auto-play the first one so the demo "just works".
      if (results[0] && audioRef.current) {
        audioRef.current.src = results[0].url;
        void audioRef.current.play().catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Announcement failed.');
    } finally {
      setBusy(false);
    }
  }, [text, selected, busy, adminToken, onUnauthorized]);

  const play = (url: string) => {
    if (!audioRef.current) return;
    audioRef.current.src = url;
    void audioRef.current.play().catch(() => {});
  };

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-accent">
          PA Translator
        </h2>
        <span
          className="rounded-full bg-primary-950/60 px-2 py-0.5 text-[10px] font-semibold text-primary-300"
          title="Speech is synthesized live by CosyVoice generative TTS"
        >
          ⦿ generated live
        </span>
      </div>
      <p className="mb-2 text-xs text-surface-400">
        One announcement, heard by every fan in their own language — generative voice, not a recording.
      </p>

      <label htmlFor="pa-announcement" className="sr-only">English public-address announcement</label>
      <textarea
        id="pa-announcement"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={600}
        placeholder="Type an English announcement…"
        className="w-full resize-none rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-surface-100 focus:border-primary focus:outline-none"
      />

      <div className="mt-2 flex flex-wrap gap-1.5">
        {TARGET_LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => toggle(l.code)}
            aria-pressed={selected.includes(l.code)}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              selected.includes(l.code)
                ? 'border-primary bg-primary-950/50 text-primary-200'
                : 'border-surface-700 text-surface-400 hover:border-surface-500'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={announce}
        disabled={busy || !text.trim() || selected.length === 0}
        className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-surface-950 transition hover:bg-primary-400 disabled:opacity-50"
      >
        {busy ? 'Synthesizing…' : `📢 Announce in ${selected.length} language${selected.length === 1 ? '' : 's'}`}
      </button>

      {error && <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>}

      {rendered.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite" aria-label="Generated announcements">
          {rendered.map((r) => (
            <li key={r.code} className="rounded-lg border border-surface-800 bg-surface-900 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-surface-200">{r.label}</span>
                <div className="flex items-center gap-2">
                  {r.cached && (
                    <span className="text-[10px] text-surface-500" title="Served from cache — 0 quota used">
                      cached
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => play(r.url)}
                    className="rounded bg-surface-800 px-2 py-0.5 text-xs text-surface-100 hover:bg-surface-700"
                    aria-label={`Play ${r.label} announcement`}
                  >
                    ▶ Play
                  </button>
                </div>
              </div>
              {r.text && <p className="mt-1 text-xs text-surface-400" dir="auto">{r.text}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* Shared playback element. */}
      <audio ref={audioRef} className="hidden" />
    </section>
  );
}
