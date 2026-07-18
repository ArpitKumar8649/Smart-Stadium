import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertProvider } from './AlertContext.tsx';
import { useAlerts } from './useAlerts.ts';
import { installMockEventSource, MockEventSource } from '../../test/mockEventSource.ts';
import { makeAlert } from '../../test/factories.ts';

function AlertProbe() {
  const { activeAlerts, dismissAlert } = useAlerts();
  return (
    <div>
      <output aria-label="alert-count">{activeAlerts.length}</output>
      <ul>
        {activeAlerts.map((alert) => (
          <li key={alert.id}>
            <span>{alert.title}</span>
            <button type="button" onClick={() => dismissAlert(alert.id)}>Dismiss {alert.title}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('AlertProvider', () => {
  beforeEach(() => {
    installMockEventSource();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T00:00:00.000Z'));
  });

  it('syncs, prepends unique alerts, ignores malformed pings, filters dismissal and expiry', async () => {
    const expired = makeAlert({ id: 'expired', title: 'Expired', expires_at: '2026-07-17T23:59:00.000Z' });
    const current = makeAlert({ id: 'current', title: 'Current advisory' });

    render(<AlertProvider><AlertProbe /></AlertProvider>);

    expect(MockEventSource.instances[0]?.url).toBe('/api/alerts/stream');

    await act(async () => {
      MockEventSource.instances[0]?.emitMessage({ type: 'sync', alerts: [expired, current] });
    });

    expect(screen.getByLabelText('alert-count')).toHaveTextContent('1');
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();
    expect(screen.getByText('Current advisory')).toBeInTheDocument();

    await act(async () => {
      MockEventSource.instances[0]?.emitMessage({ type: 'alert', alert: current });
      MockEventSource.instances[0]?.emitMessage('not json');
      MockEventSource.instances[0]?.emitMessage({ type: 'alert', alert: makeAlert({ id: 'fresh', title: 'Fresh advisory' }) });
    });

    expect(screen.getByLabelText('alert-count')).toHaveTextContent('2');
    expect(screen.getByText('Fresh advisory')).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: 'Dismiss Fresh advisory' }).click();
    });

    expect(screen.queryByText('Fresh advisory')).not.toBeInTheDocument();
    expect(screen.getByLabelText('alert-count')).toHaveTextContent('1');
  });

  it('reconnects with exponential backoff, resets after open, and closes on cleanup', async () => {
    const { unmount } = render(<AlertProvider><AlertProbe /></AlertProvider>);
    const first = MockEventSource.instances[0];
    expect(first).toBeDefined();

    await act(async () => {
      first?.emitError();
    });

    expect(first?.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(999);
    });
    expect(MockEventSource.instances).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(MockEventSource.instances).toHaveLength(2);

    await act(async () => {
      MockEventSource.instances[1]?.emitError();
      vi.advanceTimersByTime(2_000);
    });
    expect(MockEventSource.instances).toHaveLength(3);

    await act(async () => {
      MockEventSource.instances[2]?.emitOpen();
      MockEventSource.instances[2]?.emitError();
      vi.advanceTimersByTime(1_000);
    });
    expect(MockEventSource.instances).toHaveLength(4);

    const latest = MockEventSource.instances[3];
    unmount();
    expect(latest?.closed).toBe(true);
  });
});
