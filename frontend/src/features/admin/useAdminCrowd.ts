import { useCallback, useState } from 'react';
import { CrowdHeatmapResponseSchema, type CrowdHeatmapResponse } from '@concourse/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function useAdminCrowd(authed: boolean) {
  const [crowd, setCrowd] = useState<CrowdHeatmapResponse | null>(null);

  const refreshCrowd = useCallback(async () => {
    if (!authed) return;
    try {
      const res = await fetch(`${API_BASE}/api/crowd/metlife/heatmap`);
      if (res.ok) setCrowd(CrowdHeatmapResponseSchema.parse(await res.json()));
    } catch { /* ignore */ }
  }, [authed]);

  return { crowd, refreshCrowd };
}
