import { useContext } from 'react';
import { AlertContext } from './alertContextValue.ts';

export function useAlerts() {
  return useContext(AlertContext);
}
