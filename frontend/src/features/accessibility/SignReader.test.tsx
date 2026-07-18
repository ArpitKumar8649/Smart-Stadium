import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignReader } from './SignReader.tsx';

class InstantFileReader {
  onload: ((event: ProgressEvent<FileReader>) => unknown) | null = null;
  readAsDataURL() {
    this.onload?.({ target: { result: 'data:image/png;base64,abc' } } as ProgressEvent<FileReader>);
  }
}

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('SignReader', () => {
  it('rejects oversized files before network upload', async () => {
    const onDescription = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<SignReader onDescription={onDescription} />);
    fireEvent.change(fileInput(container), {
      target: { files: [new File(['x'.repeat(1_300_001)], 'large.png', { type: 'image/png' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose an image smaller than 1.3 MB');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads a small sign image and returns the description in the selected language', async () => {
    const onDescription = vi.fn();
    vi.stubGlobal('FileReader', InstantFileReader);
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ description: 'Gate C closes soon' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<SignReader lang="es" onDescription={onDescription} />);
    fireEvent.change(fileInput(container), {
      target: { files: [new File(['small'], 'sign.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(onDescription).toHaveBeenCalledWith('Gate C closes soon'));
    const uploadCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    expect(JSON.parse(String(uploadCall[1].body))).toEqual({
      image_b64: 'data:image/png;base64,abc',
      lang: 'es',
    });
  });

  it('announces image-processing failures', async () => {
    vi.stubGlobal('FileReader', InstantFileReader);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));

    const { container } = render(<SignReader onDescription={vi.fn()} />);
    fireEvent.change(fileInput(container), {
      target: { files: [new File(['small'], 'sign.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not process the image.'));
  });
});
