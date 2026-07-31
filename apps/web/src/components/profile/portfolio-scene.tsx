'use client';

// Types only — erased at compile time, so this import does not pull three.js
// into the bundle. The runtime instance comes from the dynamic import below.
import type * as THREE from 'three';
import { useEffect, useRef } from 'react';

/**
 * The artist's own models, floating behind their portfolio.
 *
 * This renders the actual `.glb`/`.gltf`/`.fbx`/`.obj` files people uploaded to
 * finished challenges, not stand-in shapes. Three constraints shape the whole
 * component, and each one exists because the input is arbitrary user geometry
 * rather than an asset anybody designed for this scene:
 *
 *  - **Scale is normalised, never trusted.** A Blender export in centimetres and
 *    one in metres differ by 100x, and an FBX from a DCC that assumes inches by
 *    another 2.54. Every model is measured after load and rescaled so its
 *    longest axis is 1 unit, then recentred on its own bounding box. Without
 *    this a single file either fills the screen or is a sub-pixel dot.
 *  - **Materials are replaced, not respected.** Uploads arrive with missing
 *    textures, 4K PBR maps, or nothing at all. Every mesh is reskinned in the
 *    arcade palette with flat shading, which both guarantees they read as one
 *    family and means no texture is ever fetched.
 *  - **Downloads are capped and sequential.** These are unbounded user files.
 *    Loading every entry at once would put dozens of multi-megabyte requests in
 *    flight; the scene takes the newest few and fetches them one at a time, so
 *    the page stays usable while they trickle in.
 *
 * Under `prefers-reduced-motion` nothing initialises at all — no WebGL context,
 * no downloads. The gradient behind it still carries the composition.
 */

/** Palette for the reskin, drawn from the same tokens the CSS uses. */
const PALETTE = [0xff7a18, 0xffd23f, 0x22d3ee, 0xff3d9a, 0x5ef0de];

/**
 * How many models are fetched.
 *
 * Kept low deliberately: past a handful the silhouettes overlap into noise, and
 * every extra one is another uncapped download plus its draw calls.
 */
const MAX_MODELS = 5;

export interface PortfolioModel {
  url: string;
  /** Used to pick a loader — the URL alone may carry no extension. */
  filename: string | null;
}

