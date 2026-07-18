import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wordmark } from '../components/brand/Logo.tsx';
import { LimelightNav, type NavItem } from '../components/ui/LimelightNav.tsx';
import { scheduleStadiumMapCacheWarmup } from '../lib/stadiumCache.ts';

const TrophyScene = React.lazy(() => import('../components/trophy/TrophyScene.tsx'));

function DeferredTrophyScene() {
  const sectionRef = React.useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = React.useState(false);

  React.useEffect(() => {
    const node = sectionRef.current;
    if (!node || shouldLoad) return undefined;

    if (!('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: '160px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={sectionRef} className="min-h-[500px]">
      {shouldLoad && (
        <React.Suspense fallback={<div className="h-[500px]" aria-hidden="true" />}>
          <TrophyScene />
        </React.Suspense>
      )}
    </div>
  );
}

// Header destination glyphs: concierge chat, tactical map, staff shield.
const ChatIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
);
const MapPinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg>
);
const ShieldIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
);

const FEATURES = [
  {
    title: 'Multilingual concierge',
    body: 'Ask matchday questions and choose from ten response-language preferences.',
    icon: '💬',
  },
  {
    title: 'Indoor navigation',
    body: 'Turn-by-turn from your gate to your seat, using real MetLife Stadium geometry.',
    icon: '🗺️',
  },
  {
    title: 'Live crowd awareness',
    body: 'See simulated queue conditions and choose a low-crowd route before the halftime surge.',
    icon: '👥',
  },
  {
    title: 'Accessibility built-in',
    body: 'Step-free routing, sensory-safe zones, and a camera-based sign reader.',
    icon: '♿',
  },
  {
    title: 'Real-time decisions',
    body: 'Connected navigation views receive demo closure and operational alerts via SSE.',
    icon: '⚡',
  },
  {
    title: 'Operations Command',
    body: 'A server-protected demo-operator dashboard for simulated briefings and venue-wide scenarios.',
    icon: '🎛️',
  },
];

export default function Landing() {
  const navigate = useNavigate();

  React.useEffect(() => scheduleStadiumMapCacheWarmup(), []);

  const navItems: NavItem[] = [
    { id: 'concierge', icon: <ChatIcon />, label: 'Concierge', onClick: () => navigate('/concierge') },
    { id: 'navigate', icon: <MapPinIcon />, label: 'Tactical map', onClick: () => navigate('/navigate') },
    { id: 'admin', icon: <ShieldIcon />, label: 'Staff', onClick: () => navigate('/admin') },
  ];
  return (
    <div className="relative min-h-screen overflow-hidden bg-surface-950 font-sans text-surface-50">
      {/* Background Ambient Glows */}
      <div className="pointer-events-none absolute -left-[20%] -top-[10%] h-[500px] w-[500px] animate-float rounded-full bg-primary-900/40 blur-[120px]" />
      <div className="pointer-events-none absolute -right-[10%] top-[30%] h-[400px] w-[400px] animate-float-delayed rounded-full bg-accent-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] left-[20%] h-[600px] w-[600px] animate-float rounded-full bg-blue-900/20 blur-[150px]" />

      <main id="main-content" tabIndex={-1} className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <header className="flex items-center justify-between glass-panel rounded-pill px-6 py-3">
          <Wordmark />
          <div className="flex items-center gap-4 text-sm font-medium">
            <a
              href="https://github.com/ArpitKumar8649/Smart-Stadium"
              target="_blank"
              rel="noreferrer"
              className="hidden text-surface-300 transition hover:text-surface-50 sm:inline"
            >
              GitHub Repo
            </a>
            <LimelightNav
              className="h-12 rounded-xl px-1"
              iconContainerClassName="!px-3.5 !py-2"
              iconClassName="w-5 h-5"
              items={navItems}
              defaultActiveIndex={0}
            />
          </div>
        </header>

        {/* Hero Section */}
        <section className="mt-16 flex flex-col items-center text-center lg:mt-20">
          <div className="inline-flex items-center gap-2 rounded-pill border border-primary-800/50 bg-primary-950/30 px-3 py-1.5 text-xs font-semibold text-primary-300 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
            </span>
            Designed for FIFA World Cup 2026 · MetLife Stadium
          </div>

          <h1 className="mt-8 max-w-4xl font-display text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
            Your AI companion at every
            <br />
            <span className="text-gradient">gate, seat, and section.</span>
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-surface-300 sm:text-xl">
            Concourse is a GenAI companion designed to use the venue graph. Ask naturally, choose a response language, get a step-free route, avoid simulated crowds, and receive live demo alerts.
          </p>

          <div className="mt-10 flex w-full max-w-md flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <Link
              to="/concierge"
              className="glow-primary group flex w-full items-center justify-center gap-2 rounded-pill bg-primary px-8 py-4 font-semibold text-surface-950 transition-all hover:scale-105 hover:bg-primary-400 sm:w-auto"
            >
              Talk to Concourse
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              to="/navigate"
              className="flex w-full items-center justify-center gap-2 rounded-pill border border-surface-700 bg-surface-900/50 px-8 py-4 font-semibold text-surface-100 backdrop-blur-md transition-all hover:bg-surface-800 sm:w-auto"
            >
              View Tactical Map
            </Link>
          </div>
        </section>

        {/* 3D Trophy with typing text */}
        <section className="mt-8">
          <DeferredTrophyScene />
        </section>

        {/* Features Grid */}
        <section className="mt-16 pb-24">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-semibold text-surface-50">One agent. Five capabilities.</h2>
            <p className="mt-3 text-surface-400">Powered by Qwen and a real 3,400+ node stadium graph.</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="glass-panel group relative overflow-hidden rounded-3xl p-6 transition-all hover:-translate-y-1 hover:border-surface-600"
              >
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="font-display text-lg font-semibold text-surface-50">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-surface-300">{f.body}</p>
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-surface-800/30 blur-2xl transition-colors group-hover:bg-primary-900/30" />
              </article>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-surface-800/50 pb-12 pt-8 text-center text-sm text-surface-500">
          <p>Built for the operational demo. (v2.1 Secured)</p>
          <p className="mt-2">
            <strong>Judge Instructions:</strong> Open <Link to="/navigate" className="text-primary hover:underline">/navigate</Link> and <Link to="/admin" className="text-accent hover:underline">/admin</Link> side-by-side to test live incident injection.
          </p>
        </footer>
      </main>
    </div>
  );
}
