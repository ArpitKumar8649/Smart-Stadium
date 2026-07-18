import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App.tsx';

vi.mock('../routes/Landing.tsx', () => ({ default: () => <main id="main-content" tabIndex={-1}>Landing page</main> }));
vi.mock('../routes/Concierge.tsx', () => ({ default: () => <main id="main-content" tabIndex={-1}>Concierge page</main> }));
vi.mock('../routes/Navigate.tsx', () => ({ default: () => <main id="main-content" tabIndex={-1}>Navigate page</main> }));
vi.mock('../routes/Admin.tsx', () => ({ default: () => <main id="main-content" tabIndex={-1}>Admin page</main> }));
vi.mock('../routes/NotFound.tsx', () => ({ default: () => <main id="main-content" tabIndex={-1}>Missing page</main> }));
vi.mock('../components/layout/OfflineBanner.tsx', () => ({ OfflineBanner: () => <div role="alert">offline</div> }));
vi.mock('../features/alerts/AlertContext.tsx', () => ({ AlertProvider: ({ children }: { children: ReactNode }) => <>{children}</> }));

describe('App', () => {
  it('wires providers, skip link, offline banner, lazy routes, and route focus', async () => {
    render(<MemoryRouter initialEntries={['/navigate']}><App /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('alert')).toHaveTextContent('offline');
    expect(await screen.findByText('Navigate page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Navigate page')).toHaveFocus());
  });

  it('renders the not-found route for unknown paths', async () => {
    render(<MemoryRouter initialEntries={['/unknown']}><App /></MemoryRouter>);
    expect(await screen.findByText('Missing page')).toBeInTheDocument();
  });
});
