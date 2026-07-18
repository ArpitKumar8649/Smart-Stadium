import { useCallback, useState } from 'react';
import { BriefingSchema, type Briefing } from '@concourse/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function useOperationalBriefing(authed: boolean, token: string, setAuthed: (v: boolean) => void) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const fetchBriefing = useCallback(async (force = false) => {
    if (!authed) return;
    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ venue_id: 'metlife', lang: 'en', force_refresh: force }),
      });
      if (res.ok) {
        setBriefing(BriefingSchema.parse(await res.json()));
      } else if (res.status === 401) {
        setAuthed(false);
      } else {
        setBriefingError('Could not generate the operational briefing. Try refreshing it.');
      }
    } catch {
      setBriefingError('Could not reach the briefing service.');
    } finally {
      setBriefingLoading(false);
    }
  }, [authed, token, setAuthed]);

  return { briefing, briefingLoading, briefingError, fetchBriefing };
}
