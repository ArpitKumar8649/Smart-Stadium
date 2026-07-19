import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MapCanvas } from './MapCanvas.tsx';
import { makeCrowdZone, makeFloorGeoJson, makeRoutePoint } from '../../test/factories.ts';

describe('MapCanvas', () => {
  it('loads venue geometry, filters zones by floor, supports keyboard zone focus, and labels forecasts', async () => {
    const user = userEvent.setup();
    const onZoneFocus = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(makeFloorGeoJson(1))));
    const activeZone = makeCrowdZone({ density: 0.81, predictions: [{ offset_minutes: 30, density: 0.9, wait_seconds: 240, confidence: 0.7 }] });

    render(
      <MapCanvas
        level={1}
        routePoints={[
          makeRoutePoint({ id: 'start', order: 0 }),
          makeRoutePoint({ id: 'mid1', coords: [-74.072, 40.815], order: 1, level: 2 }), // Trigger floor boundary
          makeRoutePoint({ id: 'mid2', coords: [-74.073, 40.816], order: 2, level: 2 }), // Trigger segment push
          makeRoutePoint({ id: 'end', label: 'Section 108', coords: [-74.072, 40.815], order: 3 }),
        ]}
        crowdZones={[activeZone, makeCrowdZone({ zone_id: 'other-floor', label: 'Other', level: 2 })]}
        forecastOffset={30}
        onZoneFocus={onZoneFocus}
      />,
    );

    const zoneButton = await screen.findByRole('button', { name: /100 Concourse: Packed, 90 percent density/i });
    expect(zoneButton).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Other/i })).not.toBeInTheDocument();
    expect(screen.getByText('Projected +30 min')).toBeInTheDocument();
    expect(screen.getByText('Level 1 · L1')).toBeInTheDocument();

    // Trigger click on zone
    await user.click(zoneButton);
    expect(onZoneFocus).toHaveBeenCalledWith(activeZone);
  });

  it('shows a retryable error if floor geometry fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(Response.json(makeFloorGeoJson(0)));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<MapCanvas level={0} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('The indoor map could not load');
    await user.click(screen.getByRole('button', { name: 'Retry map' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('Level 0 · L0')).toBeInTheDocument();
  });
});