export function PortfolioScene({
  models,
  className,
}: {
  models: PortfolioModel[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // The list identity changes on every render of the parent, so the effect keys
  // on the URLs themselves. Without this the scene would tear down and refetch
  // every mesh whenever the page re-rendered for an unrelated reason.
  const signature = models
    .slice(0, MAX_MODELS)
    .map((model) => model.url)
    .join('|');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const THREE = await import('three');
      if (disposed || !container) return;

      const width = container.clientWidth || 800;
      const height = container.clientHeight || 800;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(width, height);
      renderer.domElement.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;display:block';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
      camera.position.set(0, 0, 9);

      // Same three-light rig as the hero canvas, so a model here is lit like the
      // decorative geometry elsewhere rather than looking like a different app.
      scene.add(new THREE.HemisphereLight(0xfff6e9, 0x2a2170, 1.1));
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(4, 6, 7);
      scene.add(key);
      const rimA = new THREE.PointLight(0x22d3ee, 2.2, 40);
      rimA.position.set(-6, 3, -4);
      scene.add(rimA);
      const rimB = new THREE.PointLight(0xff3d9a, 2.2, 40);
      rimB.position.set(6, -3, -4);
      scene.add(rimB);

      /** Everything orbits inside this, so parallax moves the whole field. */
      const world = new THREE.Group();
      scene.add(world);

      type Floater = {
        object: THREE.Object3D;
        radius: number;
        speed: number;
        phase: number;
        drift: number;
        spin: number;
      };
      const floaters: Floater[] = [];

      /**
       * Places an object on a lazy orbit.
       *
       * Slots are spread by index rather than randomised so a reload puts the
       * same model in the same place — a portfolio that reshuffles itself on
       * every visit reads as broken rather than lively.
       */
      const addFloater = (object: THREE.Object3D, index: number) => {
        const golden = index * 2.399;
        const floater: Floater = {
          object,
          radius: 3.1 + (index % 3) * 0.85,
          speed: 0.08 + (index % 4) * 0.022,
          phase: golden,
          drift: 0.7 + (index % 3) * 0.35,
          spin: 0.1 + (index % 5) * 0.035,
        };
        world.add(object);
        floaters.push(floater);
      };

      /**
       * Reskin, recentre and rescale a freshly loaded model.
       *
       * Returns a wrapper group rather than the raw object: recentring means
       * offsetting the mesh against its own bounds, and doing that on the object
       * we also rotate would make it wobble around an off-centre pivot.
       */
      const normalise = (root: THREE.Object3D, color: number): THREE.Object3D | null => {
        const material = new THREE.MeshStandardMaterial({
          color,
          flatShading: true,
          // Dielectric on purpose: there is no environment map in this scene, so
          // any metalness drains the accent colour toward black.
          metalness: 0,
          roughness: 0.55,
          emissive: color,
          emissiveIntensity: 0.16,
          transparent: true,
          opacity: 0.92,
        });

        let hasGeometry = false;
        root.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          hasGeometry = true;
          // The file's own material is dropped, along with any texture it would
          // otherwise pull over the network.
          const previous = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(previous)) previous.forEach((entry) => entry.dispose());
          else previous?.dispose?.();
          mesh.material = material;
        });

        // An archive that parsed but contained no drawable mesh — a rig, a scene
        // graph of empties, a corrupt export. Nothing to show, so skip it rather
        // than adding an invisible object to the orbit.
        if (!hasGeometry) return null;

        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const centre = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(centre);

        const longest = Math.max(size.x, size.y, size.z);
        // Degenerate bounds (empty geometry, NaN vertices) would divide by zero
        // and put an Infinity into the matrix, which blanks the whole canvas.
        if (!Number.isFinite(longest) || longest <= 0) return null;

        root.position.sub(centre);
        const wrapper = new THREE.Group();
        wrapper.add(root);
        wrapper.scale.setScalar(1.45 / longest);
        return wrapper;
      };

      /** A faceted stand-in, used when the artist has no models to show. */
      const placeholderAt = (index: number) => {
        const color = PALETTE[index % PALETTE.length]!;
        const geometries = [
          new THREE.IcosahedronGeometry(0.7, 0),
          new THREE.TorusGeometry(0.5, 0.2, 12, 24),
          new THREE.TetrahedronGeometry(0.8),
          new THREE.BoxGeometry(0.8, 0.8, 0.8),
          new THREE.OctahedronGeometry(0.75, 0),
        ];
        return new THREE.Mesh(
          geometries[index % geometries.length]!,
          new THREE.MeshStandardMaterial({
            color,
            flatShading: true,
            metalness: 0,
            roughness: 0.5,
            emissive: color,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.85,
          }),
        );
      };

      const chosen = models.slice(0, MAX_MODELS);

      // Placeholders go in immediately so the scene is never empty while the
      // real meshes download. Each is removed as its model arrives.
      const placeholders = (chosen.length > 0 ? chosen : new Array(4).fill(null)).map(
        (_, index) => {
          const mesh = placeholderAt(index);
          addFloater(mesh, index);
          return mesh;
        },
      );

      const disposeObject = (object: THREE.Object3D) => {
        object.traverse((child) => {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose?.();
          const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material?.dispose?.();
        });
      };

      /**
       * Fetch the models one after another.
       *
       * Sequential rather than `Promise.all`: these are user uploads of unknown
       * size, and putting five of them in flight together starves the rest of
       * the page — including the render images the portfolio grid needs.
       */
      void (async () => {
        for (const [index, model] of chosen.entries()) {
          if (disposed) return;

          const extension = (model.filename ?? model.url).split('.').pop()?.toLowerCase() ?? '';
          let loaded: THREE.Object3D | null = null;

          try {
            if (extension === 'glb' || extension === 'gltf') {
              const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
              const gltf = await new GLTFLoader().loadAsync(model.url);
              loaded = gltf.scene;
            } else if (extension === 'fbx') {
              const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
              loaded = await new FBXLoader().loadAsync(model.url);
            } else if (extension === 'obj') {
              const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
              loaded = await new OBJLoader().loadAsync(model.url);
            }
          } catch {
            // A blocked, missing or malformed upload must not take the scene
            // down — the placeholder already in its slot simply stays.
            loaded = null;
          }

          if (disposed) {
            if (loaded) disposeObject(loaded);
            return;
          }
          if (!loaded) continue;

          const prepared = normalise(loaded, PALETTE[index % PALETTE.length]!);
          if (!prepared) {
            disposeObject(loaded);
            continue;
          }

          // Swap the placeholder out of its own slot, keeping the orbit intact.
          const placeholder = placeholders[index];
          const slot = floaters.find((entry) => entry.object === placeholder);
          if (slot && placeholder) {
            world.remove(placeholder);
            disposeObject(placeholder);
            slot.object = prepared;
            world.add(prepared);
          } else {
            addFloater(prepared, index);
          }
        }
      })();

      // Parallax. Tracked on the window rather than the canvas because the
      // canvas sits behind the page content and receives no pointer events.
      let pointerX = 0;
      let pointerY = 0;
      const onPointerMove = (event: PointerEvent) => {
        pointerX = (event.clientX / window.innerWidth) * 2 - 1;
        pointerY = (event.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener('pointermove', onPointerMove, { passive: true });

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
      let parallaxX = 0;
      let parallaxY = 0;

      const animate = () => {
        frameId = requestAnimationFrame(animate);
        // An offscreen or backgrounded canvas is pure battery drain.
        if (document.hidden || !visible) return;

        // Clamped so a tab returning from the background does not jump the
        // animation forward by whole seconds in a single frame.
        const delta = Math.min(clock.getDelta(), 0.1);
        const elapsed = clock.elapsedTime;

        // Frame-rate independent easing: a plain `+= diff * 0.05` would converge
        // at a speed that depends on the display's refresh rate.
        const smoothing = 1 - Math.exp(-1.8 * delta);
        parallaxX += (pointerX * 0.55 - parallaxX) * smoothing;
        parallaxY += (pointerY * 0.35 - parallaxY) * smoothing;
        world.rotation.y = parallaxX * 0.35;
        world.rotation.x = parallaxY * 0.22;

        for (const floater of floaters) {
          const angle = elapsed * floater.speed + floater.phase;
          floater.object.position.set(
            Math.cos(angle) * floater.radius,
            Math.sin(elapsed * floater.drift * 0.5 + floater.phase) * 1.35,
            Math.sin(angle) * floater.radius * 0.75 - 1.5,
          );
          floater.object.rotation.y = elapsed * floater.spin;
          floater.object.rotation.x = Math.sin(elapsed * floater.spin * 0.7) * 0.35;
        }

        renderer.render(scene, camera);
      };
      frameId = requestAnimationFrame(animate);

      const resizeObserver = new ResizeObserver(() => {
        const nextWidth = container.clientWidth;
        const nextHeight = container.clientHeight;
        if (!nextWidth || !nextHeight) return;
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight);
      });
      resizeObserver.observe(container);

      cleanup = () => {
        cancelAnimationFrame(frameId);
        observer.disconnect();
        resizeObserver.disconnect();
        window.removeEventListener('pointermove', onPointerMove);
        // GPU memory is not garbage collected. Every geometry, material and the
        // context itself has to be released explicitly, or navigating away from
        // this page leaks a renderer and its meshes each time.
        disposeObject(scene);
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
    // `signature` stands in for the model list; see the note above its definition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
