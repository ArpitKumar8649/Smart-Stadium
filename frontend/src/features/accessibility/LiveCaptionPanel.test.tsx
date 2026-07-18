import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LiveCaptionPanel } from './LiveCaptionPanel.tsx';

const captionState = vi.hoisted(() => ({
  state: 'idle' as 'idle' | 'connecting' | 'listening' | 'error',
  partial: '',
  lines: [] as string[],
  error: null as string | null,
  start: vi.fn(async () => undefined),
  stop: vi.fn(),
  reduceMotion: false,
}));

vi.mock('./useLiveCaptions.ts', () => ({
  useLiveCaptions: () => captionState,
}));

vi.mock('./useReducedMotion.ts', () => ({
  useReducedMotion: () => captionState.reduceMotion,
}));

describe('LiveCaptionPanel', () => {
  it('starts and stops caption capture with accessible status text', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LiveCaptionPanel />);

    expect(screen.getByRole('log', { name: 'Live captions' })).toHaveTextContent('Press “Start captions”');
    await user.click(screen.getByRole('button', { name: 'Start captions' }));
    expect(captionState.start).toHaveBeenCalled();

    captionState.state = 'listening';
    captionState.lines = ['Gate C is closing.'];
    captionState.partial = 'Please proceed';
    rerender(<LiveCaptionPanel />);

    expect(screen.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Gate C is closing.')).toBeInTheDocument();
    expect(screen.getByText('Please proceed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(captionState.stop).toHaveBeenCalled();
  });

  it('announces caption errors', () => {
    captionState.state = 'error';
    captionState.partial = '';
    captionState.lines = [];
    captionState.error = 'Microphone denied';

    render(<LiveCaptionPanel />);

    expect(screen.getByText('Captions unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Microphone denied')).toBeInTheDocument();
  });
});
