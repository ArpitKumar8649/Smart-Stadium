import { useEffect, useRef } from 'react';
import { useLiveCaptions } from './useLiveCaptions.ts';
import { useReducedMotion } from './useReducedMotion.ts';

/**
 * Live captioning for deaf and hard-of-hearing fans. Turns the mic into a
 * running, auto-scrolling transcript of announcements and speech around the
 * fan — powered by the same DashScope ASR the concierge uses, relayed through
 * our backend so no key is exposed. Captions auto-detect language.
 */
export function LiveCaptionPanel() {
  const { state, partial, lines, error, start, stop } = useLiveCaptions();
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [lines, partial, reduceMotion]);

  const active = state === 'listening' || state === 'connecting';

  return (
    <div className="rounded-2xl border border-surface-800 bg-surface-900 p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-surface-300">
            Live captions
          </h3>
          <p className="mt-0.5 text-xs text-surface-500">
            Real-time transcript for deaf &amp; hard-of-hearing fans
          </p>
        </div>
        <button
          type="button"
          onClick={active ? stop : () => void start()}
          aria-pressed={active}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            active
              ? 'bg-red-500/90 text-white hover:bg-red-500'
              : 'bg-primary text-surface-950 hover:bg-primary/90'
          }`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              state === 'listening' ? 'animate-pulse bg-white' : active ? 'bg-white/70' : 'bg-surface-950/60'
            }`}
            aria-hidden="true"
          />
          {state === 'connecting' ? 'Starting…' : active ? 'Stop' : 'Start captions'}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="h-48 overflow-y-auto rounded-xl border border-surface-800 bg-surface-950 p-3 text-surface-100"
        role="log"
        aria-live="polite"
        aria-label="Live captions"
      >
        {lines.length === 0 && !partial && state !== 'listening' && (
          <p className="text-sm text-surface-500">
            {state === 'idle' && 'Press “Start captions” and allow microphone access. Nearby speech and announcements will appear here.'}
            {state === 'connecting' && 'Connecting to the caption service…'}
            {state === 'error' && 'Captions unavailable.'}
          </p>
        )}
        {lines.length === 0 && !partial && state === 'listening' && (
          <p className="text-sm text-surface-500">Listening… speak or wait for an announcement.</p>
        )}
        <div className="space-y-1.5">
          {lines.map((line, i) => (
            <p key={i} className="text-[15px] leading-snug text-surface-50">
              {line}
            </p>
          ))}
          {partial && <p className="text-[15px] leading-snug text-primary/90 italic">{partial}</p>}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <p className="mt-2 text-[11px] text-surface-600">
        Audio is transcribed live and never stored. Language is auto-detected.
      </p>
    </div>
  );
}
