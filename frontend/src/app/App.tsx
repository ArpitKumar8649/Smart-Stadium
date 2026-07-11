import { Route, Routes, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import Landing from '../routes/Landing.tsx';
import Concierge from '../routes/Concierge.tsx';
import Navigate from '../routes/Navigate.tsx';
import Admin from '../routes/Admin.tsx';
import NotFound from '../routes/NotFound.tsx';

import { AlertProvider } from '../features/alerts/AlertContext.tsx';
import { A11yProvider } from '../features/accessibility/A11yContext.tsx';
import { OfflineBanner } from '../components/layout/OfflineBanner.tsx';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const DEMO_TOKEN = import.meta.env.VITE_ADMIN_DEMO_TOKEN ?? 'concourse-local-admin-2026';

function DemoModeManager() {
  const [searchParams] = useSearchParams();
  const demoInit = useRef(false);

  useEffect(() => {
    if (searchParams.get('demo') === '1' && !demoInit.current) {
      demoInit.current = true;
      // Auto-configure the backend for the demo scenario
      fetch(`${API_BASE}/api/admin/demo/enable`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${DEMO_TOKEN}` }
      }).catch(console.error);

      // Add a visual indicator
      const banner = document.createElement('div');
      banner.className = 'fixed top-0 left-1/2 -translate-x-1/2 z-50 rounded-b-lg bg-accent-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-surface-950 shadow-lg';
      banner.textContent = 'Demo Mode Active';
      document.body.appendChild(banner);
    }
  }, [searchParams]);

  return null;
}

export default function App() {
  return (
    <A11yProvider>
      <AlertProvider>
        <DemoModeManager />
        <OfflineBanner />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/concierge" element={<Concierge />} />
          <Route path="/navigate" element={<Navigate />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AlertProvider>
    </A11yProvider>
  );
}
