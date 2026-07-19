import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../components/brand/Logo.tsx';
import { useConcierge } from '../features/concierge/useConcierge.ts';
import { MessageBubble } from '../features/concierge/MessageBubble.tsx';
import { SignReader } from '../features/accessibility/SignReader.tsx';
import { LiveCaptionPanel } from '../features/accessibility/LiveCaptionPanel.tsx';
import { ConcourseMap } from '../features/concierge/ConcourseMap.tsx';
import { TransitPlanCard } from '../features/concierge/TransitPlanCard.tsx';
import { parseSectionRef } from '../features/concierge/floorData.ts';
import { useA11y } from '../features/accessibility/useA11y.ts';
import { A11yTogglePanel } from '../features/accessibility/A11yTogglePanel.tsx';

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
  const { prefs } = useA11y();
  const [input, setInput] = useState('');
  const [lang, setLang] = useState('en');
  const [announcement, setAnnouncement] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAnnouncedMessageId = useRef<string | null>(null);

  // GPS State
  const [gps, setGps] = useState<{lat: number, lng: number} | null>(null);
  const [gpsRequested, setGpsRequested] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [shareLocationForRequest, setShareLocationForRequest] = useState(false);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);

  // Most recent Transit Agent plan (via transit_handoff tool). Drives both the
  // map polyline and the inline transit card under the assistant's reply.
  const lastTransitPlan = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.tools) {
        const t = msg.tools.find(
          (tool) => tool.name === 'transit_handoff' && tool.ok && (tool.data as { kind?: string } | undefined)?.kind === 'transit_plan',
        );
        if (t?.data) return t.data as unknown as import('@concourse/shared').TransitResponse;
      }
    }
    return null;
  }, [messages]);
  const lastOutdoorRouteResult = lastTransitPlan?.primary_polyline ?? null;

  // The most recent seating section named anywhere in the conversation (user or
  // assistant). Drives the 3D highlight — "take me to Section 128" lights it up.
  const focusSection = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg?.text) continue;
      const ref = parseSectionRef(msg.text);
      if (ref) return ref;
    }
    return null;
  }, [messages]);

  const accessibility = useMemo(() => [
    ...(prefs.step_free ? ['step_free'] : []),
    ...(prefs.sensory_safe ? ['sensory_safe'] : []),
    ...(prefs.large_text ? ['large_text'] : []),
    ...(prefs.reduce_motion ? ['reduce_motion'] : []),
    ...(prefs.screen_reader ? ['screen_reader'] : []),
  ], [prefs]);

  const requestGps = () => {
    setGpsRequested(true);
    setGpsError(null);
    if (!('geolocation' in navigator)) {
      setGpsRequested(false);
      setGpsError('Location sharing is not supported by this browser. You can set a location on the map instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsRequested(false);
      },
      () => {
        setGpsRequested(false);
        setGpsError('Location was unavailable. Check browser permission or set a location on the map.');
      },
      { enableHighAccuracy: true, timeout: 5000 },
    );
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (busy) return;
    const latestReply = [...messages].reverse().find((message) =>
      message.role === 'assistant' && !message.streaming && message.text.trim().length > 0,
    );
    if (!latestReply || latestReply.id === lastAnnouncedMessageId.current) return;
    lastAnnouncedMessageId.current = latestReply.id;
    setAnnouncement(`Concourse replied: ${latestReply.text}`);
  }, [busy, messages]);

  // Keep <html lang>/dir in sync with the chosen language (WCAG + RTL for Arabic).
  useEffect(() => {
    const root = document.documentElement;
    const prevLang = root.lang;
    const prevDir = root.dir;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    return () => {
      root.lang = prevLang;
      root.dir = prevDir;
    };
  }, [lang]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    // Coordinates are optional and only leave the device when the fan explicitly
    // selects this request-level sharing control for an outdoor-route question.
    const requestLocation = shareLocationForRequest ? gps ?? undefined : undefined;
    void send(t, lang, undefined, requestLocation, accessibility);
    setShareLocationForRequest(false);
  };

  const handleSignDescription = (description: string) => {
    void send(
      `I saw a sign that says: ${description}. What does this mean?`,
      lang,
      undefined,
      undefined,
      accessibility,
    );
  };

  const empty = messages.length === 0;

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex h-[100dvh] max-w-6xl flex-col px-4 sm:px-6 md:flex-row md:gap-8">
      {/* Chat Column */}
      <div className="flex h-full flex-col w-full md:w-[450px] lg:w-[500px] shrink-0 pb-4">
        <header className="flex shrink-0 items-center justify-between py-4">
          <Link to="/" aria-label="Back to Concourse home">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
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
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto py-4"
          role="log"
          aria-live="off"
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

              {/* GPS Opt-in */}
              {!gps && (
                <div className="w-full">
                  <button
                    onClick={requestGps}
                    className="w-full rounded-xl border border-primary-800/50 bg-primary-950/30 px-4 py-3 text-sm font-semibold text-primary-300 transition hover:bg-primary-900/50"
                  >
                    {gpsRequested ? 'Locating…' : '📍 Share Location for Outdoor Routes'}
                  </button>
                  {gpsError && <p className="mt-2 text-sm text-red-300" role="alert">{gpsError}</p>}
                </div>
              )}

              <div className="w-full sm:w-1/2">
                <SignReader
                  lang={lang}
                  onDescription={handleSignDescription}
                />
              </div>

              <div className="w-full">
                <LiveCaptionPanel />
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} msg={m} />)
          )}
          {lastTransitPlan && !empty && <TransitPlanCard plan={lastTransitPlan} />}
        </div>

        <div className="sr-only" role="status" aria-live="polite">{announcement}</div>

        <details className="mb-2 shrink-0 rounded-xl border border-surface-800 bg-surface-900 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-surface-100">Accessibility tools & preferences</summary>
          <div className="mt-3 grid gap-3">
            <A11yTogglePanel />
            {!empty && (
              <>
                <SignReader lang={lang} onDescription={handleSignDescription} />
                <LiveCaptionPanel />
              </>
            )}
          </div>
        </details>

        <div className="mb-2 shrink-0 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMapOpen((open) => !open)}
            aria-expanded={mobileMapOpen}
            aria-controls="mobile-map-and-route"
            className="flex min-h-11 w-full items-center justify-between rounded-xl border border-surface-700 bg-surface-900 px-4 py-2.5 text-left text-sm font-semibold text-surface-100"
          >
            <span>Map &amp; route</span>
            <span aria-hidden="true">{mobileMapOpen ? '−' : '+'}</span>
          </button>
          {mobileMapOpen && (
            <section id="mobile-map-and-route" className="mt-2 h-96 overflow-hidden rounded-xl border border-surface-800" aria-label="Map and route">
              <ConcourseMap
                userLocation={gps}
                encodedPolyline={lastOutdoorRouteResult}
                focusSection={focusSection}
                prefer2d
                onSetLocation={(loc) => {
                  setGps(loc);
                  setGpsRequested(false);
                  setGpsError(null);
                }}
              />
            </section>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="relative flex items-center justify-center py-2 sm:py-4 mb-2 w-full pb-safe"
        >
          <div id="poda" className="relative flex items-center justify-center group w-full">
            <div className="absolute z-[-1] overflow-hidden h-full w-full rounded-xl blur-[3px]
                            before:absolute before:content-[''] before:z-[-2] before:w-[999px] before:h-[999px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-60
                            before:bg-[conic-gradient(#000,#402fb5_5%,#000_38%,#000_50%,#cf30aa_60%,#000_87%)] before:transition-all before:duration-2000
                            group-hover:before:rotate-[-120deg] group-focus-within:before:rotate-[420deg] group-focus-within:before:duration-[4000ms]">
            </div>
            <div className="absolute z-[-1] overflow-hidden h-full w-full rounded-xl blur-[3px]
                            before:absolute before:content-[''] before:z-[-2] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[82deg]
                            before:bg-[conic-gradient(rgba(0,0,0,0),#18116a,rgba(0,0,0,0)_10%,rgba(0,0,0,0)_50%,#6e1b60,rgba(0,0,0,0)_60%)] before:transition-all before:duration-2000
                            group-hover:before:rotate-[-98deg] group-focus-within:before:rotate-[442deg] group-focus-within:before:duration-[4000ms]">
            </div>
            <div className="absolute z-[-1] overflow-hidden h-[calc(100%-2px)] w-[calc(100%-5px)] rounded-lg blur-[2px]
                            before:absolute before:content-[''] before:z-[-2] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[83deg]
                            before:bg-[conic-gradient(rgba(0,0,0,0)_0%,#a099d8,rgba(0,0,0,0)_8%,rgba(0,0,0,0)_50%,#dfa2da,rgba(0,0,0,0)_58%)] before:brightness-140
                            before:transition-all before:duration-2000 group-hover:before:rotate-[-97deg] group-focus-within:before:rotate-[443deg] group-focus-within:before:duration-[4000ms]">
            </div>
            <div className="absolute z-[-1] overflow-hidden h-[calc(100%-6px)] w-[calc(100%-10px)] rounded-xl blur-[0.5px]
                            before:absolute before:content-[''] before:z-[-2] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-70
                            before:bg-[conic-gradient(#1c191c,#402fb5_5%,#1c191c_14%,#1c191c_50%,#cf30aa_60%,#1c191c_64%)] before:brightness-130
                            before:transition-all before:duration-2000 group-hover:before:rotate-[-110deg] group-focus-within:before:rotate-[430deg] group-focus-within:before:duration-[4000ms]">
            </div>

            <div id="main" className="relative group w-full flex items-center bg-[#010201] rounded-lg">
              {gps && (
                <button
                  type="button"
                  onClick={() => setShareLocationForRequest((current) => !current)}
                  aria-pressed={shareLocationForRequest}
                  title="Share your saved location with this request only"
                  className={`ml-2 shrink-0 rounded-md px-2 py-1 text-xs font-semibold transition ${
                    shareLocationForRequest
                      ? 'bg-primary text-surface-950'
                      : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
                  }`}
                >
                  📍
                </button>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about the stadium…"
                className="h-[56px] w-full rounded-lg border-none bg-transparent px-4 text-[15px] text-white placeholder-gray-400 focus:outline-none"
                aria-label={shareLocationForRequest ? 'Message Concourse with location shared for this request' : 'Message Concourse'}
              />
              <div id="pink-mask" className="pointer-events-none w-[30px] h-[20px] absolute bg-[#cf30aa] top-[10px] left-[5px] blur-2xl opacity-80 transition-all duration-2000 group-hover:opacity-0"></div>
              <div className="absolute h-[42px] w-[40px] overflow-hidden top-[7px] right-[7px] rounded-lg
                              before:absolute before:content-[''] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-90
                              before:bg-[conic-gradient(rgba(0,0,0,0),#3d3a4f,rgba(0,0,0,0)_50%,rgba(0,0,0,0)_50%,#3d3a4f,rgba(0,0,0,0)_100%)]
                              before:brightness-135 before:animate-spin-slow">
              </div>

              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="relative z-10 mr-2 h-[42px] w-[40px] shrink-0 flex items-center justify-center rounded-lg bg-surface-800 text-surface-50 font-bold transition enabled:hover:bg-primary-500 enabled:hover:text-surface-950 disabled:opacity-40 disabled:bg-surface-900"
                aria-label="Send message"
              >
                {busy ? '…' : '↑'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Map Column (Hidden on mobile unless requested, visible on md+) */}
      <div className="hidden flex-1 py-4 md:block">
        <ConcourseMap
          userLocation={gps}
          encodedPolyline={lastOutdoorRouteResult}
          focusSection={focusSection}
          onSetLocation={(loc) => {
            setGps(loc);
            setGpsRequested(true);
          }}
        />
      </div>
    </main>
  );
}
