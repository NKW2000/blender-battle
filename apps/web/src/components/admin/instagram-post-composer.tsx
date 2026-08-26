'use client';

import { Difficulty } from '@bb/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import {
  POST_FORMATS,
  drawPost,
  postFileName,
  type PostFormatId,
  type PostFonts,
} from '@/lib/instagram-post';
import { notify } from '@/lib/notify';

/**
 * Builds a finished Instagram post from a challenge reference.
 *
 * Everything happens in the browser. The image is read from the chosen file,
 * composited onto a canvas and saved — nothing is uploaded, so this needed no
 * endpoint, no storage and no migration, and artwork for an unannounced
 * challenge never leaves the machine of whoever is making the post.
 */
export function InstagramPostComposer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [format, setFormat] = useState<PostFormatId>('portrait');
  const [title, setTitle] = useState('The couch');
  const [blurb, setBlurb] = useState('Nobody sees the brief before the room starts.');
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.HARD);
  const [url, setUrl] = useState('blenderbattle.vercel.app');
  const [fileName, setFileName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  /*
    The real font families, read off the page rather than named.

    `next/font` rewrites both faces to generated family names — the CSS variable
    resolves to something like `__Fredoka_a1b2c3`, and a canvas asked for
    "Fredoka" would silently fall back to a system sans. Reading the computed
    style off a probe element that carries the site's own classes is the only
    way to hand `ctx.font` a name it will actually honour.
  */
  const fonts = useCallback((): PostFonts => {
    const probe = probeRef.current;
    if (!probe) return { display: 'sans-serif', body: 'sans-serif' };

    const style = getComputedStyle(probe);
    return {
      display: style.getPropertyValue('--font-arcade') || style.fontFamily,
      body: style.getPropertyValue('--font-arcade-body') || style.fontFamily,
    };
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const spec = POST_FORMATS[format];
    canvas.width = spec.width;
    canvas.height = spec.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawPost(ctx, spec, { title, blurb, difficulty, url, image: imageRef.current }, fonts());
  }, [format, title, blurb, difficulty, url, fonts]);

  /*
    Wait for the webfonts before the first paint.

    A canvas drawn while Fredoka is still loading bakes the fallback face into
    the PNG permanently — unlike the DOM, it does not re-flow when the font
    arrives.
  */
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (ready) paint();
  }, [ready, paint]);

  // The object URL is revoked when it is replaced or the page goes away;
  // leaking one per file choice would pin every image in memory for the session.
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const chooseImage = (file: File | undefined) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      notify.error('That is not an image', 'Pick a PNG or JPEG reference.');
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;

    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setFileName(file.name);
      paint();
    };
    image.onerror = () => notify.error('That image could not be read', 'Try a different file.');
    image.src = objectUrl;
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) {
        notify.error('The post could not be saved', 'Try again.');
        return;
      }

      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = postFileName(title, format);
      link.click();
      URL.revokeObjectURL(href);
    }, 'image/png');
  };

  const spec = POST_FORMATS[format];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      {/* The probe carries the site's font variables so they can be read back. */}
      <span ref={probeRef} className="font-arcade sr-only" aria-hidden="true">
        font probe
      </span>

      <Panel>
        <PanelHeader>
          <PanelTitle>Preview</PanelTitle>
          <span className="font-mono text-xs text-bone-faint">
            {spec.width}×{spec.height} · {spec.ratio}
          </span>
        </PanelHeader>
        <PanelBody className="flex justify-center">
          {/*
            The canvas is drawn at full export resolution and shown scaled, so
            what is on screen is exactly the file that will be saved rather than
            a preview that has to be trusted.
          */}
          <canvas
            ref={canvasRef}
            className="h-auto w-full max-w-[420px] rounded-[16px] border-[3px] border-ink"
            style={{ boxShadow: '0 8px 0 var(--color-ink)', aspectRatio: `${spec.width} / ${spec.height}` }}
          />
        </PanelBody>
      </Panel>

      <div className="flex flex-col gap-6">
        <Panel>
          <PanelHeader>
            <PanelTitle>Post</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-4">
            <Field label="Shape">
              <div className="grid grid-cols-2 gap-2">
                {(Object.values(POST_FORMATS) as (typeof POST_FORMATS)[PostFormatId][]).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={format === option.id}
                    onClick={() => setFormat(option.id)}
                    className={`arcade-focus rounded-[14px] border-[3px] px-3 py-3 font-display text-sm font-bold transition-colors ${
                      format === option.id
                        ? 'border-sun bg-sun/20 text-cream'
                        : 'border-white/16 bg-white/6 text-bone hover:bg-white/12'
                    }`}
                  >
                    {option.label}
                    <span className="mt-0.5 block font-mono text-[11px] font-extrabold text-bone-faint">
                      {option.ratio}
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Reference image" hint={fileName ?? 'PNG or JPEG'}>
              <label className="arcade-focus flex cursor-pointer items-center justify-center rounded-[14px] border-[3px] border-dashed border-white/24 bg-white/5 px-4 py-6 text-center text-sm font-extrabold text-bone-muted hover:bg-white/10">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => chooseImage(event.target.files?.[0])}
                />
                {fileName ? 'Choose a different image' : 'Upload the challenge reference'}
              </label>
            </Field>

            <Field label="Title">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={60}
                className="arcade-focus w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 font-bold text-bone"
              />
            </Field>

            <Field label="Line under the title" hint="Optional">
              <input
                value={blurb}
                onChange={(event) => setBlurb(event.target.value)}
                maxLength={90}
                className="arcade-focus w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 font-bold text-bone"
              />
            </Field>

            <Field label="Difficulty">
              <Select
                ariaLabel="Difficulty"
                value={difficulty}
                onChange={(value) => setDifficulty(value as Difficulty)}
                options={Object.values(Difficulty).map((value) => ({
                  value,
                  label: value.charAt(0).toUpperCase() + value.slice(1),
                }))}
              />
            </Field>

            <Field label="Address in the footer">
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                maxLength={48}
                className="arcade-focus w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 font-mono text-sm font-bold text-bone"
              />
            </Field>
          </PanelBody>
        </Panel>

        <ChunkyButton size="md" sheen onClick={download} disabled={!ready}>
          {ready ? 'Download PNG' : 'Loading fonts…'}
        </ChunkyButton>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="eyebrow">{label}</span>
        {hint ? <span className="truncate font-mono text-[11px] text-bone-faint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
