'use client';

import type * as THREE from 'three';
import { useEffect, useRef } from 'react';

import { clamp, span } from './timeline';
import { useAdClock } from './use-ad-clock';

/**
 * A low-poly object that starts as a wireframe and becomes a solid.
 *
 * This is the film's one piece of real 3D, and it earns its place by carrying
 * the idea the product is about: something being built. It opens as edges only —
 * the state a model is in while it is being made — and fills in as the round
 * progresses.
 *
 * It follows the same three rules as `HeroCanvas`, which is already on the
 * landing page:
 *
 *  - three.js is imported dynamically, so the renderer stays out of the initial
 *    bundle and only loads on the page that uses it.
 *  - Nothing initialises under `prefers-reduced-motion`; the container keeps its
 *    glow so the composition still reads.
 *  - The loop is driven by the film's clock rather than its own, so the object
 *    is at the same angle at the same timestamp on every viewing — and it costs
 *    nothing while the film is paused.
 */
export function AdMesh({
  shape = 'cube',
  color = 0xffd23f,
  /** When the wireframe begins filling in, in film time. */
  solidFrom,
  solidTo,
  spin = 0.5,
  className = '',
}: {
  shape?: 'cube' | 'sphere' | 'torus';
  color?: number;
  solidFrom: number;
  solidTo: number;
  spin?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { subscribe, reducedMotion } = useAdClock();

  useEffect(() => {
    const container = containerRef.current;
    if (!container || reducedMotion) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const THREE_NS = await import('three');
      if (disposed || !container) return;

      const width = container.clientWidth || 400;
      const height = container.clientHeight || 400;

      const renderer = new THREE_NS.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height, false);
      container.appendChild(renderer.domElement);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';

      const scene = new THREE_NS.Scene();
      const camera = new THREE_NS.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.set(0, 0, 5.4);

      const geometry =
        shape === 'sphere'
          ? new THREE_NS.IcosahedronGeometry(1.55, 1)
          : shape === 'torus'
            ? new THREE_NS.TorusKnotGeometry(1.05, 0.34, 90, 12)
            : new THREE_NS.BoxGeometry(2.1, 2.1, 2.1, 2, 2, 2);

      /*
        Two objects on the same geometry, cross-faded.

        Toggling one material's `wireframe` flag would snap between the two
        states in a single frame. Fading a solid up behind the edges is what
        makes it read as a model being filled in rather than a switch.
      */
      const solid = new THREE_NS.Mesh(
        geometry,
        new THREE_NS.MeshStandardMaterial({
          color,
          roughness: 0.34,
          metalness: 0.05,
          flatShading: true,
          transparent: true,
          opacity: 0,
        }),
      );

      const wire = new THREE_NS.LineSegments(
        new THREE_NS.WireframeGeometry(geometry),
        new THREE_NS.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
      );

      scene.add(solid, wire);
      scene.add(new THREE_NS.AmbientLight(0xffffff, 0.55));

      const key = new THREE_NS.DirectionalLight(0xffffff, 2.1);
      key.position.set(2.4, 3, 3.4);
      scene.add(key);

      const rim = new THREE_NS.DirectionalLight(0x4ad4ff, 1.3);
      rim.position.set(-3, -1.4, -2);
      scene.add(rim);

      const draw = (t: number) => {
        const fill = clamp(span(t, solidFrom, solidTo));

        (solid.material as THREE.MeshStandardMaterial).opacity = fill;
        (wire.material as THREE.LineBasicMaterial).opacity = 0.9 - fill * 0.55;

        // One rotation shared by both, so the edges stay locked to the faces.
        const rx = t * spin * 0.42;
        const ry = t * spin;
        solid.rotation.set(rx, ry, 0);
        wire.rotation.set(rx, ry, 0);

        // A small breath, so a paused film still looks composed rather than
        // frozen mid-gesture.
        const s = 1 + Math.sin(t * 1.6) * 0.02;
        solid.scale.setScalar(s);
        wire.scale.setScalar(s);

        renderer.render(scene, camera);
      };

      const unsubscribe = subscribe(draw);

      const onResize = () => {
        const w = container.clientWidth || width;
        const h = container.clientHeight || height;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener('resize', onResize);

      cleanup = () => {
        unsubscribe();
        window.removeEventListener('resize', onResize);
        renderer.domElement.remove();
        renderer.dispose();
        geometry.dispose();
        wire.geometry.dispose();
        (solid.material as THREE.Material).dispose();
        (wire.material as THREE.Material).dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [shape, color, solidFrom, solidTo, spin, subscribe, reducedMotion]);

  return (
    <div
      ref={containerRef}
      className={className}
      // The glow stays even when the canvas never initialises, so the layout
      // holds under reduced motion.
      style={{
        background: 'radial-gradient(closest-side, rgba(255,210,63,.14), transparent 70%)',
      }}
    />
  );
}
