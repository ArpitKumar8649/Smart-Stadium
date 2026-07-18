import { useCallback, useEffect, useState } from 'react';
import { CrowdHeatmapResponseSchema, type CrowdHeatmapResponse } from '@concourse/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function useCrowdHeatmap() {
  const [crowd, setCrowd] = useState<CrowdHeatmapResponse | null>(null);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);

  const refreshCrowd = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/crowd/metlife/heatmap`);
      if (!response.ok) throw new Error(`Crowd endpoint returned ${response.status}`);
      const data = CrowdHeatmapResponseSchema.parse(await response.json());
      setCrowd(data);
    } catch (caught) {
      console.error('Failed to refresh crowd heatmap', caught);
    }
  }, []);

  useEffect(() => {
    const syncPageVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', syncPageVisibility);
    return () => document.removeEventListener('visibilitychange', syncPageVisibility);
  }, []);

  useEffect(() => {
    if (!pageVisible) return undefined;
    void refreshCrowd();
    const timer = window.setInterval(() => void refreshCrowd(), 15_000);
    return () => window.clearInterval(timer);
  }, [pageVisible, refreshCrowd]);

  return { crowd };
}
