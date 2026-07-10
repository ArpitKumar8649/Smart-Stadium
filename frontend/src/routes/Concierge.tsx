import { useEffect, useMemo, useRef, useState } from 'react';
import { Wordmark } from '../components/brand/Logo.tsx';
import { useConcierge } from '../features/concierge/useConcierge.ts';
import { MessageBubble } from '../features/concierge/MessageBubble.tsx';

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh-Hans', label: '中文' },
];

const SUGGESTIONS = [
  'Nearest step-free restroom from Section 144',
  'How do I get from HCL Tech gate to Section 108?',
  "Where's the closest halal food?",
  'Nearest first aid on the 100 Concourse',
];

function makeSessionId() {
  const k = 'concourse.session';
  const existing = localStorage.getItem(k);
  if (existing) return existing;
  const id = `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  localStorage.setItem(k, id);
  return id;
}

export default function Concierge() {
  const sessionId = useMemo(makeSessionId, []);
  const { messages, busy, send } = useConcierge(sessionId);
  const [input, setInput] = useState('');
  const [lang, setLang] = useState('en');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    void send(t, lang);
  };

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <Wordmark />
        <label className="sr-only" htmlFor="lang">
          Language
        </label>
        <select
          id="lang"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="rounded-pill border border-surface-700 bg-surface-900 px-3 py-1.5 text-sm text-surface-100"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto py-4"
        role="log"
        aria-live="polite"
      >
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div>
              <h1 className="font-display text-2xl font-semibold">Ask Concourse anything.</h1>
              <p className="mt-2 text-surface-400">
                Navigation, restrooms, food, accessibility — in your language.
              </p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-xl border border-surface-800 bg-surface-900 px-4 py-3 text-left text-sm text-surface-200 transition hover:border-surface-600 hover:bg-surface-800"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} msg={m} />)
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-center gap-2 border-t border-surface-800 py-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the stadium…"
          className="flex-1 rounded-pill border border-surface-700 bg-surface-900 px-4 py-3 text-[15px] text-surface-50 placeholder:text-surface-500 focus:border-primary"
          aria-label="Message Concourse"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-pill bg-primary px-5 py-3 font-semibold text-surface-950 transition enabled:hover:bg-primary-400 disabled:opacity-40"
        >
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
