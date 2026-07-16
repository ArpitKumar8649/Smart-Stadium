import { createContext } from 'react';
import type { Alert } from '@concourse/shared';

type AlertContextType = {
  activeAlerts: Alert[];
  dismissAlert: (id: string) => void;
};

export const AlertContext = createContext<AlertContextType>({
  activeAlerts: [],
  dismissAlert: () => {},
});
