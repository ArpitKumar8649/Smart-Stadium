import { useEffect, useRef } from 'react';
import type { NavigationRouteResponse, Alert } from '@concourse/shared';

export function useRouteAdvisoryRefresh({
  activeAlerts,
  route,
  planRoute,
  setLastAutoRefresh,
}: {
  activeAlerts: Alert[];
  route: NavigationRouteResponse | null;
  planRoute: (reason?: 'preference' | 'operational-advisory') => Promise<void>;
  setLastAutoRefresh: (message: string | null) => void;
}) {
  const reroutedAlertIds = useRef(new Set<string>());

  useEffect(() => {
    const relevantAlert = activeAlerts.find(
      (alert) =>
        !reroutedAlertIds.current.has(alert.id) &&
        !!alert.affected_node_id &&
        route?.points.some((point) => point.id === alert.affected_node_id)
    );
    if (!relevantAlert) return;
    reroutedAlertIds.current.add(relevantAlert.id);
    setLastAutoRefresh(`Route refreshed after the ${relevantAlert.title.toLowerCase()} advisory.`);
    void planRoute('operational-advisory');
  }, [activeAlerts, planRoute, route, setLastAutoRefresh]);
}
