'use client';

import { Difficulty } from '@bb/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import {
  POST_FORMATS,
  POST_KINDS,
  drawPost,
  normalizeInstagramHandle,
  postFileName,
  type PostFormatId,
  type PostFonts,
  type PostKind,
} from '@/lib/instagram-post';
import { usePublicProfile } from '@/features/users/use-users';
import { notify } from '@/lib/notify';

/**
 * Builds a finished Instagram post — either a challenge announcement or the
 * result, crediting the winner by their Instagram handle.
 *
 * Everything happens in the browser. The image is read from the chosen file,
 * composited onto a canvas and saved — nothing is uploaded, so this needed no
 * endpoint, no storage and no migration, and artwork for an unannounced
 * challenge never leaves the machine of whoever is making the post.
 */
/**
 * Everything a link can hand this page.
 *
 * The winner's name, handle, tally, entry and avatar are all already known to
 * whichever page is linking here, so retyping them is both slower and a chance
 * to get the credit wrong. Every field is optional — the page still works when
 * opened cold from the admin console.
 */
export interface PostPrefill {
  kind?: PostKind;
  title?: string;
  blurb?: string;
  difficulty?: Difficulty;
  handle?: string;
  username?: string;
  /** The discipline, on the pill over the reference. */
  category?: string;
  /** Minutes the challenge is estimated to take. */
  duration?: number;
  votes?: number;
  /** The challenge reference, or the winning render. */
  imageUrl?: string;
  avatarUrl?: string;
}

/**
 * Loads a remote image so the canvas can still be exported afterwards.
 *
 * `crossOrigin` is the whole point. Measured against the deployed site: without
 * it a Cloudinary image loads and draws perfectly, and then `toBlob` throws a
 * SecurityError because the canvas is tainted — the post would preview and
 * refuse to save. With it, Cloudinary's `Access-Control-Allow-Origin` lets the
 * canvas stay readable.
 */
function loadCorsImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}

