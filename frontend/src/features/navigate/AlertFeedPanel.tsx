import type { Alert } from '@concourse/shared';

export function AlertFeedPanel({
  activeAlerts,
  planRoute,
  dismissAlert,
}: {
  activeAlerts: Alert[];
  planRoute: () => void;
  dismissAlert: (id: string) => void;
}) {
  if (activeAlerts.length === 0) return null;

  return (
    <div
      className="mb-4 space-y-2"
      aria-live={activeAlerts.some((alert) => alert.severity === 'critical') ? 'assertive' : 'polite'}
    >
      {activeAlerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-start justify-between gap-4 rounded-xl border p-3 shadow-lg ${
            alert.severity === 'critical'
              ? 'border-red-900 bg-red-950/40 text-red-100'
              : alert.severity === 'warn'
              ? 'border-amber-900 bg-amber-950/40 text-amber-100'
              : 'border-blue-900 bg-blue-950/40 text-blue-100'
          }`}
        >
          <div>
            <h3 className="text-sm font-bold">{alert.title}</h3>
            <p className="mt-1 text-xs opacity-90">{alert.body}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => planRoute()}
              className="rounded-lg bg-surface-950/50 px-3 py-1.5 text-xs font-semibold hover:bg-surface-900/50"
            >
              Re-plan Route
            </button>
            <button
              onClick={() => dismissAlert(alert.id)}
              className="rounded-lg px-2 py-1.5 text-xs opacity-70 hover:bg-surface-950/50 hover:opacity-100"
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
