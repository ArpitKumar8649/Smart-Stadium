import { useOnlineStatus } from '../../lib/useOnlineStatus.ts';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-red-950 px-4 py-3 text-sm font-semibold text-red-100 shadow-[0_-4px_10px_rgba(0,0,0,0.3)] sm:bottom-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:rounded-pill sm:border sm:border-red-900"
    >
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
      </span>
      <span>Stadium connection lost. Showing cached data.</span>
    </div>
  );
}
