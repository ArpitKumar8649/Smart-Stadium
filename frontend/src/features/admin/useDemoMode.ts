import { useCallback, useState } from 'react';
import { z } from 'zod';
import { AdminDemoStatusSchema } from '@concourse/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function useDemoMode(authed: boolean, token: string, setAuthed: (v: boolean) => void) {
  const [demoActive, setDemoActive] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);

  const refreshDemoStatus = useCallback(async () => {
    if (!authed) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/demo/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        setAuthed(false);
        return;
      }
      if (response.ok) {
        const payload = AdminDemoStatusSchema.parse(await response.json());
        setDemoActive(payload.active === true);
      }
    } catch {
      // The control remains usable even when status hydration fails.
    }
  }, [authed, token, setAuthed]);

  const toggleDemoMode = async () => {
    const enable = !demoActive;
    setDemoLoading(true);
    setDemoMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/demo/${enable ? 'enable' : 'disable'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        if (response.status === 401) setAuthed(false);
        setDemoMessage('Could not update the guided demo state.');
        return;
      }
      const payload = z.object({ message: z.string().optional() }).parse(await response.json());
      setDemoActive(enable);
      setDemoMessage(payload.message ?? (enable ? 'Guided demo enabled.' : 'Live simulation restored.'));
    } catch {
      setDemoMessage('Could not reach the demo service.');
    } finally {
      setDemoLoading(false);
    }
  };

  return { demoActive, demoLoading, demoMessage, refreshDemoStatus, toggleDemoMode };
}
