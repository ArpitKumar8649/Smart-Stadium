import { lazy, Suspense, useEffect, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Landing from '../routes/Landing.tsx';

import { AlertProvider } from '../features/alerts/AlertContext.tsx';
import { A11yProvider } from '../features/accessibility/A11yContext.tsx';
import { OfflineBanner } from '../components/layout/OfflineBanner.tsx';

const Concierge = lazy(() => import('../routes/Concierge.tsx'));
const Navigate = lazy(() => import('../routes/Navigate.tsx'));
const Admin = lazy(() => import('../routes/Admin.tsx'));
const NotFound = lazy(() => import('../routes/NotFound.tsx'));

function RouteFallback() {
  return <main className="min-h-screen bg-surface-950" aria-busy="true" aria-label="Loading page" />;
}

function AppRoutes() {
  const { pathname } = useLocation();
  const routesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Lazy routes can still be suspended when the pathname first changes. Limit
    // the search to the current route outlet so a hidden previous route cannot
    // receive focus before the destination landmark renders.
    let focused = false;
    const focusPage = () => {
      if (focused) return;
      const page = routesRef.current?.querySelector<HTMLElement>('#main-content');
      if (!page) return;
      page.focus();
      focused = true;
      observer.disconnect();
    };
    const observer = new MutationObserver(focusPage);
    const root = routesRef.current;
    if (root) observer.observe(root, { childList: true, subtree: true });
    focusPage();
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-primary px-4 py-2 font-semibold text-surface-950 focus:not-sr-only"
      >
        Skip to main content
      </a>
      <OfflineBanner />
      <div key={pathname} ref={routesRef}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/concierge" element={<Concierge />} />
            <Route path="/navigate" element={<Navigate />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>
    </>
  );
}

export default function App() {
  return (
    <A11yProvider>
      <AlertProvider>
        <AppRoutes />
      </AlertProvider>
    </A11yProvider>
  );
}
