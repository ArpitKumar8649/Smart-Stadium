import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RouteSearchForm } from './RouteSearchForm';
import { RouteSummaryPanel } from './RouteSummaryPanel';
import { AlertFeedPanel } from './AlertFeedPanel';
import { BusiestZonesPanel } from './BusiestZonesPanel';

describe('RouteSearchForm', () => {
  it('handles input changes', async () => {
    const user = userEvent.setup();
    const planRoute = vi.fn();
    const setFromLabel = vi.fn();
    const setToLabel = vi.fn();
    const setMode = vi.fn();
    render(<RouteSearchForm fromLabel="Gate" toLabel="Seat" planRoute={planRoute} loadingRoute={false} setFromLabel={setFromLabel} setToLabel={setToLabel} mode="step_free" setMode={setMode} />);

    const fromInput = screen.getByLabelText('From');
    const toInput = screen.getByLabelText('To');

    await user.clear(fromInput);
    await user.type(fromInput, 'A');

    await user.clear(toInput);
    await user.type(toInput, 'B');

    await user.click(screen.getByRole('button', { name: 'Plan route' }));

    expect(planRoute).toHaveBeenCalled();
  });
});

describe('RouteSummaryPanel', () => {
  it('formats short times in seconds and shows step-free access', () => {
    render(<RouteSummaryPanel
      routeFromCache={false}
      route={{
        route_id: '1',
        total_distance_m: 10,
        total_seconds: 45,
        step_free: true,
        warnings: [],
        path: [],
        steps: [],
        from: { label: 'Start' },
        to: { label: 'End' }
      } as any}
    />);

    expect(screen.getByText('45 sec')).toBeInTheDocument();
    expect(screen.getByText('Step-free')).toBeInTheDocument();
  });
});

describe('AlertFeedPanel', () => {
  it('triggers planRoute and dismissAlert', async () => {
    const user = userEvent.setup();
    const planRoute = vi.fn();
    const dismissAlert = vi.fn();

    render(<AlertFeedPanel
      activeAlerts={[{ id: 'a1', severity: 'warn', title: 'Test Alert', body: 'Warning body' }]}
      planRoute={planRoute}
      dismissAlert={dismissAlert}
    />);

    await user.click(screen.getByRole('button', { name: 'Re-plan Route' }));
    expect(planRoute).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Dismiss alert' }));
    expect(dismissAlert).toHaveBeenCalledWith('a1');
  });
});

describe('BusiestZonesPanel', () => {
  it('calls onFocus when zone is clicked', async () => {
    const user = userEvent.setup();
    const onFocus = vi.fn();
    const zones = [
      { zone_id: 'z1', level: 1, label: 'Zone 1', density: 0.9, predictions: [] }
    ];

    render(<BusiestZonesPanel activeZones={zones as any} forecast={0} setSelectedZone={onFocus} />);
    await user.click(screen.getByRole('button'));
    expect(onFocus).toHaveBeenCalledWith(zones[0]);
  });
});

import { renderHook } from '@testing-library/react';
import { useCrowdHeatmap } from './useCrowdHeatmap';

describe('useCrowdHeatmap', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches crowd data and handles errors', async () => {
    vi.useFakeTimers();
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        timestamp: new Date().toISOString(),
        venue: 'metlife',
        zones: []
      })
    } as any);

    const { result, unmount } = renderHook(() => useCrowdHeatmap());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.crowd).toBeDefined();

    // Fire visibility change to hidden
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Fire visibility change to visible
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Advance timer to trigger interval
    act(() => {
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));
      vi.advanceTimersByTime(15000);
    });

    unmount();
    vi.useRealTimers();
  });
});
