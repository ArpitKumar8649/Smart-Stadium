import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Concierge from './Concierge.tsx';
import { A11yProvider } from '../features/accessibility/A11yContext.tsx';

const conciergeState = vi.hoisted(() => ({
  messages: [] as Array<{ id: string; role: 'user' | 'assistant'; text: string; streaming?: boolean; tools?: Array<{ id: string; name: string; ok?: boolean; summary?: string }> }>,
  busy: false,
  send: vi.fn(),
}));

vi.mock('../features/concierge/useConcierge.ts', () => ({
  useConcierge: () => conciergeState,
}));

vi.mock('../features/accessibility/SignReader.tsx', () => ({
  SignReader: ({ onDescription }: { onDescription: (text: string) => void }) => (
    <button type="button" onClick={() => onDescription('Gate C')}>Read sign mock</button>
  ),
}));

vi.mock('../features/accessibility/LiveCaptionPanel.tsx', () => ({
  LiveCaptionPanel: () => <div>Live captions mock</div>,
}));

vi.mock('../features/concierge/ConcourseMap.tsx', () => ({
  ConcourseMap: ({ focusSection, onSetLocation }: { focusSection?: string | null; onSetLocation?: (loc: { lat: number; lng: number }) => void }) => (
    <div>
      Map focus {focusSection ?? 'none'}
      <button type="button" onClick={() => onSetLocation?.({ lat: 1, lng: 2 })}>Set map location</button>
    </div>
  ),
}));

function renderConcierge() {
  return render(
    <MemoryRouter>
      <A11yProvider><Concierge /></A11yProvider>
    </MemoryRouter>,
  );
}

describe('Concierge route', () => {
  beforeEach(() => {
    conciergeState.messages = [];
    conciergeState.busy = false;
    conciergeState.send.mockReset();
    localStorage.setItem('concourse.session', 'session-test');
  });

  it('submits suggestions, updates document language direction, and sends sign descriptions', async () => {
    const user = userEvent.setup();
    renderConcierge();

    await user.selectOptions(screen.getByLabelText('Language'), 'ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');

    await user.click(screen.getByRole('button', { name: 'Nearest first aid on the 100 Concourse' }));
    expect(conciergeState.send).toHaveBeenCalledWith(
      'Nearest first aid on the 100 Concourse',
      'ar',
      undefined,
      undefined,
      [],
    );

    await user.click(screen.getByRole('button', { name: 'Read sign mock' }));
    expect(conciergeState.send).toHaveBeenLastCalledWith(
      'I saw a sign that says: Gate C. What does this mean?',
      'ar',
      undefined,
      undefined,
      [],
    );
  });

  it('handles geolocation denial, request-level location sharing, map disclosure, and section focus', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((_success, error) => error()),
      },
    });
    conciergeState.messages = [{ id: 'u1', role: 'user', text: 'Take me to Section 128' }];

    renderConcierge();

    await user.click(screen.getByRole('button', { name: /Map & route/i }));
    expect(screen.getAllByText(/Map focus 128/).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: 'Set map location' })[0]!);
    await user.click(screen.getByTitle('Share your saved location with this request only'));
    await user.type(screen.getByRole('textbox', { name: /Message Concourse with location shared/i }), 'route outside');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(conciergeState.send).toHaveBeenCalledWith('route outside', 'en', undefined, { lat: 1, lng: 2 }, []);
  });

  it('announces completed assistant replies to screen readers', async () => {
    conciergeState.messages = [{ id: 'a1', role: 'assistant', text: 'Use Gate C.', streaming: false }];
    renderConcierge();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Concourse replied: Use Gate C.'));
  });

  it('can type custom queries and toggle accessibility preferences', async () => {
    const user = userEvent.setup();
    renderConcierge();

    // Type query
    const input = screen.getByRole('textbox', { name: /Message Concourse/i });
    await user.type(input, 'Where is the bathroom?');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(conciergeState.send).toHaveBeenCalledWith(
      'Where is the bathroom?',
      'en',
      undefined,
      undefined,
      [],
    );

    // Toggle a11y panel and select step-free
    await user.click(screen.getByText(/Accessibility tools & preferences/i));
    await user.click(screen.getByRole('checkbox', { name: /Avoid stairs & escalators/i }));

    await user.type(input, 'Route to gate A');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    // Test GPS button with successful geolocation
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success) => success({ coords: { latitude: 40, longitude: -74 } })),
      },
    });

    // The button might disappear if GPS is set, so we can re-render or mock it first.
    // For now, let's just trigger it from the initial state in a new test block.

    expect(conciergeState.send).toHaveBeenLastCalledWith(
      'Route to gate A',
      'en',
      undefined,
      undefined,
      ['step_free'],
    );
  });

  it('handles GPS location sharing successfully', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success) => success({ coords: { latitude: 40, longitude: -74 } })),
      },
    });

    renderConcierge();
    await user.click(screen.getByRole('button', { name: /Share Location for Outdoor Routes/i }));

    // The button disappears on success because `gps` state is set
    expect(screen.queryByRole('button', { name: /Share Location for Outdoor Routes/i })).not.toBeInTheDocument();
  });

  it('handles unsupported GPS location sharing gracefully', async () => {
    const user = userEvent.setup();
    const originalGeo = navigator.geolocation;
    // @ts-expect-error forcing unsupported environment
    delete navigator.geolocation;

    renderConcierge();
    await user.click(screen.getByRole('button', { name: /Share Location for Outdoor Routes/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Location sharing is not supported/i);

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeo,
    });
  });
});
