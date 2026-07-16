import { Link } from 'react-router-dom';
import { Wordmark } from '../components/brand/Logo.tsx';

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-6 px-6">
      <Wordmark />
      <h1 className="font-display text-4xl font-semibold">This concourse ring doesn't exist yet.</h1>
      <p className="text-surface-300">
        The route you tried isn't on our map. Head back to the entrance and try again.
      </p>
      <Link
        to="/"
        className="rounded-pill bg-primary px-6 py-3 font-semibold text-surface-950 hover:bg-primary-400"
      >
        Back to Concourse
      </Link>
    </main>
  );
}
