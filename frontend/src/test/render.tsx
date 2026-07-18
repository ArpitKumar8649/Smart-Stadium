import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { A11yProvider } from '../features/accessibility/A11yContext.tsx';
import { AlertProvider } from '../features/alerts/AlertContext.tsx';

export function renderWithRouter(ui: ReactElement, initialEntries: string[] = ['/'], options?: RenderOptions) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>, options);
}

export function renderWithAppProviders(
  ui: ReactElement,
  initialEntries: string[] = ['/'],
  options?: RenderOptions,
) {
  return renderWithRouter(
    <A11yProvider>
      <AlertProvider>{ui}</AlertProvider>
    </A11yProvider>,
    initialEntries,
    options,
  );
}

export function Harness({ children }: { children: ReactNode }) {
  return <A11yProvider>{children}</A11yProvider>;
}
