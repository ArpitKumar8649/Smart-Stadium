import { useCallback, useEffect, useRef, useState } from 'react';
import { getCachedRoute, saveRouteToCache } from '../../lib/stadiumCache';
import {
  NavigationRouteResponseSchema,
  type NavigationRouteResponse,
  type RoutingMode,
} from '@concourse/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

type RouteRefreshReason = 'preference' | 'operational-advisory';

export function useNavigationSearch({
  fromLabel,
  toLabel,
  mode,
  onRouteFound,
}: {
  fromLabel: string;
  toLabel: string;
  mode: RoutingMode;
  onRouteFound: (route: NavigationRouteResponse) => void;
}) {
  const [route, setRoute] = useState<NavigationRouteResponse | null>(null);
  const [routeFromCache, setRouteFromCache] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAutoRefresh, setLastAutoRefresh] = useState<string | null>(null);

  const planRoute = useCallback(
    async (reason?: RouteRefreshReason) => {
      if (!fromLabel.trim() || !toLabel.trim()) return;
      const cacheKey = { fromLabel, toLabel, mode };
      setLoadingRoute(true);
      setError(null);
      setRouteFromCache(false);
      try {
        const response = await fetch(`${API_BASE}/api/navigation/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from_label: fromLabel, to_label: toLabel, mode }),
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof payload === 'object' &&
            payload !== null &&
            'error' in payload &&
            typeof payload.error === 'object' &&
            payload.error !== null &&
            'message' in payload.error &&
            typeof payload.error.message === 'string'
              ? payload.error.message
              : 'Could not calculate that route.';
          throw new Error(message);
        }
        const parsed = NavigationRouteResponseSchema.safeParse(payload);
        if (!parsed.success)
          throw new Error('The route service returned an invalid route. Please try again.');
        const routeResponse = parsed.data;
        setRoute(routeResponse);
        onRouteFound(routeResponse);
        if (reason === 'preference') {
          setLastAutoRefresh(`Route updated for your ${mode.replace('_', '-')} preference.`);
        }
        void saveRouteToCache(cacheKey, routeResponse);
      } catch (caught) {
        const cached = await getCachedRoute<unknown>(cacheKey);
        const parsedCache = NavigationRouteResponseSchema.safeParse(cached);
        if (parsedCache.success) {
          setRoute(parsedCache.data);
          onRouteFound(parsedCache.data);
          setRouteFromCache(true);
        } else {
          setError(caught instanceof Error ? caught.message : 'Could not calculate that route.');
          setRoute(null);
        }
      } finally {
        setLoadingRoute(false);
      }
    },
    [fromLabel, mode, toLabel, onRouteFound]
  );

  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    void planRoute('preference');
  }, [mode, planRoute]);

  useEffect(() => {
    void planRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { route, routeFromCache, loadingRoute, error, lastAutoRefresh, setLastAutoRefresh, planRoute };
}
