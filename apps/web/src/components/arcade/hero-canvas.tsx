'use client';

// Types only — erased at compile time, so this does not pull three.js into the
// bundle. The runtime instance comes from the dynamic import inside the effect.
import type * as THREE from 'three';
import { useEffect, useRef } from 'react';

/**
 * The floating faceted object from the design, in three.js.
 *
 * Three deliberate constraints, because this is decoration on a marketing page
 * and must never cost the page its usability:
 *
 *  - three.js is imported dynamically, so ~600KB of renderer stays out of the
 *    initial bundle and only loads for visitors who reach a screen using it.
 *  - The loop yields entirely when the tab is hidden or the element is scrolled
 *    out of view; an offscreen canvas spinning at 30fps is pure battery drain.
 *  - Under `prefers-reduced-motion` nothing initialises at all. The container
 *    keeps its gradient glow, so the composition still reads.
 */
export function HeroCanvas({
  coreColor = 0xff7a18,
  className,
}: {
  coreColor?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const THREE = await import('three');
      if (disposed || !container) return;

      const width = container.clientWidth || 600;
      const height = container.clientHeight || 600;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      // Capped: past 1.5x the extra pixels are invisible and the fill cost is real.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(width, height);
      renderer.domElement.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;display:block;cursor:grab';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);

      /**
       * Camera distance is derived, not fixed.
       *
       * The satellites orbit at radius ~3.05. In a tall narrow container the
       * horizontal field of view shrinks, and a hardcoded distance lets them
       * clip through the sides. Backing off by the aspect keeps the whole orbit
       * inside the frame at any shape.
       */
      const frameCamera = (w: number, h: number) => {
        const aspect = w / h;
        const orbitRadius = 3.4;
        const vFov = (camera.fov * Math.PI) / 180;
        // Distance needed to fit the orbit vertically, and horizontally.
        const distV = orbitRadius / Math.tan(vFov / 2);
        const distH = orbitRadius / (Math.tan(vFov / 2) * aspect);
        camera.position.set(0, 0, Math.max(distV, distH) * 1.08);
        camera.updateProjectionMatrix();
      };
      frameCamera(width, height);

      /**
       * Lighting for a flat-shaded arcade look.
       *
       * A hemisphere light rather than a flat ambient: it puts a cool bounce
       * under the object and a warm wash on top, so the low-poly facets keep
       * distinct values instead of flattening into one tone. The key light is
       * what actually separates the facets; the two coloured points are rim pop
       * only and sit behind the object.
       */
      scene.add(new THREE.HemisphereLight(0xfff6e9, 0x2a2170, 1.15));

      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(4, 6, 7);
      scene.add(key);

      // Behind and to the sides, so they graze the silhouette rather than
      // washing out the front faces.
      const rimA = new THREE.PointLight(0x22d3ee, 2.4, 40);
      rimA.position.set(-5, 2.5, -4);
      scene.add(rimA);
      const rimB = new THREE.PointLight(0xff3d9a, 2.4, 40);
      rimB.position.set(5, -3, -4);
      scene.add(rimB);

      const group = new THREE.Group();
      const geometry = new THREE.IcosahedronGeometry(1.75, 0);
      const core = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: coreColor,
          flatShading: true,
          /**
           * metalness 0, deliberately.
           *
           * A metallic surface derives almost all of its colour from reflected
           * surroundings, and this scene has no environment map — so any
           * metalness above zero drains the accent colour toward black. That is
           * exactly what made the object read as dull olive rather than orange.
           * Dielectric with a soft roughness keeps the fill saturated.
           */
          metalness: 0,
          roughness: 0.55,
          // A little self-illumination so the facets pointing away from the key
          // light stay on-palette instead of falling to near-black.
          emissive: coreColor,
          emissiveIntensity: 0.18,
        }),
      );
      group.add(core);

      const wireframe = new THREE.LineSegments(
        new THREE.WireframeGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55 }),
      );
      wireframe.scale.setScalar(1.03);
      group.add(wireframe);
      scene.add(group);

      const satellites: Array<{
        mesh: THREE.Mesh;
        radius: number;
        speed: number;
        phase: number;
      }> = [];

      const addSatellite = (
        geo: THREE.BufferGeometry,
        color: number,
        radius: number,
        speed: number,
        phase: number,
      ) => {
        const mesh = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({
            color,
            flatShading: true,
            // Same reasoning as the core: no envMap, so metalness only darkens.
            metalness: 0,
            roughness: 0.5,
            emissive: color,
            emissiveIntensity: 0.22,
          }),
        );
        scene.add(mesh);
        satellites.push({ mesh, radius, speed, phase });
      };

      addSatellite(new THREE.TorusGeometry(0.46, 0.19, 14, 30), 0x22d3ee, 3.1, 0.6, 0);
      addSatellite(new THREE.TetrahedronGeometry(0.6), 0xffd23f, 2.85, -0.85, 2);
      addSatellite(new THREE.BoxGeometry(0.62, 0.62, 0.62), 0xff3d9a, 3.3, 0.5, 4);

      // Drag to spin, with the rotation eased so a flick decelerates instead of
      // snapping.
      let targetX = 0;
      let targetY = 0;
      let currentX = 0;
      let currentY = 0;
      let dragging = false;
      let lastPointerX = 0;
      let lastPointerY = 0;

      const dom = renderer.domElement;
      const onPointerDown = (event: PointerEvent) => {
        dragging = true;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        dom.style.cursor = 'grabbing';
        try {
          dom.setPointerCapture(event.pointerId);
        } catch {
          /* capture is a nicety; dragging still works without it */
        }
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        targetX += (event.clientX - lastPointerX) * 0.01;
        targetY += (event.clientY - lastPointerY) * 0.01;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
      };
      const onPointerUp = () => {
        dragging = false;
        dom.style.cursor = 'grab';
      };

      dom.addEventListener('pointerdown', onPointerDown);
      dom.addEventListener('pointermove', onPointerMove);
      dom.addEventListener('pointerup', onPointerUp);
      dom.addEventListener('pointerleave', onPointerUp);

      let visible = true;
      const observer = new IntersectionObserver(
        ([entry]) => {
          visible = entry?.isIntersecting ?? true;
        },
        { threshold: 0 },
      );
      observer.observe(container);

      const clock = new THREE.Clock();
      let frameId = 0;

      /**
       * Auto-spin rate in radians per second.
       *
       * Previously this was a per-frame increment, which silently tied the
       * animation speed to the refresh rate — the same code span 4.8x faster on
       * a 144Hz display than on 30fps. Everything below is expressed per second
       * and multiplied by the frame delta, so the motion looks identical at any
       * refresh rate.
       */
      const AUTO_SPIN_PER_SECOND = 0.12;
      /** Exponential smoothing constant for drag easing, per second. */
      const SMOOTHING_PER_SECOND = 2.5;

      const animate = () => {
        frameId = requestAnimationFrame(animate);
        if (document.hidden || !visible) return;

        // Uncapped: this renders at the display's native refresh rate. The
        // earlier 30fps throttle saved a little power but read as stutter on a
        // high-refresh monitor, which is the opposite of what the design wants.
        // getDelta() advances the clock and accumulates elapsedTime, so the
        // elapsed value is read from the property rather than getElapsedTime() —
        // that method calls getDelta() again internally and would swallow the
        // delta this frame depends on. Clamped so a backgrounded tab returning
        // does not jump the animation forward by seconds in one frame.
        const delta = Math.min(clock.getDelta(), 0.1);
        const elapsed = clock.elapsedTime;

        if (!dragging) targetX += AUTO_SPIN_PER_SECOND * delta;
        targetY = Math.max(-1.1, Math.min(1.1, targetY));

        // Frame-rate independent easing. A plain `+= diff * 0.08` converges at a
        // speed that depends on how often it runs; this converges in the same
        // wall-clock time regardless.
        const smoothing = 1 - Math.exp(-SMOOTHING_PER_SECOND * delta);
        currentX += (targetX - currentX) * smoothing;
        currentY += (targetY - currentY) * smoothing;

        group.rotation.y = currentX;
        group.rotation.x = currentY;
        group.position.y = Math.sin(elapsed * 1.2) * 0.16;

        for (const satellite of satellites) {
          satellite.mesh.position.set(
            Math.cos(elapsed * satellite.speed + satellite.phase) * satellite.radius,
            Math.sin(elapsed * satellite.speed * 1.3 + satellite.phase) * 0.9,
            Math.sin(elapsed * satellite.speed + satellite.phase) * satellite.radius,
          );
          satellite.mesh.rotation.x = elapsed * 1.2;
          satellite.mesh.rotation.y = elapsed * 0.9;
        }

        renderer.render(scene, camera);
      };
      frameId = requestAnimationFrame(animate);

      const resizeObserver = new ResizeObserver(() => {
        const nextWidth = container.clientWidth;
        const nextHeight = container.clientHeight;
        if (!nextWidth || !nextHeight) return;
        camera.aspect = nextWidth / nextHeight;
        // Reframe as well as re-project, so the orbit stays inside a container
        // that changed shape rather than clipping at the sides.
        frameCamera(nextWidth, nextHeight);
        renderer.setSize(nextWidth, nextHeight);
      });
      resizeObserver.observe(container);

      cleanup = () => {
        cancelAnimationFrame(frameId);
        observer.disconnect();
        resizeObserver.disconnect();
        dom.removeEventListener('pointerdown', onPointerDown);
        dom.removeEventListener('pointermove', onPointerMove);
        dom.removeEventListener('pointerup', onPointerUp);
        dom.removeEventListener('pointerleave', onPointerUp);
        // GPU memory is not garbage collected — every geometry, material and the
        // context itself has to be released explicitly or navigating between
        // pages leaks a renderer each time.
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose?.();
          const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material?.dispose?.();
        });
        renderer.dispose();
        dom.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [coreColor]);

  return <div ref={containerRef} className={className} style={{ touchAction: 'none' }} />;
}
