import { useRef, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Environment, ContactShadows } from '@react-three/drei';

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

function useTypingLoop(text: string, typeSpeed = 150, eraseSpeed = 80, pauseAfterType = 1500, pauseAfterErase = 500) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
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
  }, [text, typeSpeed, eraseSpeed, pauseAfterType, pauseAfterErase]);

  return displayed;
}

// ── Inner 3D model component ─────────────────────────────

function TrophyModel() {
  const { scene } = useGLTF('/trophy.glb');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupRef = useRef<any>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Continuous slow Y rotation (trophy spin)
    groupRef.current.rotation.y += delta * 0.4;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={scene} scale={1.8} />
    </group>
  );
}

// ── Outer wrapper with Intersection Observer trigger ─────

export default function TrophyScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayed = useTypingLoop('FIFA WORLD CUP 2026', 150, 80, 1500, 500);

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
          {displayed}
          <span className="inline-block w-[3px] animate-pulse bg-white" style={{ height: '1em', marginLeft: '2px', verticalAlign: 'text-bottom' }}>&nbsp;</span>
        </h2>
      </div>

      {/* Ambient glow behind the trophy */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-72 w-72 rounded-full bg-accent-600/25 blur-[120px]" />

      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 2.5, 6], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <directionalLight position={[-3, 4, -2]} intensity={0.4} />
        <pointLight position={[0, 3, 0]} intensity={0.8} color="#FFC300" />

        <Suspense fallback={null}>
          <TrophyModel />
          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.5}
            scale={8}
            blur={2}
            far={4}
          />
          <Environment preset="city" />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Pre-load the GLB so it's cached when the component mounts
useGLTF.preload('/trophy.glb');
