import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConcourseMap } from './ConcourseMap.tsx';

vi.mock('./OutdoorMap.tsx', () => ({
  OutdoorMap: () => <div>Outdoor 2D map</div>,
}));

vi.mock('./StadiumMap3D.tsx', () => ({
  StadiumMap3D: ({ focusSection }: { focusSection?: string | null }) => {
    if (focusSection === 'error') {
      throw new Error('3D rendering failed');
    }
    return <div>3D map {focusSection}</div>;
  },
}));

// Suppress React error logging in tests when we intentionally throw
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (args[0]?.includes?.('3D rendering failed') || args[0]?.includes?.('React will try to recreate this component tree')) {
      return;
    }
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});

describe('ConcourseMap', () => {
  it('starts in 2D, lets the user choose 3D, and auto-switches for focused sections unless 2D is preferred', async () => {
    const user = userEvent.setup();
    const handleSetLocation = vi.fn();
    const { rerender } = render(<ConcourseMap userLocation={{ lat: 0, lng: 0 }} encodedPolyline="test-poly" onSetLocation={handleSetLocation} />);

    expect(screen.getByText('Outdoor 2D map')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '3D view' }));
    expect(await screen.findByText(/3D map/i)).toBeInTheDocument();

    rerender(<ConcourseMap userLocation={{ lat: 0, lng: 0 }} focusSection="128" encodedPolyline="test-poly" />);
    expect(await screen.findByText('3D map 128')).toBeInTheDocument();

    rerender(<ConcourseMap userLocation={null} focusSection="129" prefer2d />);
    await user.click(screen.getByRole('button', { name: '2D map' }));
    expect(screen.getByText('Outdoor 2D map')).toBeInTheDocument();
  });

  it('handles 3D map errors gracefully and allows fallback to 2D', async () => {
    const user = userEvent.setup();
    render(<ConcourseMap userLocation={null} focusSection="error" />);
    
    // It should try to render 3D, fail, and show the fallback UI
    expect(await screen.findByText('3D map unavailable')).toBeInTheDocument();
    
    // User clicks fallback button
    await user.click(screen.getByRole('button', { name: /Back to 2D/i }));
    
    // Should be back to 2D
    expect(screen.getByText('Outdoor 2D map')).toBeInTheDocument();
  });
});