export function InstagramPostComposer({ prefill }: { prefill?: PostPrefill }) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const probeRef = useRef<HTMLSpanElement>(null);
  const imageRef = useRef<CanvasImageSource | null>(null);
  const avatarRef = useRef<CanvasImageSource | null>(null);
  // Every object URL made here, so none of them outlive the page.
  const objectUrls = useRef<string[]>([]);

  const [kind, setKind] = useState<PostKind>(prefill?.kind ?? 'challenge');
  // One shape, so there is nothing to pick. The constant stays named rather
  // than inlined so the export and the filename keep reading in one place.
  const format: PostFormatId = 'portrait';
  const [title, setTitle] = useState(prefill?.title ?? 'The couch');
  const [blurb, setBlurb] = useState(
    prefill?.blurb ?? 'Nobody sees the brief before the room starts.',
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(prefill?.difficulty ?? Difficulty.HARD);
  const [url, setUrl] = useState('blenderbattle.vercel.app');
  const [handle, setHandle] = useState(prefill?.handle ?? '');
  const [category, setCategory] = useState(prefill?.category ?? 'Modeling');
  const [duration, setDuration] = useState<number | null>(prefill?.duration ?? 45);
  const [username, setUsername] = useState(prefill?.username ?? '');
  const [votes, setVotes] = useState<number | null>(prefill?.votes ?? null);
  const [callToAction, setCallToAction] = useState('Follow on Instagram');
  const [fileName, setFileName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingLinked, setLoadingLinked] = useState(false);

  // A winner is a two-slide carousel; an announcement is a single image.
  const slideCount = POST_KINDS[kind].slides;

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

  /*
    Every slide is redrawn together.

    A carousel is one post: the two images share a title, a palette and a foot,
    and repainting only the one being edited is how the pair drifts apart.
  */
  const paint = useCallback(() => {
    const spec = POST_FORMATS[format];
    const content = {
      kind,
      title,
      blurb,
      difficulty,
      url,
      handle,
      username,
      votes,
      callToAction,
      category,
      duration,
      image: imageRef.current,
      avatar: avatarRef.current,
    };

    canvasRefs.current.forEach((canvas, slide) => {
      if (!canvas) return;

      canvas.width = spec.width;
      canvas.height = spec.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      drawPost(ctx, spec, content, fonts(), slide);
    });
  }, [
    kind,
    format,
    title,
    blurb,
    difficulty,
    url,
    handle,
    username,
    votes,
    callToAction,
    category,
    duration,
    fonts,
  ]);

  /*
    Wait for the webfonts before the first paint.

    A canvas drawn while Fredoka is still loading bakes the fallback face into
    the PNG permanently — unlike the DOM, it does not re-flow when the font
    arrives.
  */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      /*
        The faces are asked for by name before waiting on them.

        `document.fonts.ready` resolves once nothing is *pending*, which is
        immediately true when nothing has requested a face — it says the fonts
        are settled, not that they arrived. A canvas drawn then bakes the
        fallback in permanently, and unlike the DOM it does not re-flow when the
        real face turns up. Watched happen: a poster rendered entirely in a
        serif with `fonts.ready` already resolved and every face `unloaded`.
      */
      const { display, body } = fonts();
      await Promise.all(
        [
          `700 136px ${display}`,
          `700 46px ${display}`,
          `700 34px ${display}`,
          `900 29px ${body}`,
          `800 31px ${body}`,
        ].map((face) => document.fonts.load(face).catch(() => undefined)),
      );
      await document.fonts.ready;

      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [fonts]);

  useEffect(() => {
    if (ready) paint();
  }, [ready, paint]);

  /*
    The winner's own profile fills in what the linking page did not know.

    An event knows who won and by how much; it does not carry their avatar or
    their Instagram handle. Looking those up here rather than on the event page
    keeps a public page from making a request that only an administrator's
    marketing tool needs.
  */
  const profile = usePublicProfile(prefill?.username ?? '');
  const profileData = profile.data;

  useEffect(() => {
    if (!profileData) return;

    // Never over an operator's own typing: only fills a field left empty.
    setHandle((current) => current || profileData.socialLinks.instagram || '');

    if (!profileData.avatarUrl || avatarRef.current) return;

    let cancelled = false;
    void loadCorsImage(profileData.avatarUrl)
      .then((image) => {
        if (cancelled) return;
        avatarRef.current = image;
        paint();
      })
      // A missing avatar is not worth a message: the credit reads fine without
      // a portrait, and there is nothing the operator could do about it.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [profileData, paint]);

  /*
    Pull in whatever the link pointed at.

    Once only, and deliberately not in the dependency list of `paint`: this
    fills the canvas in, and an operator who then uploads a different file must
    not have it pulled back from under them on the next render.
  */
  const linkedImage = prefill?.imageUrl;
  const linkedAvatar = prefill?.avatarUrl;

  useEffect(() => {
    if (!linkedImage && !linkedAvatar) return;

    let cancelled = false;
    setLoadingLinked(true);

    void (async () => {
      const [image, avatar] = await Promise.all([
        linkedImage ? loadCorsImage(linkedImage).catch(() => null) : null,
        linkedAvatar ? loadCorsImage(linkedAvatar).catch(() => null) : null,
      ]);

      if (cancelled) return;

      if (image) {
        imageRef.current = image;
        setFileName('From the challenge');
      }
      if (avatar) avatarRef.current = avatar;

      setLoadingLinked(false);
      // Only the entry image failing is worth interrupting for; a missing
      // avatar just means the winner never set one, and the post is fine.
      if (linkedImage && !image) {
        notify.error('The image could not be loaded', 'Upload it by hand instead.');
      }
      paint();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the link
  }, [linkedImage, linkedAvatar]);

  /*
    Object URLs are revoked when the page goes away.

    Not when one is replaced: the `Image` decoded from it is still the thing
    being drawn on every repaint, and revoking the URL a live image was decoded
    from is how a canvas ends up blank on the next redraw.
  */
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const chooseImage = (file: File | undefined) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      notify.error('That is not an image', 'Pick a PNG or JPEG.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    objectUrls.current.push(objectUrl);

    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setFileName(file.name);
      paint();
    };
    image.onerror = () => notify.error('That image could not be read', 'Try a different file.');
    image.src = objectUrl;
  };

  /** Saves one slide, resolving once the browser has been handed the file. */
  const saveSlide = (canvas: HTMLCanvasElement, slide: number) =>
    new Promise<boolean>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(false);
          return;
        }

        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = postFileName(title, format, kind, slide, slideCount);
        link.click();
        URL.revokeObjectURL(href);
        resolve(true);
      }, 'image/png');
    });

  const download = async () => {
    const canvases = canvasRefs.current.slice(0, slideCount).filter(Boolean) as HTMLCanvasElement[];
    if (canvases.length === 0) return;

    /*
      Saved one after another rather than all at once.

      Two `click()` calls in the same tick are treated as a multiple-download
      attempt and the browser silently drops the second, so the operator gets
      slide one and no warning that slide two never arrived.
    */
    let saved = 0;
    for (const [slide, canvas] of canvases.entries()) {
      if (await saveSlide(canvas, slide)) saved += 1;
    }

    if (saved < canvases.length) {
      notify.error('Not every slide was saved', 'Try again.');
    }
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
            {slideCount > 1 ? `${slideCount} slides · ` : ''}
            {spec.width}×{spec.height} · {spec.ratio}
          </span>
        </PanelHeader>
        <PanelBody className="flex flex-wrap items-start justify-center gap-5">
          {/*
            Every slide, side by side, each drawn at full export resolution and
            shown scaled — so what is on screen is exactly the file that will be
            saved rather than a preview that has to be trusted. Seeing the pair
            together is also the only way to tell whether they read as one post.
          */}
          {Array.from({ length: slideCount }).map((_, slide) => (
            <figure key={slide} className="flex min-w-0 flex-col items-center gap-2">
              <canvas
                ref={(node) => {
                  canvasRefs.current[slide] = node;
                }}
                className="h-auto w-full max-w-[340px] rounded-[16px] border-[3px] border-ink"
                style={{
                  boxShadow: '0 8px 0 var(--color-ink)',
                  aspectRatio: `${spec.width} / ${spec.height}`,
                }}
              />
              {slideCount > 1 ? (
                <figcaption className="eyebrow">
                  {slide === 0 ? 'Slide 1 · the tease' : 'Slide 2 · the reveal'}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </PanelBody>
      </Panel>

      <div className="flex flex-col gap-6">
        <Panel>
          <PanelHeader>
            <PanelTitle>Post</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-4">
            <Field label="Post">
              {/* Two posts, one layout. Announcing a challenge and crowning its
                  winner should look like the same product in a feed. */}
              <div className="grid grid-cols-2 gap-2">
                {(Object.values(POST_KINDS) as (typeof POST_KINDS)[PostKind][]).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={kind === option.id}
                    onClick={() => setKind(option.id)}
                    className={`arcade-focus rounded-[14px] border-[3px] px-3 py-3 font-display text-sm font-bold transition-colors ${
                      kind === option.id
                        ? 'border-sun bg-sun/20 text-cream'
                        : 'border-white/16 bg-white/6 text-bone hover:bg-white/12'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label={kind === 'winner' ? 'Winning render' : 'Reference image'}
              hint={fileName ?? 'PNG or JPEG'}
            >
              <label className="arcade-focus flex cursor-pointer items-center justify-center rounded-[14px] border-[3px] border-dashed border-white/24 bg-white/5 px-4 py-6 text-center text-sm font-extrabold text-bone-muted hover:bg-white/10">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => chooseImage(event.target.files?.[0])}
                />
                {fileName
                  ? 'Choose a different image'
                  : kind === 'winner'
                    ? 'Upload the winning render'
                    : 'Upload the challenge reference'}
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

            {kind === 'challenge' ? (
              <Field label="Line under the title" hint="Optional">
              <input
                value={blurb}
                onChange={(event) => setBlurb(event.target.value)}
                maxLength={90}
                  className="arcade-focus w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 font-bold text-bone"
                />
              </Field>
            ) : null}

            {kind === 'challenge' ? (
              <Field label="Discipline" hint="On the pill over the image">
                <input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  maxLength={24}
                  placeholder="Modeling"
                  className="arcade-focus w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 font-bold text-bone"
                />
              </Field>
            ) : null}

            {kind === 'challenge' ? (
              <Field label="Minutes" hint={duration === null ? 'Hidden' : 'On the image'}>
                <input
                  type="number"
                  min={1}
                  value={duration ?? ''}
                  onChange={(event) =>
                    setDuration(event.target.value === '' ? null : Math.max(1, Number(event.target.value)))
                  }
                  placeholder="—"
                  className="arcade-focus w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 font-mono text-sm font-bold text-bone"
                />
              </Field>
            ) : null}

            {kind === 'winner' ? (
              <Field label="Winner" hint="Their name on the site">
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="username"
                  maxLength={40}
                  className="arcade-focus w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 font-bold text-bone"
                />
              </Field>
            ) : null}

            {kind === 'winner' ? (
              <Field label="Votes" hint={votes === null ? 'Hidden' : 'On the frame'}>
                {/*
                  Empty means no tally rather than zero — a challenge that
                  finished without a vote should not be announced as "0 VOTES".
                */}
                <input
                  type="number"
                  min={0}
                  value={votes ?? ''}
                  onChange={(event) =>
                    setVotes(event.target.value === '' ? null : Math.max(0, Number(event.target.value)))
                  }
                  placeholder="—"
                  className="arcade-focus w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 font-mono text-sm font-bold text-bone"
                />
              </Field>
            ) : null}

            {kind === 'winner' ? (
              <Field label="Winner's Instagram" hint={handle ? `@${normalizeInstagramHandle(handle)}` : '@handle'}>
                {/*
                  Whatever gets pasted is reduced to a bare handle when it is
                  drawn, so a profile URL or a handle with the '@' already on it
                  both work. The hint shows what will actually appear.
                */}
                <input
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  placeholder="username"
                  maxLength={90}
                  className="arcade-focus w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 font-mono text-sm font-bold text-bone"
                />
              </Field>
            ) : null}

            {kind === 'winner' ? (
              <Field label="Line under the handle" hint={handle ? 'Shown' : 'Needs a handle'}>
                {/*
                  Kept as a field rather than a fixed string: the winner may use
                  any pronoun, or none, and the person writing the post is the
                  one who knows which. It is not drawn at all without a handle,
                  since there would be nothing to follow.
                */}
                <input
                  value={callToAction}
                  onChange={(event) => setCallToAction(event.target.value)}
                  maxLength={40}
                  placeholder="Follow on Instagram"
                  className="arcade-focus w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 font-bold text-bone"
                />
              </Field>
            ) : null}

            {kind === 'challenge' ? (
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
            ) : null}

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

        <ChunkyButton
          size="md"
          sheen
          onClick={() => void download()}
          disabled={!ready || loadingLinked}
        >
          {!ready
            ? 'Loading fonts…'
            : loadingLinked
              ? 'Fetching the images…'
              : slideCount > 1
                ? `Download ${slideCount} PNGs`
                : 'Download PNG'}
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
