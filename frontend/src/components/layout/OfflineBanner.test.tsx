import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OfflineBanner } from './OfflineBanner.tsx';

describe('OfflineBanner', () => {
  it('is hidden online and announces cached mode offline', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const { rerender } = render(<OfflineBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
    });
    rerender(<OfflineBanner />);

    expect(screen.getByRole('alert')).toHaveTextContent('Stadium connection lost. Showing cached data.');
  });
});
