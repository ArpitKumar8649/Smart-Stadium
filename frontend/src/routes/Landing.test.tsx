import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Landing from './Landing.tsx';

const { navigate, cleanupWarmup } = vi.hoisted(() => ({
  navigate: vi.fn(),
  cleanupWarmup: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../lib/stadiumCache.ts', () => ({
  scheduleStadiumMapCacheWarmup: vi.fn(() => cleanupWarmup),
}));

vi.mock('../components/trophy/TrophyScene.tsx', () => ({ default: () => <div>Trophy scene</div> }));

describe('Landing route', () => {
  it('renders primary fan journeys, schedules cache warmup, and cleans up on unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MemoryRouter><Landing /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: /your ai companion/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /talk to concourse/i })).toHaveAttribute('href', '/concierge');
    expect(screen.getByRole('link', { name: /view tactical map/i })).toHaveAttribute('href', '/navigate');

    await user.click(screen.getByRole('button', { name: 'Staff' }));
    expect(navigate).toHaveBeenCalledWith('/admin');

    unmount();
    expect(cleanupWarmup).toHaveBeenCalled();
  });
});
