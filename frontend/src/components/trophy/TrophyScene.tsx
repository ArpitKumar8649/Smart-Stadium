import { useEffect, useRef, useState, Suspense, type RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { useReducedMotion } from '../../features/accessibility/useReducedMotion.ts';
import { Model } from './TrophyModel.tsx';

/* ─────────────────────────────────────────────────────────
 *  TrophyScene
 *
 *  Renders the FIFA World Cup trophy .glb model inside a
 *  React-Three-Fiber canvas.  The trophy rolls in from the
 *  right side of the screen and settles at center with a
 *  slow continuous rotation. Behind it, "FIFA WORLD CUP
 *  2026" types itself out in large white text.
 * ───────────────────────────────────────────────────────── */

// ── Continuous typing loop hook ───────────────────────────

function useTrophyActive(containerRef: RefObject<HTMLDivElement>): boolean {
  const [inViewport, setInViewport] = useState(false);
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === 'undefined' || !document.hidden,
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    if (!('IntersectionObserver' in window)) {
      setInViewport(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setInViewport(Boolean(entry?.isIntersecting)),
      // Start loading just before the section enters view, without rendering it
      // while it is far away from the user.
      { rootMargin: '120px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    const syncPageVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', syncPageVisibility);
    return () => document.removeEventListener('visibilitychange', syncPageVisibility);
  }, []);

  return inViewport && pageVisible;
}

function useTypingLoop(
  text: string,
  active: boolean,
  typeSpeed = 150,
  eraseSpeed = 80,
  pauseAfterType = 1500,
  pauseAfterErase = 500,
) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    if (!active) return undefined;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    function loop() {
      let i = 0;

      // Phase 1: Type forward
      function type() {
        if (cancelled) return;
        if (i <= text.length) {
          setDisplayed(text.slice(0, i));
          i++;
          timeout = setTimeout(type, typeSpeed);
        } else {
          // Pause, then erase
          timeout = setTimeout(erase, pauseAfterType);
        }
      }

      // Phase 2: Erase backward
      function erase() {
        if (cancelled) return;
        if (i >= 0) {
          setDisplayed(text.slice(0, i));
          i--;
          timeout = setTimeout(erase, eraseSpeed);
        } else {
          // Pause, then restart
          timeout = setTimeout(loop, pauseAfterErase);
        }
      }

      type();
    }

    loop();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [text, active, typeSpeed, eraseSpeed, pauseAfterType, pauseAfterErase]);

  return displayed;
}

// ── Inner 3D model component ─────────────────────────────

function TrophyModel({ reduceMotion }: { reduceMotion: boolean }) {
  // The workspace currently resolves two compatible Three type packages. Keep
  // the ref structural so it remains type-safe without coupling to either copy.
  const groupRef = useRef<{ rotation: { y: number } } | null>(null);

  useFrame((_, delta) => {
    if (!groupRef.current || reduceMotion) return;

    // Continuous slow Y rotation (trophy spin)
    groupRef.current.rotation.y += delta * 0.4;
  });

  return (
    <group ref={groupRef as never} position={[0, 0, 0]}>
      <Model scale={1.8} />
    </group>
  );
}

function useHandsetQualityTier(): boolean {
  const [isHandset, setIsHandset] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => {
      const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      setIsHandset(media.matches || (deviceMemory !== undefined && deviceMemory <= 4));
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return isHandset;
}

// ── Outer wrapper with Intersection Observer trigger ─────

export default function TrophyScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const active = useTrophyActive(containerRef);
  const reduceMotion = useReducedMotion();
  const handset = useHandsetQualityTier();
  const displayed = useTypingLoop('FIFA WORLD CUP 2026', active && !reduceMotion, 150, 80, 1500, 500);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto flex w-full max-w-5xl items-center justify-center"
      style={{ height: '500px' }}
    >
      {/* Big typing text behind the trophy */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <h2
          className="select-none whitespace-nowrap font-display font-bold uppercase tracking-widest text-white"
          style={{
            fontSize: 'clamp(2rem, 6vw, 5rem)',
            opacity: 0.15,
            letterSpacing: '0.15em',
          }}
        >
          {reduceMotion ? 'FIFA WORLD CUP 2026' : displayed}
          <span className="inline-block w-[3px] animate-pulse bg-white" style={{ height: '1em', marginLeft: '2px', verticalAlign: 'text-bottom' }}>&nbsp;</span>
        </h2>
      </div>

      {/* Ambient glow behind the trophy */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-72 w-72 rounded-full bg-accent-600/25 blur-[120px]" />

      {/* The canvas only exists while this section and browser tab are visible.
          Navigating away or backgrounding the phone releases its render loop. */}
      {active && (
        <Canvas
          camera={{ position: [0, 2.5, 6], fov: 40 }}
          dpr={handset ? [1, 1.25] : [1, 1.75]}
          frameloop={reduceMotion ? 'demand' : 'always'}
          gl={{ antialias: !handset, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
          <directionalLight position={[-3, 4, -2]} intensity={0.4} />
          <pointLight position={[0, 3, 0]} intensity={0.8} color="#FFC300" />

          <Suspense fallback={null}>
            <TrophyModel reduceMotion={reduceMotion} />
            <ContactShadows
              position={[0, 0, 0]}
              opacity={0.5}
              scale={8}
              blur={2}
              far={4}
              frames={1}
              resolution={handset ? 128 : 256}
            />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
