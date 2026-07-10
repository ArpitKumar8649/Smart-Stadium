import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Alert } from '@concourse/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

type AlertContextType = {
  activeAlerts: Alert[];
  dismissAlert: (id: string) => void;
};

const AlertContext = createContext<AlertContextType>({
  activeAlerts: [],
  dismissAlert: () => {},
});

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let es: EventSource | null = null;
    let mounted = true;
    let retryCount = 0;

    const connect = () => {
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
        setTimeout(connect, delay);
      };

      es.onopen = () => {
        retryCount = 0;
      };
    };

    connect();

    return () => {
      mounted = false;
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

export function useAlerts() {
  return useContext(AlertContext);
}
