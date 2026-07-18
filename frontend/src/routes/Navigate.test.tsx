import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Navigate from './Navigate.tsx';
import { AlertContext } from '../features/alerts/alertContextValue.ts';
import { A11yContext } from '../features/accessibility/a11yContextValue.ts';
import { A11yProvider } from '../features/accessibility/A11yContext.tsx';
import { makeAlert, makeCrowdHeatmapResponse, makeNavigationRouteResponse } from '../test/factories.ts';
import { installCacheStorage } from '../test/cacheStorageMock.ts';
import { saveRouteToCache } from '../lib/stadiumCache.ts';

vi.mock('../features/navigate/MapCanvas.tsx', () => ({
  MapCanvas: ({ crowdZones = [], onZoneFocus, forecastOffset }: { crowdZones?: Array<{ label: string }>; onZoneFocus?: (zone: unknown) => void; forecastOffset?: number }) => (
    <div aria-label="mock map">
      <span>Forecast {forecastOffset}</span>
      {crowdZones.map((zone) => (
        <button key={zone.label} type="button" onClick={() => onZoneFocus?.(zone)}>{zone.label}</button>
      ))}
    </div>
  ),
}));

function renderNavigate(alerts = [] as ReturnType<typeof makeAlert>[]) {
  return render(
    <MemoryRouter>
      <A11yProvider>
        <AlertContext.Provider value={{ activeAlerts: alerts, dismissAlert: vi.fn() }}>
          <Navigate />
        </AlertContext.Provider>
      </A11yProvider>
    </MemoryRouter>,
  );
}

describe('Navigate route', () => {
  beforeEach(() => {
    installCacheStorage();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('loads default route and heatmap, refreshes on preference change, and exposes zone detail', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/crowd/')) return Response.json(makeCrowdHeatmapResponse());
      return Response.json(makeNavigationRouteResponse({ warnings: ['Some warning'] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderNavigate();

    expect(await screen.findByText('Section 144')).toBeInTheDocument();
    expect(screen.getByText('to Section 108')).toBeInTheDocument();
    expect(screen.getByText('Some warning')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Preference' }), 'step_free');
    expect(await screen.findByRole('status')).toHaveTextContent('Route updated for your step-free preference.');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Preference' }), 'sensory_safe');
    expect(await screen.findByRole('status')).toHaveTextContent('Route updated for your sensory-safe preference.');

    await user.click(screen.getByRole('button', { name: '+30m' }));
    expect(screen.getByText('Forecast 30')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '100 Concourse' }));
    expect(screen.getAllByText('Packed').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/navigation/route', expect.objectContaining({ method: 'POST' }));

    // Change floor
    await user.click(screen.getByRole('button', { name: 'Suite 3' }));
  });

  it('falls back to a valid cached route when live routing fails schema validation', async () => {
    await saveRouteToCache(
      { fromLabel: 'Section 144', toLabel: 'Section 108', mode: 'low_crowd' },
      makeNavigationRouteResponse({ total_seconds: 180 }),
    );
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/crowd/')) return Response.json(makeCrowdHeatmapResponse());
      return Response.json({ invalid: true });
    }));

    renderNavigate();

    expect(await screen.findByText('Showing your saved route while live routing reconnects.')).toBeInTheDocument();
    expect(screen.getByText('3 min')).toBeInTheDocument();
  });

  it('shows error when live routing fails and no cache exists, and handles form submission', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/crowd/')) throw new Error('Crowd fetch failed'); // Covers lines 81-82
      return Response.json({}, { status: 400 }); // Covers 126
    }));

    const user = userEvent.setup();
    renderNavigate();

    // Will attempt to load on mount and fail, getting the specific error message
    expect(await screen.findByText('Could not calculate that route.')).toBeInTheDocument();

    // Now try to submit the form again
    await user.click(screen.getByRole('button', { name: 'Plan route' }));

    // Still fails
    expect(await screen.findByText('Could not calculate that route.')).toBeInTheDocument();
  });

  it('shows active alerts and auto-reroutes when an advisory intersects the route', async () => {
    const route = makeNavigationRouteResponse();
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/crowd/')) return Response.json(makeCrowdHeatmapResponse());
      return Response.json(route);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderNavigate();
    expect(await screen.findByText('Section 144')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <A11yProvider>
          <AlertContext.Provider value={{
            activeAlerts: [
              makeAlert(),
              makeAlert({ id: 'critical-1', severity: 'critical', title: 'Critical alert', body: 'Critical body', affected_node_id: undefined }),
              makeAlert({ id: 'info-1', severity: 'info', title: 'Info alert', body: 'Info body', affected_node_id: undefined })
            ],
            dismissAlert: vi.fn()
          }}>
            <Navigate />
          </AlertContext.Provider>
        </A11yProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '100 Concourse route advisory' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Critical alert' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Info alert' })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Route refreshed after the 100 concourse route advisory advisory.'));
  });

  it('updates mode when a11y preferences change', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/crowd/')) return Response.json(makeCrowdHeatmapResponse());
      return Response.json(makeNavigationRouteResponse());
    }));

    const Wrapper = ({ stepFree }: { stepFree: boolean }) => (
      <MemoryRouter>
        <A11yContext.Provider value={{ prefs: { step_free: stepFree, sensory_safe: false, large_text: false, screen_reader: false, reduce_motion: false }, updatePref: vi.fn() }}>
          <AlertContext.Provider value={{ activeAlerts: [], dismissAlert: vi.fn() }}>
            <Navigate />
          </AlertContext.Provider>
        </A11yContext.Provider>
      </MemoryRouter>
    );

    const { rerender } = render(<Wrapper stepFree={false} />);
    expect(await screen.findByText('Section 144')).toBeInTheDocument();

    // Now re-render with stepFree=true, which triggers the effect WITHOUT unmounting!
    rerender(<Wrapper stepFree={true} />);

    // After re-rendering with new context, mode should update to step_free
    expect(screen.getByRole('combobox', { name: 'Preference' })).toHaveValue('step_free');
  });
});
