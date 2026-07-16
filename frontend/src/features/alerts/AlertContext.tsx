import { useEffect, useState, type ReactNode } from 'react';
import type { Alert } from '@concourse/shared';
import { AlertContext } from './alertContextValue.ts';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let mounted = true;
    let retryCount = 0;

    const connect = () => {
      if (!mounted) return;
      // A production build must use the public API origin. Falling back to the
      // Hosting origin would make Firebase's SPA rewrite return HTML to EventSource.
      if (!API_BASE && !import.meta.env.DEV) {
        console.error('Live alerts are unavailable because the public API URL is not configured.');
        return;
      }
      es = new EventSource(`${API_BASE}/api/alerts/stream`);

      es.onmessage = (event) => {
        if (!mounted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'sync') {
            setAlerts(data.alerts);
          } else if (data.type === 'alert') {
            setAlerts((prev) => {
              // Ensure uniqueness if we get duplicates via reconnects
              const exists = prev.find((a) => a.id === data.alert.id);
              if (exists) return prev;
              return [data.alert, ...prev];
            });
          }
        } catch { /* ignore heartbeat pings */ }
      };

      es.onerror = () => {
        if (!mounted) return;
        es?.close();
        // Exponential backoff reconnect: 1s, 2s, 4s... max 30s
        const delay = Math.min(1000 * 2 ** retryCount, 30000);
        retryCount++;
        reconnectTimer = window.setTimeout(connect, delay);
      };

      es.onopen = () => {
        retryCount = 0;
      };
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []);

  // Filter out expired and user-dismissed alerts
  const activeAlerts = alerts.filter((a) => {
    if (dismissed.has(a.id)) return false;
    if (a.expires_at && Date.now() > Date.parse(a.expires_at)) return false;
    return true;
  });

  const dismissAlert = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <AlertContext.Provider value={{ activeAlerts, dismissAlert }}>
      {children}
    </AlertContext.Provider>
  );
}
