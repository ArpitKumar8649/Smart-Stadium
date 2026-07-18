import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import Admin from './Admin.tsx';
import { makeBriefing, makeCrowdHeatmapResponse, makeCrowdZone } from '../test/factories.ts';

// Mock the session hook to easily control auth state
let mockSessionState = {
  token: '',
  authed: false,
  user: null,
  authError: null,
  authLoading: false,
  setAuthed: vi.fn(),
  signOut: vi.fn(),
  clearError: vi.fn(),
  getFreshToken: vi.fn(),
};

vi.mock('../features/admin/useAdminSession.ts', () => ({
  useAdminSession: () => mockSessionState,
}));

vi.mock('../features/navigate/MapCanvas.tsx', () => ({
  MapCanvas: () => <div>Admin tactical map</div>,
}));

vi.mock('../features/admin/PaTranslatorPanel.tsx', () => ({
  PaTranslatorPanel: ({ onUnauthorized }: { onUnauthorized: () => void }) => (
    <button type="button" onClick={onUnauthorized}>PA unauthorized</button>
  ),
}));

describe('Admin route', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    
    mockSessionState = {
      token: 'fake-jwt-token',
      authed: true,
      user: { uid: '123' } as any,
      authError: null,
      authLoading: false,
      setAuthed: vi.fn((val) => { mockSessionState.authed = val; }),
      signOut: vi.fn(),
      clearError: vi.fn(),
      getFreshToken: vi.fn(),
    };
  });

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
  });

  const setupFetchMock = (overrides = {}) => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const target = String(url);
      
      for (const [key, handler] of Object.entries(overrides)) {
        if (target.includes(key)) {
          return (handler as (url: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>)(url, init);
        }
      }

      if (target.includes('/api/crowd/')) {
        return Response.json(makeCrowdHeatmapResponse({
          zones: [makeCrowdZone({ kind: 'food', label: '100 Concourse Food', zone_id: 'food-1' })],
        }));
      }
      if (target.includes('/api/admin/briefing')) return Response.json(makeBriefing());
      if (target.includes('/api/admin/demo/status')) return Response.json({ active: false });
      if (target.includes('/api/admin/demo/enable')) return Response.json({ message: 'Demo mode enabled. Simulation clock pinned to minute 40.' });
      if (target.includes('/api/admin/demo/disable')) return Response.json({ message: 'Live simulation restored.' });
      if (target.includes('/api/admin/incident')) return Response.json({ ok: true });
      if (target.includes('/api/admin/crowd/override')) return Response.json({ ok: true });
      return Response.json({});
    });
  };

  it('shows login form when not authenticated', async () => {
    mockSessionState.authed = false;
    render(<MemoryRouter><Admin /></MemoryRouter>);
    expect(await screen.findByText('Operations Command Center')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('hydrates ops data, toggles demo mode, injects incidents, and handles unauthorized child flows', async () => {
    const user = userEvent.setup();
    setupFetchMock();

    render(<MemoryRouter><Admin /></MemoryRouter>);

    expect(await screen.findByText('OPS COMMAND')).toBeInTheDocument();
    expect(await screen.findByText('Halftime crowd pressure rising')).toBeInTheDocument();
    expect(screen.getByText('Admin tactical map')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enable guided demo' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Demo mode enabled. Simulation clock pinned to minute 40.');

    await user.click(screen.getByRole('button', { name: 'Trigger 100 Concourse route advisory' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/incident', expect.objectContaining({ method: 'POST' })));

    await user.click(screen.getByRole('button', { name: 'PA unauthorized' }));
    
    // We expect setAuthed to have been called with false
    expect(mockSessionState.setAuthed).toHaveBeenCalledWith(false);
  });

  it('handles briefing 401 by resetting auth, and non-401 by showing error message', async () => {
    const user = userEvent.setup();
    let briefingCalls = 0;
    setupFetchMock({
      '/api/admin/briefing': () => {
        briefingCalls++;
        if (briefingCalls === 1) return new Response('', { status: 401 });
        if (briefingCalls === 2) return new Response('', { status: 500 });
        throw new Error('Network error');
      }
    });

    render(<MemoryRouter><Admin /></MemoryRouter>);

    // On first load, briefing returns 401, so setAuthed(false) should be called
    await waitFor(() => {
      expect(mockSessionState.setAuthed).toHaveBeenCalledWith(false);
    });

    // We can't easily re-render as authenticated without manually updating state and re-rendering,
    // so let's just render a new instance for the 500 error
    const { unmount } = render(<MemoryRouter><Admin /></MemoryRouter>);
    unmount(); // Unmount the first one
    
    mockSessionState.authed = true;
    render(<MemoryRouter><Admin /></MemoryRouter>);

    // On second load, briefing returns 500, so we should see an error message
    expect(await screen.findByText('Could not generate the operational briefing. Try refreshing it.')).toBeInTheDocument();

    // Click refresh
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    
    // On third load, briefing throws an error
    expect(await screen.findByText('Could not reach the briefing service.')).toBeInTheDocument();
  });

  it('handles demo toggle 401, 500, and network error', async () => {
    const user = userEvent.setup();
    let demoCalls = 0;
    setupFetchMock({
      '/api/admin/demo/enable': () => {
        demoCalls++;
        if (demoCalls === 1) return new Response('', { status: 401 });
        if (demoCalls === 2) return new Response('', { status: 500 });
        throw new Error('Network error');
      }
    });

    render(<MemoryRouter><Admin /></MemoryRouter>);
    expect(await screen.findByText('OPS COMMAND')).toBeInTheDocument();

    // 1. 401 Error
    await user.click(screen.getByRole('button', { name: 'Enable guided demo' }));
    await waitFor(() => {
      expect(mockSessionState.setAuthed).toHaveBeenCalledWith(false);
    });
    mockSessionState.setAuthed.mockClear();
    
    // Reset back to authed to test the other paths
    mockSessionState.authed = true;
    
    // 2. 500 Error
    // We need to re-render to pick up the authed state change
    const { unmount } = render(<MemoryRouter><Admin /></MemoryRouter>);
    await user.click(screen.getAllByRole('button', { name: 'Enable guided demo' })[0]);
    expect(await screen.findByRole('status')).toHaveTextContent('Could not update the guided demo state.');

    // 3. Network error
    await user.click(screen.getByRole('button', { name: 'Enable guided demo' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not reach the demo service.');
  });
});

describe('Admin route - edge cases', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    
    mockSessionState = {
      token: 'fake-jwt-token',
      authed: true,
      user: { uid: '123' } as any,
      authError: null,
      authLoading: false,
      setAuthed: vi.fn((val) => { mockSessionState.authed = val; }),
      signOut: vi.fn(),
      clearError: vi.fn(),
      getFreshToken: vi.fn(),
    };
  });

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
  });

  const setupFetchMock = (overrides = {}) => {
    fetchMock.mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const target = String(url);
      
      for (const [key, handler] of Object.entries(overrides)) {
        if (target.includes(key)) {
          return (handler as (url: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>)(url, init);
        }
      }

      if (target.includes('/api/crowd/')) {
        return Response.json(makeCrowdHeatmapResponse({
          zones: [makeCrowdZone({ kind: 'food', label: '100 Concourse Food', zone_id: 'food-1' })],
        }));
      }
      if (target.includes('/api/admin/briefing')) return Response.json(makeBriefing());
      if (target.includes('/api/admin/demo/status')) return Response.json({ active: false });
      if (target.includes('/api/admin/demo/enable')) return Response.json({ message: 'Demo mode enabled.' });
      if (target.includes('/api/admin/incident')) return Response.json({ ok: true });
      if (target.includes('/api/admin/crowd/override')) return Response.json({ ok: true });
      return Response.json({});
    });
  };

  it('handles crowd spiking', async () => {
    const user = userEvent.setup();
    setupFetchMock();

    render(<MemoryRouter><Admin /></MemoryRouter>);
    expect(await screen.findByText('OPS COMMAND')).toBeInTheDocument();

    // Select the zone
    await user.selectOptions(screen.getByRole('combobox', { name: 'Crowd scenario zone' }), 'food-1');

    // Click Spike crowd
    await user.click(screen.getByRole('button', { name: 'Spike crowd' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/crowd/override', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        venue_id: 'metlife',
        zone_id: 'food-1',
        density: 0.98,
        wait_seconds: 400,
        ttl_seconds: 300,
      })
    })));
  });

  it('handles refreshDemoStatus returning 401 or throwing error', async () => {
    let statusCalls = 0;
    setupFetchMock({
      '/api/admin/demo/status': () => {
        statusCalls++;
        if (statusCalls === 1) throw new Error('Network error');
        if (statusCalls === 2) return new Response('', { status: 401 });
        return Response.json({ active: false });
      },
    });

    render(<MemoryRouter><Admin /></MemoryRouter>);

    // On mount, demo/status throws error, which is caught silently. We should still see OPS COMMAND.
    expect(await screen.findByText('OPS COMMAND')).toBeInTheDocument();

    // Trigger visibility change to force refreshDemoStatus
    await waitFor(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // This second call to refreshDemoStatus returns 401
    await waitFor(() => {
      expect(mockSessionState.setAuthed).toHaveBeenCalledWith(false);
    });
  });
});
