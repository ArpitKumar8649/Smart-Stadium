import { Route, Routes } from 'react-router-dom';
import Landing from '../routes/Landing.tsx';
import Concierge from '../routes/Concierge.tsx';
import Navigate from '../routes/Navigate.tsx';
import Admin from '../routes/Admin.tsx';
import NotFound from '../routes/NotFound.tsx';

import { AlertProvider } from '../features/alerts/AlertContext.tsx';
import { A11yProvider } from '../features/accessibility/A11yContext.tsx';
import { OfflineBanner } from '../components/layout/OfflineBanner.tsx';

export default function App() {
  return (
    <A11yProvider>
      <AlertProvider>
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
