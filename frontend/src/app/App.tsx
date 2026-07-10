import { Route, Routes } from 'react-router-dom';
import Landing from '../routes/Landing.tsx';
import Concierge from '../routes/Concierge.tsx';
import NotFound from '../routes/NotFound.tsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/concierge" element={<Concierge />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
