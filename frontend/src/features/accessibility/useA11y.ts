import { useContext } from 'react';
import { A11yContext } from './a11yContextValue.ts';

export function useA11y() {
  return useContext(A11yContext);
}
