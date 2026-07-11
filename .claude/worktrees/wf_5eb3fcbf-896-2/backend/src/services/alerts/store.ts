import { randomUUID } from 'node:crypto';
import type { Alert, Incident } from '@concourse/shared';
import { logger } from '../../middleware/logger.js';

export type AlertListener = (alert: Alert) => void;

const MAX_ALERT_HISTORY = 50;
const MAX_INCIDENT_HISTORY = 100;

/**
 * Small in-memory alert/event store for the single-instance Azure F1 demo.
 *
 * It deliberately keeps a short replay buffer so a reconnecting fan gets the
 * latest alerts rather than a blank screen. A real multi-instance deployment
 * swaps this seam for Firestore/PubSub without changing routes or the frontend
 * SSE protocol.
 */
class AlertStore {
  private readonly alerts: Alert[] = [];
  private readonly incidents: Incident[] = [];
  private readonly listeners = new Set<AlertListener>();

  emit(alert: Omit<Alert, 'id' | 'emitted_at'> & Partial<Pick<Alert, 'id' | 'emitted_at'>>): Alert {
    const next: Alert = {
      id: alert.id ?? randomUUID(),
      kind: alert.kind,
      severity: alert.severity,
      title: alert.title,
      body: alert.body,
      emitted_at: alert.emitted_at ?? new Date().toISOString(),
      ...(alert.action_label ? { action_label: alert.action_label } : {}),
      ...(alert.action_href ? { action_href: alert.action_href } : {}),
      ...(alert.expires_at ? { expires_at: alert.expires_at } : {}),
      ...(alert.affected_zone_id ? { affected_zone_id: alert.affected_zone_id } : {}),
      ...(alert.affected_gate_id ? { affected_gate_id: alert.affected_gate_id } : {}),
    };

    this.alerts.unshift(next);
    this.alerts.splice(MAX_ALERT_HISTORY);
    for (const listener of this.listeners) listener(next);
    logger.info({ alertId: next.id, kind: next.kind, severity: next.severity }, 'fan alert emitted');
    return next;
  }

  addIncident(incident: Incident): Incident {
    this.incidents.unshift(incident);
    this.incidents.splice(MAX_INCIDENT_HISTORY);
    return incident;
  }

  recentAlerts(limit = 10): Alert[] {
    const now = Date.now();
    return this.alerts
      .filter((alert) => !alert.expires_at || Date.parse(alert.expires_at) > now)
      .slice(0, limit);
  }

  recentIncidents(limit = 10): Incident[] {
    return this.incidents.slice(0, limit);
  }

  subscribe(listener: AlertListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const alertStore = new AlertStore();
