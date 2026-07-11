import { useEffect, useRef, useState, useCallback } from 'react';

/* ─────────────────────────────────────────────────────────
 *  FrameSequence
 *
 *  High-performance scroll-driven image-sequence animation
 *  rendered to an HTML <canvas>.
 *
 *  The canvas is `position: fixed` covering the entire
 *  viewport. A tall spacer div creates the scroll runway.
 *  The canvas stays locked in place while the user scrolls;
 *  once the last frame is reached the spacer ends and
 *  normal page content scrolls over the top.
 * ───────────────────────────────────────────────────────── */

export interface FrameSequenceProps {
  /** Total number of frames in the sequence. */
  frameCount?: number;
  /** File-name prefix (before the zero-padded index). */
  prefix?: string;
  /** File extension including the dot. */
  extension?: string;
  /** Directory path inside the public folder (leading slash, no trailing slash). */
  basePath?: string;
  /** Number of digits to zero-pad (e.g. 3 → 001). */
  padDigits?: number;
  /**
   * How many viewports of scroll travel map to the full sequence.
   * Higher = slower scrubbing.  Default 5.
   */
  scrollSpan?: number;
}

// ── helpers ──────────────────────────────────────────────

/** Build the URL for a given 1-based frame index. */
function frameSrc(
  index: number,
  basePath: string,
  prefix: string,
  extension: string,
  padDigits: number,
) {
  const padded = String(index).padStart(padDigits, '0');
  return `${basePath}/${prefix}${padded}${extension}`;
}

/**
 * Draw a single HTMLImageElement onto a canvas using
 * "object-fit: cover" semantics so the image always
 * fills the canvas while preserving its aspect ratio.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;

  const scale = Math.max(cw / iw, ch / ih);
  const sw = cw / scale;
  const sh = ch / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
}

// ── component ────────────────────────────────────────────

export default function FrameSequence({
  frameCount = 406,
  prefix = 'ezgif-frame-',
  extension = '.jpg',
  basePath = '/frames',
  padDigits = 3,
  scrollSpan = 10,
}: FrameSequenceProps) {
  const spacerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  const rafIdRef = useRef<number>(0);
  const renderedFrameRef = useRef<number>(-1);

  const [loadProgress, setLoadProgress] = useState(0);
  const [allLoaded, setAllLoaded] = useState(false);

  // ── 1. Preload every frame into memory ────────────────

  useEffect(() => {
    let cancelled = false;
    const images: (HTMLImageElement | null)[] = new Array(frameCount).fill(null);
    imagesRef.current = images;
    let loaded = 0;

    Array.from({ length: frameCount }, (_, i) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = frameSrc(i + 1, basePath, prefix, extension, padDigits);

      img.onload = () => {
        if (!cancelled) {
          images[i] = img;
          loaded += 1;
          setLoadProgress(loaded / frameCount);
          if (loaded === frameCount) setAllLoaded(true);
        }
      };

      img.onerror = () => {
        loaded += 1;
        setLoadProgress(loaded / frameCount);
        if (loaded === frameCount) setAllLoaded(true);
      };
    });

    return () => {
      cancelled = true;
    };
  }, [frameCount, prefix, extension, basePath, padDigits]);

  // ── 2. Resize canvas to window (device-pixel-aware) ───

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Force a re-render of the current frame at new size.
    renderedFrameRef.current = -1;
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // ── 3. Scroll → frame index mapping + rAF render loop ─

  useEffect(() => {
    const spacer = spacerRef.current;
    const canvas = canvasRef.current;
    if (!spacer || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function tick() {
      const rect = spacer!.getBoundingClientRect();
      const viewportH = window.innerHeight;

      // Total scroll distance through the spacer.
      // The spacer is (scrollSpan * 100vh) tall.
      // Sequence starts when spacer top reaches viewport top (rect.top = 0)
      // and ends when spacer bottom reaches viewport bottom.
      const scrollableDistance = spacer!.offsetHeight - viewportH;
      const scrolled = -rect.top; // how far past the top

      const progress = Math.min(1, Math.max(0, scrolled / scrollableDistance));

      // Map progress to frame index (0-based).
      const frameIndex = Math.min(
        frameCount - 1,
        Math.max(0, Math.round(progress * (frameCount - 1))),
      );

      // Show canvas only while we're inside the spacer zone.
      const isInZone = rect.top <= 0 && rect.bottom >= viewportH;
      canvas!.style.visibility = isInZone || scrolled < 0 ? 'visible' : 'hidden';

      // Only repaint when the frame actually changes.
      if (frameIndex !== renderedFrameRef.current) {
        const img = imagesRef.current[frameIndex];
        if (img) {
          const dpr = window.devicePixelRatio || 1;
          const cw = canvas!.width / dpr;
          const ch = canvas!.height / dpr;
          ctx!.clearRect(0, 0, cw, ch);
          drawCover(ctx!, img, cw, ch);
          renderedFrameRef.current = frameIndex;
        }
      }

      rafIdRef.current = requestAnimationFrame(tick);
    }

    rafIdRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [frameCount, scrollSpan]);

  // ── 4. Render ─────────────────────────────────────────

  return (
    <>
      {/* Fixed canvas — always covers the viewport, behind page content */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
        }}
      />

      {/* Spacer — creates the scroll runway for the sequence */}
      <div
        ref={spacerRef}
        style={{ height: `${scrollSpan * 100}vh` }}
        className="relative"
      >
        {/* Loading overlay */}
        {!allLoaded && (
          <div
            className="flex flex-col items-center justify-center bg-surface-950/80 backdrop-blur-sm"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 10,
            }}
          >
            {/* progress ring */}
            <svg
              className="h-20 w-20 -rotate-90"
              viewBox="0 0 80 80"
            >
              <circle
                cx="40"
                cy="40"
                r="34"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-surface-800"
              />
              <circle
                cx="40"
                cy="40"
                r="34"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray={Math.PI * 68}
                strokeDashoffset={Math.PI * 68 * (1 - loadProgress)}
                strokeLinecap="round"
                className="text-primary transition-[stroke-dashoffset] duration-200"
              />
            </svg>
            <p className="mt-4 font-mono text-sm text-surface-300">
              Loading frames&hellip; {Math.round(loadProgress * 100)}%
            </p>
          </div>
        )}
      </div>
    </>
  );
}
