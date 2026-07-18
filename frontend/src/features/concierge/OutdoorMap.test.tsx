import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OutdoorMap } from './OutdoorMap.tsx';

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    latLngBounds: vi.fn((points: unknown[]) => ({ points, extend: vi.fn() })),
  },
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="leaflet-map">{children}</div>,
  TileLayer: () => <div>Tile layer</div>,
  Marker: ({ position }: { position: [number, number] }) => <div>Marker {position.join(',')}</div>,
  Polyline: ({ positions }: { positions: [number, number][] }) => <div>Polyline {positions.length}</div>,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn(), getZoom: () => 15 }),
}));

describe('OutdoorMap', () => {
  it('renders location and route overlays through the Leaflet adapter boundary', () => {
    render(<OutdoorMap userLocation={{ lat: 40.1, lng: -74.1 }} encodedPolyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@" />);

    expect(screen.getByTestId('leaflet-map')).toBeInTheDocument();
    expect(screen.getByText('Marker 40.1,-74.1')).toBeInTheDocument();
    expect(screen.getByText('Polyline 3')).toBeInTheDocument();
  });

  it('validates manual location overrides and supports the demo preset', async () => {
    const user = userEvent.setup();
    const onSetLocation = vi.fn();
    render(<OutdoorMap userLocation={null} onSetLocation={onSetLocation} />);

    await user.click(screen.getByRole('button', { name: 'Set or override my location' }));
    await user.type(screen.getByLabelText('Latitude'), '120');
    await user.type(screen.getByLabelText('Longitude'), '-200');
    await user.click(screen.getByRole('button', { name: 'Set location' }));
    expect(screen.getByText('Lat must be −90…90, lng −180…180.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Use Newark/ }));
    expect(onSetLocation).toHaveBeenCalledWith({ lat: 40.7357, lng: -74.1724 });
  });
});
