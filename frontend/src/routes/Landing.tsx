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
    title: 'Multilingual assistance',
    body: 'Ten selectable response-language preferences with a Qwen-backed streamed concierge.',
    icon: '💬',
  },
  {
    title: 'Navigation',
    body: 'A* routes over a 3,479-node MetLife venue graph with fastest, step-free, sensory-safe, and low-crowd modes.',
    icon: '🗺️',
  },
  {
    title: 'Crowd management',
    body: 'Labelled crowd density and queue projections steer fans through a low-crowd routing mode.',
    icon: '👥',
  },
  {
    title: 'Accessibility',
    body: 'Step-free and sensory-safe routing, large text, reduced motion, live captions, and a camera sign reader.',
    icon: '♿',
  },
  {
    title: 'Transportation',
    body: 'Multi-mode outdoor routing (drive / transit / two-wheeler / cycle / walk) to MetLife via Google Routes.',
    icon: '🚆',
  },
  {
    title: 'Real-time decision support',
    body: 'SSE advisories reach fans in seconds; the navigation view excludes affected nodes and re-plans automatically.',
    icon: '⚡',
  },
  {
    title: 'Operational intelligence',
    body: 'The Tournament Operations Console produces an AI briefing — headline, concerns, and prioritised recommendations from live venue state.',
    icon: '🎛️',
  },
];

export default function Landing() {
  const navigate = useNavigate();

  React.useEffect(() => scheduleStadiumMapCacheWarmup(), []);

  const navItems: NavItem[] = [
    { id: 'concierge', icon: <ChatIcon />, label: 'Concierge', onClick: () => navigate('/concierge') },
    { id: 'navigate', icon: <MapPinIcon />, label: 'Tactical map', onClick: () => navigate('/navigate') },
    { id: 'admin', icon: <ShieldIcon />, label: 'Ops Console', onClick: () => navigate('/admin') },
  ];
  return (
    <div className="relative min-h-screen overflow-hidden bg-surface-950 font-sans text-surface-50">
      {/* Background Ambient Glows */}
      <div className="pointer-events-none absolute -left-[20%] -top-[10%] h-[500px] w-[500px] animate-float rounded-full bg-primary-900/40 blur-[120px]" />
      <div className="pointer-events-none absolute -right-[10%] top-[30%] h-[400px] w-[400px] animate-float-delayed rounded-full bg-accent-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] left-[20%] h-[600px] w-[600px] animate-float rounded-full bg-blue-900/20 blur-[150px]" />

      <main id="main-content" tabIndex={-1} className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <header className="flex items-center justify-between glass-panel rounded-pill px-4 sm:px-6 py-3">
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
              className="h-10 sm:h-12 rounded-xl px-1"
              iconContainerClassName="!px-2 sm:!px-3.5 !py-1.5 sm:!py-2"
              iconClassName="w-4 h-4 sm:w-5 sm:h-5"
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
            FIFA World Cup 2026 · MetLife Stadium · Final · July 19, 2026
          </div>

          <h1 className="mt-8 max-w-4xl font-display text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
            Your AI companion at every
            <br />
            <span className="bg-gradient-to-r from-primary-400 via-accent-300 to-primary-500 bg-clip-text text-transparent">gate, seat, and section.</span>
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-surface-300 sm:text-xl">
            <span>A GenAI-enabled smart-stadium platform for </span><strong className="text-surface-100">fans</strong><span>, </span><strong className="text-surface-100">venue staff</strong><span>, and </span><strong className="text-surface-100">tournament organizers</strong><span>. Navigation, crowd management, accessibility, transportation, multilingual assistance, operational intelligence, and real-time decision support — grounded in a real 3,479-node MetLife venue graph.</span>
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
            <h2 className="font-display text-3xl font-semibold text-surface-50 sm:text-4xl">Every named area of Challenge 4.</h2>
            <p className="mt-4 max-w-3xl mx-auto text-lg text-surface-400">Grounded in a Qwen-backed concierge, a 3,479-node MetLife venue graph, and the Tournament Operations Console.</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
            {FEATURES.map((f, i) => (
              <article
                key={f.title}
                className={`glass-panel group relative overflow-hidden rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary-900/20 hover:border-surface-600 ${i === 0 ? 'sm:col-span-2 lg:col-span-2' : ''} ${i === FEATURES.length - 1 ? 'sm:col-span-2 lg:col-span-3' : ''}`}
              >
                <div className="mb-5 text-4xl">{f.icon}</div>
                <h3 className="font-display text-xl font-bold text-surface-50">{f.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-surface-300">{f.body}</p>
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-surface-800/30 blur-3xl transition-colors duration-500 group-hover:bg-primary-500/20" />
                <div className="absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-surface-800/10 blur-3xl transition-colors duration-500 group-hover:bg-accent-500/20" />
              </article>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-surface-800/50 pb-12 pt-8 text-center text-sm text-surface-500">
          <p>Built for PromptWars Virtual — Challenge 4: Smart Stadiums &amp; Tournament Operations.</p>
          <p className="mt-2">
            <strong>Judge walkthrough:</strong> open <Link to="/navigate" className="text-primary hover:underline">/navigate</Link> and the <Link to="/admin" className="text-accent hover:underline">Tournament Operations Console</Link> side-by-side, then trigger a route advisory to see real-time decision support in action.
          </p>
        </footer>
      </main>
    </div>
  );
}
