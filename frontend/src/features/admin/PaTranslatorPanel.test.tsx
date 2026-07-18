import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PaTranslatorPanel } from './PaTranslatorPanel.tsx';

describe('PaTranslatorPanel', () => {
  it('sends sequential authorized TTS requests, reveals cached translations, autoplays, and revokes URLs', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(new Blob([`audio-${body.lang}`]), {
        status: 200,
        headers: {
          'X-TTS-Cached': body.lang === 'hi' ? '1' : '0',
          'X-TTS-Text': encodeURIComponent(`Translated ${body.lang}`),
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<PaTranslatorPanel adminToken="secret" onUnauthorized={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /announce in 3 languages/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).lang)).toEqual(['es', 'hi', 'ar']);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer secret' });
    expect(await screen.findByText('Translated es')).toBeInTheDocument();
    expect(screen.getByText('Translated hi')).toBeInTheDocument();
    expect(screen.getByText('cached')).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Play Español announcement' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('toggles target languages and disables announcement when none are selected', async () => {
    const user = userEvent.setup();
    render(<PaTranslatorPanel adminToken="secret" onUnauthorized={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Español' }));
    await user.click(screen.getByRole('button', { name: 'हिन्दी' }));
    await user.click(screen.getByRole('button', { name: 'العربية' }));

    expect(screen.getByRole('button', { name: /Announce in 0 languages/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Português' }));
    expect(screen.getByRole('button', { name: /Announce in 1 language/i })).toBeEnabled();
  });

  it('handles unauthorized and synthesis failures without hiding the operator error', async () => {
    const user = userEvent.setup();
    const onUnauthorized = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));

    render(<PaTranslatorPanel adminToken="bad" onUnauthorized={onUnauthorized} />);
    await user.click(screen.getByRole('button', { name: /announce/i }));

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
    expect(screen.getByRole('alert')).toHaveTextContent('Your operator session expired. Please sign in again.');
  });
});
