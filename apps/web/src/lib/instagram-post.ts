import { Difficulty } from '@bb/shared';

/**
 * Draws a finished Instagram post onto a canvas.
 *
 * Everything runs in the browser and nothing is uploaded: the reference is read
 * from the chosen file, composited locally, and handed back as a PNG. That
 * keeps a marketing tool from needing an endpoint, a bucket or a migration, and
 * artwork for an unannounced challenge never leaves the machine making the post.
 *
 * The layout is the product's own arcade language — thick ink outlines, hard
 * offset shadows, the sun accent, tilted chunky slabs — because a post that does
 * not look like the site is worth less than no post at all.
 */

/* --------------------------------------------------------------- formats */

/**
 * The shape Instagram gives a feed post.
 *
 * One, not a choice of two. 4:5 at 1080x1350 is the tallest a feed post may be
 * and the size Instagram's own guidance names — it takes the most screen on a
 * phone, and the grid crops every other ratio to it anyway. A square was the
 * safe default a decade ago; offering it now is offering a version of the same
 * poster with less of the screen and the same work to make.
 */
export const POST_FORMATS = {
  portrait: { id: 'portrait', label: 'Portrait', ratio: '4:5', width: 1080, height: 1350 },
} as const;

export type PostFormatId = keyof typeof POST_FORMATS;
export type PostFormat = (typeof POST_FORMATS)[PostFormatId];

/**
 * The two posts this tool makes.
 *
 * They are one layout with two headlines rather than two designs: a feed where
 * the announcement and the result look like the same product is the whole point
 * of making them here instead of in a graphics editor.
 */
export const POST_KINDS = {
  challenge: { id: 'challenge', label: 'New challenge', marquee: 'NEW CHALLENGE', slides: 1 },
  winner: { id: 'winner', label: 'Winner', marquee: 'WINNER', slides: 2 },
} as const;

export type PostKind = keyof typeof POST_KINDS;

/* ---------------------------------------------------------------- tokens */

const INK = '#0e0b2b';
const CREAM = '#fff6e9';
const SUN = '#ffd23f';
const AQUA = '#4ad4ff';
const MINT = '#5ef2a8';
const PUNCH = '#ff3d9a';
const HAZE = 'rgba(255, 246, 233, 0.60)';

/** Difficulty keeps the colour it has everywhere else in the product. */
export const DIFFICULTY_STYLE: Record<Difficulty, { label: string; fill: string; ink: string }> = {
  [Difficulty.EASY]: { label: 'EASY', fill: MINT, ink: INK },
  [Difficulty.MEDIUM]: { label: 'MEDIUM', fill: SUN, ink: INK },
  [Difficulty.HARD]: { label: 'HARD', fill: PUNCH, ink: CREAM },
};

export interface PostContent {
  kind: PostKind;
  title: string;
  difficulty: Difficulty;
  blurb: string;
  url: string;
  image: CanvasImageSource | null;
  /** The winner's Instagram handle, without the '@'. Ignored by a challenge post. */
  handle: string;
  /** The winner's name on the site, shown above the handle. Winner post only. */
  username: string;
  /** Their avatar, drawn as a circle beside the name. Null if they have none. */
  avatar: CanvasImageSource | null;
  /** Votes the winning entry took. Null hides the tally. Winner post only. */
  votes: number | null;
  /** The line under the credit, e.g. "Follow on Instagram". Winner post only. */
  callToAction: string;
  /** The discipline, on the pill over the reference. Announcement only. */
  category: string;
  /** Minutes the challenge is estimated to take. Null hides that pill. */
  duration: number | null;
}

export interface PostFonts {
  display: string;
  body: string;
}

/* ----------------------------------------------------------- pure helpers */

/** Cover-fit: the source rect to draw so an image fills a box undistorted. */
export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const boxRatio = boxWidth / boxHeight;

  if (sourceRatio > boxRatio) {
    const width = sourceHeight * boxRatio;
    return { sx: (sourceWidth - width) / 2, sy: 0, sw: width, sh: sourceHeight };
  }

  const height = sourceWidth / boxRatio;
  return { sx: 0, sy: (sourceHeight - height) / 2, sw: sourceWidth, sh: height };
}

/**
 * Reduces whatever the admin pasted to a bare Instagram handle.
 *
 * People paste a profile URL, a handle with the '@' already on it, or a handle
 * with a stray space — and a post that credits the winner as
 * "@https://instagram.com/someone/" is worse than one that credits nobody.
 * Instagram's own rules are the target: letters, digits, dots and underscores,
 * up to thirty characters.
 */
