import { Wordmark } from '../components/brand/Logo.tsx';

const FEATURES = [
  {
    title: 'Multilingual concierge',
    body: 'Ask anything about your matchday — in 30+ languages, by voice or by text.',
  },
  {
    title: 'Indoor navigation',
    body: 'Turn-by-turn from your gate to your seat, narrated in your language.',
  },
  {
    title: 'Live crowd awareness',
    body: 'See where queues are forming. Reroute before you hit the halftime surge.',
  },
  {
    title: 'Accessibility built-in',
    body: 'Step-free routes, sensory-safe zones, and a camera-based sign reader.',
  },
  {
    title: 'Real-time decisions',
    body: 'Gate changes, delays, and "leave now" nudges — before you need them.',
  },
];

export default function Landing() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <Wordmark />
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-surface-300 hover:text-surface-50"
        >
          GitHub
        </a>
      </header>

      <section className="mt-16">
        <p className="font-mono text-sm uppercase tracking-widest text-primary">
          FIFA World Cup 2026 · MetLife Stadium
        </p>
        <h1 className="mt-4 font-display text-5xl font-semibold leading-tight sm:text-6xl">
          Your AI companion at every
          <span className="text-primary"> gate, seat, and section.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-surface-300">
          Concourse is one GenAI agent that knows the stadium. Ask in any language and get the
          specific gate, the step-free route, the current wait time — and the exact minute to leave.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-pill bg-primary px-6 py-3 font-semibold text-surface-950 transition hover:bg-primary-400"
          >
            Try Concourse
          </button>
          <button
            type="button"
            className="rounded-pill border border-surface-700 px-6 py-3 font-semibold text-surface-100 transition hover:border-surface-500"
          >
            Watch the demo
          </button>
        </div>
      </section>

      <section className="mt-24 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Features">
        {FEATURES.map((f) => (
          <article
            key={f.title}
            className="rounded-2xl border border-surface-800 bg-surface-900 p-5"
          >
            <h2 className="font-display text-lg font-semibold text-surface-50">{f.title}</h2>
            <p className="mt-2 text-sm text-surface-300">{f.body}</p>
          </article>
        ))}
      </section>

      <footer className="mt-24 border-t border-surface-800 pt-6 text-sm text-surface-400">
        Built for PromptWars Virtual Challenge 4. Powered by Gemini + Google Antigravity.
      </footer>
    </main>
  );
}