export function normalizeInstagramHandle(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // A pasted profile link: keep the first path segment, drop the rest.
  const fromUrl = trimmed.replace(/^.*instagram\.com\//i, '');
  const firstSegment = fromUrl.split(/[/?#]/)[0] ?? '';

  return firstSegment
    .replace(/^@+/, '')
    .replace(/[^A-Za-z0-9._]/g, '')
    .toLowerCase()
    .slice(0, 30);
}

/** Breaks a line to fit a width, using a caller-supplied measurer. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = words[0]!;

  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (measure(candidate) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }

  lines.push(line);
  return lines;
}

/**
 * A link to the composer with a post already filled in.
 *
 * Built here rather than at each call site so the parameter names cannot drift
 * from the ones the page reads back, and so an absent value is left out
 * entirely instead of arriving as the string "null".
 */
export function instagramPostHref(params: {
  kind: PostKind;
  title?: string | null;
  blurb?: string | null;
  difficulty?: Difficulty | null;
  username?: string | null;
  votes?: number | null;
  imageUrl?: string | null;
  avatarUrl?: string | null;
  category?: string | null;
  duration?: number | null;
}) {
  const query = new URLSearchParams({ kind: params.kind });

  const put = (key: string, value: string | null | undefined) => {
    if (value) query.set(key, value);
  };

  put('title', params.title);
  put('blurb', params.blurb);
  put('difficulty', params.difficulty);
  put('username', params.username);
  put('image', params.imageUrl);
  put('avatar', params.avatarUrl);
  put('category', params.category);

  if (typeof params.duration === 'number' && params.duration > 0) {
    query.set('duration', String(params.duration));
  }

  // Zero is a real tally and must survive, which `put` would drop.
  if (typeof params.votes === 'number' && params.votes >= 0) {
    query.set('votes', String(params.votes));
  }

  return `/admin/instagram?${query.toString()}`;
}

/**
 * Accepts a URL only if it is https.
 *
 * These arrive as query parameters and go straight into an `<img src>`, and
 * anyone can put anything in an address bar. Restricting the scheme keeps a
 * crafted link from making this page fetch a `javascript:` or `data:` payload
 * under the site's own origin.
 */
export function safeImageUrl(value: string | undefined | null) {
  if (!value) return undefined;
  try {
    return new URL(value).protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** A filename that sorts and reads sensibly in a downloads folder. */
export function postFileName(
  title: string,
  format: PostFormatId,
  kind: PostKind = 'challenge',
  slide = 0,
  slideCount = 1,
) {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'challenge';

  // The announcement and the result for one challenge share a title, so without
  // the kind in the name the second download lands as "(1)" beside the first.
  const prefix = kind === 'winner' ? 'blenderbattle-winner' : 'blenderbattle';

  /*
    A carousel's slides are numbered, and numbered from one.

    They are uploaded in order and a downloads folder sorts by name, so the
    order the operator sees is the order Instagram will be given. Without the
    number the second file lands as "(1)", which sorts the same either way.
  */
  const position = slideCount > 1 ? `-${slide + 1}of${slideCount}` : '';

  return `${prefix}-${slug}-${POST_FORMATS[format].ratio.replace(':', 'x')}${position}.png`;
}

/* --------------------------------------------------------------- drawing */

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The product's slab: hard offset shadow, fill, then the ink outline. */
function slab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  { shadow = 12, border = 6 } = {},
) {
  if (shadow > 0) {
    ctx.fillStyle = INK;
    roundedRect(ctx, x, y + shadow, w, h, r);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  roundedRect(ctx, x, y, w, h, r);
  ctx.fill();
  if (border > 0) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = border;
    roundedRect(ctx, x, y, w, h, r);
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ slides */

/**
 * Renders one slide of a post.
 *
 * A challenge announcement is a single image. A result is two: the first asks
 * the question and points right, the second answers it. A carousel is the one
 * place on Instagram where a reader will hold a thought between two images, and
 * who won is worth holding.
 */
export function drawPost(
  ctx: CanvasRenderingContext2D,
  format: PostFormat,
  content: PostContent,
  fonts: PostFonts,
  slide = 0,
) {
  const { width: W, height: H } = format;

  ctx.clearRect(0, 0, W, H);

  // Each poster owns its whole surface, ground included: the three handoffs
  // differ in the fan, the bloom and where the shapes sit, so there is no
  // shared backdrop left to draw before them.
  if (content.kind === 'challenge') drawChallengePoster(ctx, format, content, fonts);
  else if (slide === 0) drawWinnerTease(ctx, format, content, fonts);
  else drawWinnerReveal(ctx, format, content, fonts);
}

/* ------------------------------------------------ the challenge poster */

/*
  Colours taken from the handoff rather than the app's tokens.

  The poster is its own artefact — it is exported as a PNG and lives on
  Instagram, not in the product — and the design sets a deeper ground and a
  different violet than any surface in the app. Matching the tokens instead
  would be matching a different picture.
*/
const POSTER_GROUND = '#1B1550';
const POSTER_FRAME = '#171243';
const POSTER_URL = '#B7AFE6';

/**
 * Ink-outlined type, the way the poster sets every heading.
 *
 * The design uses `-webkit-text-stroke` with `paint-order: stroke fill`, which
 * puts the outline behind the glyph so only its outer half shows. A canvas has
 * no paint order, so the stroke is drawn first at twice the width and the fill
 * covers the inner half — the same result by construction. The hard shadow is
 * the whole lockup drawn again underneath, offset, in the outline colour.
 */
function strokedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  stroke: number,
  shadow: number,
) {
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  if (shadow > 0) {
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = stroke * 2;
    ctx.strokeText(text, x, y + shadow);
    ctx.fillText(text, x, y + shadow);
  }

  ctx.strokeStyle = INK;
  ctx.lineWidth = stroke * 2;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** A chunky pill: ink border, hard shadow, a word inside. */
function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    fill: string;
    ink: string;
    fontSize: number;
    tracking: number;
    padX: number;
    padY: number;
    border: number;
    shadow: number;
    anchor: 'left' | 'right';
    rotate?: number;
    dot?: boolean;
    fonts: PostFonts;
  },
) {
  const { fonts, fontSize, tracking, padX, padY, border, shadow, fill, ink } = options;

  ctx.save();
  ctx.font = `700 ${fontSize}px ${fonts.display}`;
  ctx.letterSpacing = `${tracking}px`;

  const dotSize = options.dot ? 14 : 0;
  const dotGap = options.dot ? 12 : 0;
  const textWidth = ctx.measureText(text).width;
  const w = textWidth + dotSize + dotGap + padX * 2;
  const h = fontSize + padY * 2;

  const left = options.anchor === 'left' ? x : x - w;

  ctx.translate(left + w / 2, y + h / 2);
  if (options.rotate) ctx.rotate((options.rotate * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);

  slab(ctx, 0, 0, w, h, h / 2, fill, { shadow, border });

  if (options.dot) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(padX + dotSize / 2, h / 2, dotSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, padX + dotSize + dotGap, h / 2 + 1);

  ctx.letterSpacing = '0px';
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * The announcement poster, drawn to the handoff.
 *
 * Its own ground rather than the one the winner slides share: the design puts a
 * turning fan of rays behind a violet bloom, which is a different picture from
 * the flat lamp those were built on. They keep theirs until their own handoffs
 * are built.
 */
function drawChallengePoster(
  ctx: CanvasRenderingContext2D,
  format: PostFormat,
  content: PostContent,
  fonts: PostFonts,
) {
  const { width: W, height: H } = format;

  posterGround(ctx, W, H, {
    rayColour: 'rgba(255,255,255,0.055)',
    rayTop: -260,
    raySize: 2100,
    rayBlur: 0,
    bloomW: 760,
    bloomH: 640,
    bloomY: 0.44,
    bloomAlpha: 0.55,
    fadeHeight: 300,
    fadeAlpha: 0.75,
    dotBlur: 0,
    shapeBlur: 0,
    shapes: [
      { x: 44, y: 300, size: 74, fill: SUN, radius: 20, rot: -12, border: 7, shadow: 8 },
      { x: W - 38 - 60, y: 690, size: 60, fill: MINT, radius: 30, rot: 0, border: 7, shadow: 7 },
      { x: 66, y: H - 250 - 66, size: 66, fill: PUNCH, radius: 18, rot: 14, border: 7, shadow: 8 },
      { x: W - 70 - 52, y: 1000, size: 52, fill: SUN, radius: 14, rot: -20, border: 6, shadow: 7 },
    ],
  });

  posterMarquee(ctx, W, 54, POST_KINDS.challenge.marquee, 4, fonts);
  posterBrand(ctx, W, 164, content.url, fonts);

  /* --- the type at the foot, measured first so the stage can be sized --- */
  const titlePad = 62;
  const titleRoom = W - titlePad * 2;
  const raw = (content.title || 'Untitled challenge').toUpperCase();

  /*
    One line, shrunk until it fits.

    The design sets the title at 136 and forbids it wrapping. A canvas cannot
    overflow, and a challenge is free text, so the size comes down until the
    outlined width fits the column rather than the words running off the poster.
  */
  let titleSize = 136;
  ctx.letterSpacing = '-1px';
  for (; titleSize > 54; titleSize -= 2) {
    ctx.font = `700 ${titleSize}px ${fonts.display}`;
    // The stroke adds half its width to each end of the run.
    if (ctx.measureText(raw).width + titleSize * 0.24 <= titleRoom) break;
  }
  ctx.font = `700 ${titleSize}px ${fonts.display}`;

  ctx.letterSpacing = '0px';
  ctx.font = `900 29px ${fonts.body}`;
  const blurbLines = content.blurb.trim()
    ? wrapText(content.blurb, 800, (s) => ctx.measureText(s).width).slice(0, 2)
    : [];

  const titleLine = titleSize * 0.9;
  const blockHeight = titleLine + (blurbLines.length ? 22 + blurbLines.length * 38 : 0);
  const blockTop = H - 58 - blockHeight;

  /* --- the stage -------------------------------------------------------- */
  const stageTop = 290;
  const stageBottom = blockTop - 46;
  const size = Math.max(200, Math.min(770, stageBottom - stageTop, W - 74 * 2));
  const stageY = stageTop + (stageBottom - stageTop - size) / 2;
  const stageX = (W - size) / 2;

  /* The yellow card behind, tilted the other way — the thing that makes the
     reference look pinned to the poster rather than dropped onto it. */
  ctx.save();
  ctx.translate(stageX + size / 2, stageY + size / 2);
  ctx.rotate((-1.6 * Math.PI) / 180);
  slab(ctx, -size / 2 - 14, -size / 2 - 14, size + 28, size + 28, 16, SUN, {
    shadow: 0,
    border: 7,
  });
  ctx.restore();

  ctx.fillStyle = INK;
  roundedRect(ctx, stageX, stageY + 16, size, size, 10);
  ctx.fill();

  ctx.fillStyle = POSTER_FRAME;
  roundedRect(ctx, stageX, stageY, size, size, 10);
  ctx.fill();

  if (content.image) {
    const source = content.image as { width?: number; height?: number };
    const crop = coverCrop(Number(source.width ?? size), Number(source.height ?? size), size, size);

    ctx.save();
    roundedRect(ctx, stageX, stageY, size, size, 10);
    ctx.clip();
    ctx.drawImage(content.image, crop.sx, crop.sy, crop.sw, crop.sh, stageX, stageY, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = HAZE;
    ctx.font = `900 28px ${fonts.body}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("Drop this week's reference render", stageX + size / 2, stageY + size / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  roundedRect(ctx, stageX, stageY, size, size, 10);
  ctx.stroke();

  /* --- what the poster says about the challenge ------------------------- */
  if (content.category.trim()) {
    pill(ctx, content.category.trim().toUpperCase(), stageX + 26, stageY + 26, {
      fill: AQUA,
      ink: INK,
      fontSize: 22,
      tracking: 2,
      padX: 26,
      padY: 11,
      border: 6,
      shadow: 7,
      anchor: 'left',
      dot: true,
      fonts,
    });
  }

  const difficulty = DIFFICULTY_STYLE[content.difficulty];
  pill(ctx, difficulty.label, stageX + size - 22, stageY + 22, {
    fill: difficulty.fill,
    ink: difficulty.ink,
    fontSize: 40,
    tracking: 2.5,
    padX: 40,
    padY: 13,
    border: 7,
    shadow: 11,
    anchor: 'right',
    rotate: 7,
    fonts,
  });

  if (content.duration !== null && content.duration > 0) {
    pill(ctx, `${content.duration} MIN`, stageX + size - 26, stageY + size - 26 - 46, {
      fill: SUN,
      ink: INK,
      fontSize: 24,
      tracking: 1.6,
      padX: 28,
      padY: 11,
      border: 6,
      shadow: 7,
      anchor: 'right',
      fonts,
    });
  }

  /* --- the title -------------------------------------------------------- */
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${titleSize}px ${fonts.display}`;
  ctx.letterSpacing = '-1px';
  strokedText(ctx, raw, W / 2, blockTop + titleLine * 0.82, SUN, 16, 12);
  ctx.letterSpacing = '0px';

  if (blurbLines.length) {
    ctx.font = `900 29px ${fonts.body}`;
    ctx.fillStyle = CREAM;
    let y = blockTop + titleLine + 22 + 26;
    for (const line of blurbLines) {
      ctx.fillText(line, W / 2, y);
      y += 38;
    }
  }

  ctx.textAlign = 'left';
}

/* ------------------------------------------------- shared poster furniture */

interface PosterShape {
  x: number;
  y: number;
  size: number;
  fill: string;
  radius: number;
  rot: number;
  border: number;
  shadow: number;
}

/**
 * Draws a layer once into an offscreen canvas and composites it blurred.
 *
 * `ctx.filter` applies per draw call, not per group: with a blur set, each of
 * the six hundred dots and twenty ray wedges made the browser allocate and blur
 * its own offscreen surface — around seven hundred of them for one slide, and
 * the composer repaints on every keystroke. Rendering the layer flat and
 * blurring the result once is the same picture for three filtered draws instead
 * of seven hundred.
 */
function blurredLayer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  blur: number,
  draw: (target: CanvasRenderingContext2D) => void,
) {
  if (blur <= 0) {
    draw(ctx);
    return;
  }

  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const target = off.getContext('2d');

  // No offscreen context is a reason to draw sharp, never a reason to draw
  // nothing.
  if (!target) {
    draw(ctx);
    return;
  }

  draw(target);

  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

/**
 * The ground every poster stands on: a fan of rays, a violet bloom, a dot
 * field, a darkened floor, and the brand shapes drifting over it.
 *
 * Parameterised rather than copied three times. The slides differ only in the
 * fan's colour and reach, how far the bloom spreads, and where the shapes sit —
 * everything else about the ground is the same picture, and three copies of it
 * would drift apart the first time one was adjusted.
 */
function posterGround(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  o: {
    rayColour: string;
    rayTop: number;
    raySize: number;
    rayBlur: number;
    bloomW: number;
    bloomH: number;
    bloomY: number;
    bloomAlpha: number;
    fadeHeight: number;
    fadeAlpha: number;
    dotBlur: number;
    shapeBlur: number;
    shapes: PosterShape[];
  },
) {
  ctx.fillStyle = POSTER_GROUND;
  ctx.fillRect(0, 0, W, H);

  /*
    The fan of rays, which in the design is a repeating conic gradient turning
    slowly. A still frame cannot turn, so what is kept is the shape: wedges
    every eighteen degrees from a centre above the poster, spreading down it.
  */
  const radius = o.raySize / 2;
  blurredLayer(ctx, W, H, o.rayBlur, (target) => {
    target.fillStyle = o.rayColour;
    for (let deg = 0; deg < 360; deg += 18) {
      target.beginPath();
      target.moveTo(W / 2, o.rayTop + radius);
      target.arc(
        W / 2,
        o.rayTop + radius,
        radius,
        (deg * Math.PI) / 180,
        ((deg + 9) * Math.PI) / 180,
      );
      target.closePath();
      target.fill();
    }
  });

  /* The violet bloom: an ellipse, so the context is squashed to draw it. */
  ctx.save();
  ctx.translate(W / 2, H * o.bloomY);
  ctx.scale(1, o.bloomH / o.bloomW);
  const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, o.bloomW);
  bloom.addColorStop(0, `rgba(94,42,158,${o.bloomAlpha})`);
  bloom.addColorStop(0.72, 'rgba(27,21,80,0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(0, 0, o.bloomW, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  blurredLayer(ctx, W, H, o.dotBlur, (target) => {
    target.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = 23; y < H; y += 46) {
      for (let x = 23; x < W; x += 46) {
        target.beginPath();
        target.arc(x, y, 3, 0, Math.PI * 2);
        target.fill();
      }
    }
  });

  /* The floor darkens, so the type at the foot sits on something. */
  const fade = ctx.createLinearGradient(0, H - o.fadeHeight, 0, H);
  fade.addColorStop(0, 'rgba(11,9,34,0)');
  fade.addColorStop(1, `rgba(11,9,34,${o.fadeAlpha})`);
  ctx.fillStyle = fade;
  ctx.fillRect(0, H - o.fadeHeight, W, o.fadeHeight);

  blurredLayer(ctx, W, H, o.shapeBlur, (target) => {
    for (const s of o.shapes) {
      target.save();
      target.translate(s.x + s.size / 2, s.y + s.size / 2);
      target.rotate((s.rot * Math.PI) / 180);
      slab(target, -s.size / 2, -s.size / 2, s.size, s.size, s.radius, s.fill, {
        shadow: s.shadow,
        border: s.border,
      });
      target.restore();
    }
  });
}

/** The tilted band across the head, repeating a word with diamonds between. */
function posterMarquee(
  ctx: CanvasRenderingContext2D,
  W: number,
  top: number,
  word: string,
  tracking: number,
  fonts: PostFonts,
) {
  ctx.save();
  ctx.translate(W / 2, top + 44);
  ctx.rotate((-2.6 * Math.PI) / 180);

  const bandW = W + 92;
  const bandH = 88;

  ctx.fillStyle = 'rgba(14,11,43,0.9)';
  ctx.fillRect(-bandW / 2, -bandH / 2 + 14, bandW, bandH);
  ctx.fillStyle = SUN;
  ctx.fillRect(-bandW / 2, -bandH / 2, bandW, bandH);
  ctx.fillStyle = INK;
  ctx.fillRect(-bandW / 2, -bandH / 2, bandW, 7);
  ctx.fillRect(-bandW / 2, bandH / 2 - 7, bandW, 7);

  ctx.font = `700 34px ${fonts.display}`;
  ctx.letterSpacing = `${tracking}px`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${word}  ◆  ${word}  ◆  ${word}  ◆  ${word}  ◆`, 0, 2);
  ctx.letterSpacing = '0px';
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * The mark and the wordmark, with a line under them.
 *
 * The line is the site address on two of the three posters and the challenge's
 * name on the third, so it is passed in rather than assumed. Returns the y it
 * finished at, so what follows starts from where the brand actually ended.
 */
function posterBrand(
  ctx: CanvasRenderingContext2D,
  W: number,
  top: number,
  subtitle: string,
  fonts: PostFonts,
  markSize = 58,
): number {
  const y = top + markSize / 2;

  ctx.font = `700 46px ${fonts.display}`;
  ctx.letterSpacing = '0.5px';
  const blender = ctx.measureText('BLENDER').width;
  const battle = ctx.measureText('BATTLE').width;
  const lockup = markSize + 18 + blender + battle;
  const startX = (W - lockup) / 2;

  ctx.save();
  ctx.translate(startX + markSize / 2, y);
  ctx.rotate(Math.PI / 4);
  slab(ctx, -markSize / 2, -markSize / 2, markSize, markSize, 15, SUN, { shadow: 7, border: 7 });
  ctx.fillStyle = INK;
  roundedRect(ctx, -8, -8, 16, 16, 4);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 46px ${fonts.display}`;
  strokedText(ctx, 'BLENDER', startX + markSize + 18, y, CREAM, 7, 6);
  strokedText(ctx, 'BATTLE', startX + markSize + 18 + blender, y, SUN, 7, 6);
  ctx.letterSpacing = '0px';

  ctx.font = `900 21px ${fonts.body}`;
  ctx.letterSpacing = '1.6px';
  ctx.fillStyle = POSTER_URL;
  ctx.textAlign = 'center';
  ctx.fillText(subtitle, W / 2, y + markSize / 2 + 25);
  ctx.letterSpacing = '0px';

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  return y + markSize / 2 + 38;
}

/** Shrinks a single line until it fits the column, stroke included. */
function fitLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  room: number,
  start: number,
  floor: number,
  fonts: PostFonts,
  tracking: string,
): number {
  ctx.letterSpacing = tracking;
  let size = start;
  for (; size > floor; size -= 2) {
    ctx.font = `700 ${size}px ${fonts.display}`;
    if (ctx.measureText(text).width + size * 0.24 <= room) break;
  }
  ctx.font = `700 ${size}px ${fonts.display}`;
  return size;
}

/* --------------------------------------------------------- winner slide one */

/**
 * The question: which challenge, and an arrow saying there is more.
 *
 * Nothing about the winner appears here. The slide exists to be swiped past,
 * and showing the answer would remove the only reason to swipe.
 */
function drawWinnerTease(
  ctx: CanvasRenderingContext2D,
  format: PostFormat,
  content: PostContent,
  fonts: PostFonts,
) {
  const { width: W, height: H } = format;

  posterGround(ctx, W, H, {
    rayColour: 'rgba(255,210,63,0.085)',
    rayTop: -460,
    raySize: 2000,
    rayBlur: 3,
    bloomW: 680,
    bloomH: 560,
    bloomY: 0.46,
    bloomAlpha: 0.5,
    fadeHeight: 280,
    fadeAlpha: 0.7,
    dotBlur: 1.5,
    shapeBlur: 1.6,
    shapes: [
      { x: 44, y: 340, size: 76, fill: SUN, radius: 20, rot: -12, border: 7, shadow: 8 },
      { x: W - 38 - 58, y: 320, size: 58, fill: AQUA, radius: 29, rot: 0, border: 7, shadow: 7 },
      { x: 66, y: H - 300 - 66, size: 66, fill: MINT, radius: 18, rot: 14, border: 7, shadow: 8 },
      { x: W - 52 - 54, y: H - 320 - 54, size: 54, fill: PUNCH, radius: 27, rot: 0, border: 7, shadow: 7 },
    ],
  });

  posterMarquee(ctx, W, 48, POST_KINDS.winner.marquee, 5, fonts);

  /* The brand sits at the foot of this one, so the sentence owns the middle. */
  const brandTop = H - 58 - 56 - 12 - 26;
  posterBrand(ctx, W, brandTop, content.url, fonts, 56);

  const room = W - 70 * 2;
  const name = (content.title || 'this challenge').toUpperCase();
  const nameSize = fitLine(ctx, name, room, 158, 62, fonts, '-2px');
  ctx.letterSpacing = '0px';

  /*
    The sentence is centred in what the marquee and the brand leave, so it reads
    as one held thought rather than a page with a gap in the middle.
  */
  const cue = 116;
  const blockH = 52 + 26 + nameSize * 0.88 + 26 + 52 + 26 + cue;
  const top = 158;
  const bottom = brandTop - 30;
  let y = top + Math.max(16, (bottom - top - blockH) / 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `700 52px ${fonts.display}`;
  ctx.letterSpacing = '4px';
  ctx.fillStyle = POSTER_URL;
  y += 52;
  ctx.fillText('THE WINNER OF', W / 2, y);
  ctx.letterSpacing = '0px';

  y += 26 + nameSize * 0.88;
  ctx.font = `700 ${nameSize}px ${fonts.display}`;
  ctx.letterSpacing = '-2px';
  strokedText(ctx, name, W / 2, y, SUN, 18, 14);
  ctx.letterSpacing = '0px';

  y += 26 + 52;
  ctx.font = `700 52px ${fonts.display}`;
  ctx.letterSpacing = '6px';
  ctx.fillStyle = POSTER_URL;
  ctx.fillText('IS…', W / 2, y);
  ctx.letterSpacing = '0px';

  drawSwipeCue(ctx, W / 2, y + 26 + cue / 2, fonts);
  ctx.textAlign = 'left';
}

/**
 * The swipe cue: SWIPE beside an arrow in an ink disc, on a yellow pill.
 *
 * The arrow is drawn rather than typed. A glyph is among the first things a
 * fallback face drops, and the one element whose whole job is to say "there is
 * more this way" must not depend on which font loaded.
 */
function drawSwipeCue(ctx: CanvasRenderingContext2D, cx: number, cy: number, fonts: PostFonts) {
  const disc = 62;
  ctx.font = `700 38px ${fonts.display}`;
  ctx.letterSpacing = '3px';
  const label = ctx.measureText('SWIPE').width;

  const w = 38 + label + 20 + disc + 20;
  const h = disc + 28;
  const left = cx - w / 2;
  const top = cy - h / 2;

  slab(ctx, left, top, w, h, h / 2, SUN, { shadow: 11, border: 7 });

  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SWIPE', left + 38, cy + 1);
  ctx.letterSpacing = '0px';

  const discX = left + 38 + label + 20 + disc / 2;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(discX, cy, disc / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = SUN;
  ctx.beginPath();
  ctx.moveTo(discX - 8, cy - 16);
  ctx.lineTo(discX + 16, cy);
  ctx.lineTo(discX - 8, cy + 16);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/* --------------------------------------------------------- winner slide two */

/** The answer: the winning render, the badges, the face and the handle. */
function drawWinnerReveal(
  ctx: CanvasRenderingContext2D,
  format: PostFormat,
  content: PostContent,
  fonts: PostFonts,
) {
  const { width: W, height: H } = format;

  posterGround(ctx, W, H, {
    rayColour: 'rgba(255,210,63,0.09)',
    rayTop: -260,
    raySize: 2100,
    rayBlur: 3,
    bloomW: 760,
    bloomH: 640,
    bloomY: 0.44,
    bloomAlpha: 0.55,
    fadeHeight: 300,
    fadeAlpha: 0.75,
    dotBlur: 1.5,
    shapeBlur: 1.6,
    shapes: [
      { x: 44, y: 300, size: 74, fill: SUN, radius: 20, rot: -12, border: 7, shadow: 8 },
      { x: W - 38 - 60, y: 690, size: 60, fill: MINT, radius: 30, rot: 0, border: 7, shadow: 7 },
      { x: 66, y: H - 250 - 66, size: 66, fill: PUNCH, radius: 18, rot: 14, border: 7, shadow: 8 },
    ],
  });

  posterMarquee(ctx, W, 54, POST_KINDS.winner.marquee, 4, fonts);

  /* Which challenge this was, under the wordmark, in place of the address. */
  const challenge = content.title.trim()
    ? `CHALLENGE · ${content.title.trim().toUpperCase()}`
    : content.url;
  posterBrand(ctx, W, 164, challenge, fonts);

  const handle = normalizeInstagramHandle(content.handle);
  const headline = handle ? `@${handle.toUpperCase()}` : content.username.trim().toUpperCase();

  const room = W - 62 * 2;
  const headlineSize = fitLine(ctx, headline || 'THE WINNER', room, 106, 48, fonts, '-1px');
  ctx.letterSpacing = '0px';

  ctx.font = `900 29px ${fonts.body}`;
  const lines = content.callToAction.trim()
    ? wrapText(content.callToAction, 800, (s) => ctx.measureText(s).width).slice(0, 2)
    : [];

  const blockH = headlineSize * 0.9 + (lines.length ? 18 + lines.length * 38 : 0);
  const blockTop = H - 58 - blockH;

  /*
    The stage stops well short of the type: the winner's face hangs off its
    bottom edge by more than half its own height, and the design leaves 112px
    under the frame for it before the handle starts.
  */
  const avatar = 172;
  const stageTop = 290;
  const stageBottom = blockTop - 112;
  const size = Math.max(200, Math.min(700, stageBottom - stageTop, W - 74 * 2));
  const stageY = stageTop + (stageBottom - stageTop - size) / 2;
  const stageX = (W - size) / 2;

  ctx.save();
  ctx.translate(stageX + size / 2, stageY + size / 2);
  ctx.rotate((-1.6 * Math.PI) / 180);
  slab(ctx, -size / 2 - 14, -size / 2 - 14, size + 28, size + 28, 16, SUN, { shadow: 0, border: 7 });
  ctx.restore();

  ctx.fillStyle = INK;
  roundedRect(ctx, stageX, stageY + 16, size, size, 10);
  ctx.fill();
  ctx.fillStyle = POSTER_FRAME;
  roundedRect(ctx, stageX, stageY, size, size, 10);
  ctx.fill();

  if (content.image) {
    const source = content.image as { width?: number; height?: number };
    const crop = coverCrop(Number(source.width ?? size), Number(source.height ?? size), size, size);
    ctx.save();
    roundedRect(ctx, stageX, stageY, size, size, 10);
    ctx.clip();
    ctx.drawImage(content.image, crop.sx, crop.sy, crop.sw, crop.sh, stageX, stageY, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = HAZE;
    ctx.font = `900 28px ${fonts.body}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Drop the winning render', stageX + size / 2, stageY + size / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  roundedRect(ctx, stageX, stageY, size, size, 10);
  ctx.stroke();

  drawPlaceBadge(ctx, stageX + 24, stageY - 30, fonts);

  if (content.votes !== null && content.votes >= 0) {
    pill(ctx, `${content.votes} ${content.votes === 1 ? 'VOTE' : 'VOTES'}`, stageX + 26, stageY + size - 26 - 46, {
      fill: AQUA,
      ink: INK,
      fontSize: 24,
      tracking: 1.6,
      padX: 28,
      padY: 11,
      border: 6,
      shadow: 7,
      anchor: 'left',
      dot: true,
      fonts,
    });
  }

  pill(ctx, 'BLIND BALLOT', stageX + size - 26, stageY + size - 26 - 46, {
    fill: PUNCH,
    ink: INK,
    fontSize: 24,
    tracking: 1.6,
    padX: 28,
    padY: 11,
    border: 6,
    shadow: 7,
    anchor: 'right',
    fonts,
  });

  /* The face, straddling the bottom edge of the frame. */
  const avatarY = stageY + size + 86 - avatar / 2;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(W / 2, avatarY + 10, avatar / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = AQUA;
  ctx.beginPath();
  ctx.arc(W / 2, avatarY, avatar / 2, 0, Math.PI * 2);
  ctx.fill();

  if (content.avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, avatarY, avatar / 2 - 4, 0, Math.PI * 2);
    ctx.clip();
    const source = content.avatar as { width?: number; height?: number };
    const crop = coverCrop(Number(source.width ?? avatar), Number(source.height ?? avatar), avatar, avatar);
    ctx.drawImage(
      content.avatar,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      W / 2 - avatar / 2,
      avatarY - avatar / 2,
      avatar,
      avatar,
    );
    ctx.restore();
  }

  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(W / 2, avatarY, avatar / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${headlineSize}px ${fonts.display}`;
  ctx.letterSpacing = '-1px';
  strokedText(ctx, headline || 'THE WINNER', W / 2, blockTop + headlineSize * 0.82, SUN, 16, 12);
  ctx.letterSpacing = '0px';

  if (lines.length) {
    ctx.font = `900 29px ${fonts.body}`;
    ctx.fillStyle = CREAM;
    let y = blockTop + headlineSize * 0.9 + 18 + 26;
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += 38;
    }
  }

  ctx.textAlign = 'left';
}

/** The 1ST PLACE tab, tilted, with the ordinal raised. */
function drawPlaceBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fonts: PostFonts,
) {
  ctx.save();

  ctx.font = `700 44px ${fonts.display}`;
  const one = ctx.measureText('1').width;
  ctx.font = `700 26px ${fonts.display}`;
  const st = ctx.measureText('ST').width;
  ctx.font = `700 38px ${fonts.display}`;
  ctx.letterSpacing = '2px';
  const place = ctx.measureText('PLACE').width;
  ctx.letterSpacing = '0px';

  const w = 34 + one + st + 14 + place + 34;
  const h = 44 + 24;

  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((-6 * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);

  slab(ctx, 0, 0, w, h, h / 2, SUN, { shadow: 11, border: 7 });

  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.font = `700 44px ${fonts.display}`;
  ctx.fillText('1', 34, h / 2 + 1);

  // The ordinal rides high, the way it is set on the page.
  ctx.font = `700 26px ${fonts.display}`;
  ctx.fillText('ST', 34 + one, h / 2 - 9);

  ctx.font = `700 38px ${fonts.display}`;
  ctx.letterSpacing = '2px';
  ctx.fillText('PLACE', 34 + one + st + 14, h / 2 + 1);
  ctx.letterSpacing = '0px';

  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
