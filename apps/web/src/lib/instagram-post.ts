import { Difficulty } from '@bb/shared';

/**
 * Draws a finished Instagram post onto a canvas.
 *
 * Everything here runs in the browser and nothing is uploaded: the reference
 * image is read from the chosen file, composited locally, and handed back as a
 * PNG. That keeps a marketing tool from needing an endpoint, a bucket or a
 * migration, and it means an unpublished challenge's artwork never leaves the
 * machine of the person making the post.
 *
 * The layout is expressed in the same tokens the site uses — the 3px ink
 * outline, the hard offset shadow, the rounded panel — because a post that does
 * not look like the product is worth less than no post.
 */

/* --------------------------------------------------------------- formats */

/**
 * The two shapes Instagram actually gives a feed post.
 *
 * Square is the safe default; 4:5 is the tallest a feed post may be and so
 * occupies the most screen on a phone, which is why it is offered at all. Any
 * other ratio is cropped by Instagram, so there is nothing to gain from
 * exposing more.
 */
export const POST_FORMATS = {
  square: { id: 'square', label: 'Square', ratio: '1:1', width: 1080, height: 1080 },
  portrait: { id: 'portrait', label: 'Portrait', ratio: '4:5', width: 1080, height: 1350 },
} as const;

export type PostFormatId = keyof typeof POST_FORMATS;
export type PostFormat = (typeof POST_FORMATS)[PostFormatId];

/* ---------------------------------------------------------------- tokens */

/** The site's palette, by the names `globals.css` gives them. */
const INK = '#0e0b2b';
const DEEP = '#14103a';
const CREAM = '#fff6e9';
const SUN = '#ffd23f';
const MINT = '#5ef2a8';
const PUNCH = '#ff3d9a';
const HAZE = 'rgba(255, 246, 233, 0.62)';

/** Difficulty keeps the colour it has everywhere else in the product. */
export const DIFFICULTY_STYLE: Record<Difficulty, { label: string; fill: string; ink: string }> = {
  [Difficulty.EASY]: { label: 'EASY', fill: MINT, ink: INK },
  [Difficulty.MEDIUM]: { label: 'MEDIUM', fill: SUN, ink: INK },
  [Difficulty.HARD]: { label: 'HARD', fill: PUNCH, ink: CREAM },
};

export interface PostContent {
  title: string;
  difficulty: Difficulty;
  /** Optional one-liner under the title. Empty is fine and often better. */
  blurb: string;
  /** The address printed in the footer. */
  url: string;
  /** The reference artwork. Null renders the frame as an empty plate. */
  image: CanvasImageSource | null;
}

export interface PostFonts {
  /** Resolved family for display type — read off a live element, not guessed. */
  display: string;
  body: string;
}

/* ----------------------------------------------------------- pure helpers */

/**
 * Cover-fit: the source rectangle to draw so an image fills a box without
 * distorting.
 *
 * Instagram crops nothing here — this does, deliberately and centred, because a
 * reference photo arrives in whatever shape the artist had and the frame is a
 * fixed square. Letterboxing inside a bordered panel would read as a mistake.
 */
export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const boxRatio = boxWidth / boxHeight;

  if (sourceRatio > boxRatio) {
    // Wider than the box: trim the sides.
    const width = sourceHeight * boxRatio;
    return { sx: (sourceWidth - width) / 2, sy: 0, sw: width, sh: sourceHeight };
  }

  // Taller than the box: trim top and bottom.
  const height = sourceWidth / boxRatio;
  return { sx: 0, sy: (sourceHeight - height) / 2, sw: sourceWidth, sh: height };
}

/**
 * Breaks a line to fit a width, using a caller-supplied measurer.
 *
 * The measurer is injected rather than taken from a canvas so the wrapping can
 * be tested without one — jsdom has no 2D context, and text wrapping is exactly
 * the part of this file most likely to be wrong.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = words[0]!;

  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  lines.push(line);
  return lines;
}

/** A filename that sorts and reads sensibly in a downloads folder. */
export function postFileName(title: string, format: PostFormatId) {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'challenge';

  return `blenderbattle-${slug}-${POST_FORMATS[format].ratio.replace(':', 'x')}.png`;
}

/* --------------------------------------------------------------- drawing */

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/**
 * A panel in the site's language: hard offset shadow, then fill, then outline.
 *
 * Drawn in that order on purpose. The shadow is a solid shape rather than a
 * blur because that is what the product does — `0 8px 0 var(--color-ink)` — and
 * a soft shadow here would read as a different design system.
 */
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  { shadow = 14, border = 6 }: { shadow?: number; border?: number } = {},
) {
  if (shadow > 0) {
    ctx.fillStyle = INK;
    roundedRect(ctx, x, y + shadow, width, height, radius);
    ctx.fill();
  }

  ctx.fillStyle = fill;
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fill();

  if (border > 0) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = border;
    roundedRect(ctx, x, y, width, height, radius);
    ctx.stroke();
  }
}

/** The mark: a rounded square turned 45 degrees with a square punched out. */
function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);

  const half = size / 2;
  ctx.fillStyle = SUN;
  roundedRect(ctx, -half, -half, size, size, size * 0.24);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = size * 0.1;
  roundedRect(ctx, -half, -half, size, size, size * 0.24);
  ctx.stroke();

  const inner = size * 0.32;
  ctx.fillStyle = INK;
  roundedRect(ctx, -inner / 2, -inner / 2, inner, inner, inner * 0.16);
  ctx.fill();

  ctx.restore();
}

/** A pill badge — the same shape the product puts a difficulty in. */
function badge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fonts: PostFonts,
  fill: string,
  ink: string,
) {
  const fontSize = 30;
  ctx.font = `700 ${fontSize}px ${fonts.display}`;
  const padX = 30;
  const width = ctx.measureText(text).width + padX * 2;
  const height = 60;

  panel(ctx, x, y, width, height, height / 2, fill, { shadow: 8, border: 5 });

  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + width / 2, y + height / 2 + 1);

  return width;
}

/**
 * Renders the whole post.
 *
 * Laid out top-down against the format's height so the square and the 4:5 are
 * the same design with more or less air, rather than two layouts that will
 * disagree the first time one is edited.
 */
export function drawPost(
  ctx: CanvasRenderingContext2D,
  format: PostFormat,
  content: PostContent,
  fonts: PostFonts,
) {
  const { width: W, height: H } = format;
  const pad = 72;

  ctx.clearRect(0, 0, W, H);

  // --- ground --------------------------------------------------------
  ctx.fillStyle = DEEP;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, H * 0.12, 0, W / 2, H * 0.12, W * 0.95);
  glow.addColorStop(0, 'rgba(58, 47, 158, 0.85)');
  glow.addColorStop(0.5, 'rgba(34, 26, 99, 0.55)');
  glow.addColorStop(1, 'rgba(20, 16, 58, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // The site's dot field, at the same 46px rhythm.
  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  for (let y = 24; y < H; y += 46) {
    for (let x = 24; x < W; x += 46) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- header --------------------------------------------------------
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = SUN;
  ctx.font = `700 26px ${fonts.display}`;
  ctx.letterSpacing = '4px';
  ctx.fillText('CHALLENGE', pad, pad + 26);
  ctx.letterSpacing = '0px';

  // --- the reference, in a panel -------------------------------------
  const frameSize = W - pad * 2;
  const frameTop = pad + 62;
  const framePad = 16;

  panel(ctx, pad, frameTop, frameSize, frameSize, 40, 'rgba(255,255,255,0.05)');

  const innerX = pad + framePad;
  const innerY = frameTop + framePad;
  const innerSize = frameSize - framePad * 2;

  ctx.save();
  roundedRect(ctx, innerX, innerY, innerSize, innerSize, 26);
  ctx.clip();

  if (content.image) {
    const sw = 'width' in content.image ? Number(content.image.width) : innerSize;
    const sh = 'height' in content.image ? Number(content.image.height) : innerSize;
    const crop = coverCrop(sw, sh, innerSize, innerSize);
    ctx.drawImage(content.image, crop.sx, crop.sy, crop.sw, crop.sh, innerX, innerY, innerSize, innerSize);
  } else {
    // An empty plate still has to look composed — this is what the operator
    // sees before choosing a file.
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(innerX, innerY, innerSize, innerSize);
    ctx.fillStyle = HAZE;
    ctx.font = `800 30px ${fonts.body}`;
    ctx.textAlign = 'center';
    ctx.fillText('Add the challenge reference', innerX + innerSize / 2, innerY + innerSize / 2);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // The difficulty sits on the artwork's corner, as it does on a challenge card.
  const style = DIFFICULTY_STYLE[content.difficulty];
  badge(ctx, style.label, innerX + 26, innerY + 26, fonts, style.fill, style.ink);

  // --- title ----------------------------------------------------------
  let cursor = frameTop + frameSize + 74;

  const titleSize = format.id === 'portrait' ? 82 : 72;
  ctx.font = `700 ${titleSize}px ${fonts.display}`;
  ctx.fillStyle = CREAM;

  const titleLines = wrapText(
    content.title || 'Untitled challenge',
    W - pad * 2,
    (s) => ctx.measureText(s).width,
  ).slice(0, 2);

  for (const line of titleLines) {
    ctx.fillText(line, pad, cursor);
    cursor += titleSize * 1.06;
  }

  // --- blurb ----------------------------------------------------------
  if (content.blurb.trim()) {
    ctx.font = `800 32px ${fonts.body}`;
    ctx.fillStyle = HAZE;
    cursor += 12;

    const blurbLines = wrapText(content.blurb, W - pad * 2, (s) => ctx.measureText(s).width).slice(0, 2);
    for (const line of blurbLines) {
      ctx.fillText(line, pad, cursor);
      cursor += 44;
    }
  }

  // --- footer, pinned to the bottom edge -------------------------------
  const footY = H - pad - 30;

  drawMark(ctx, pad + 30, footY - 6, 58);

  ctx.font = `700 38px ${fonts.display}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = CREAM;
  const brandX = pad + 82;
  ctx.fillText('BLENDER', brandX, footY - 6);
  const blenderWidth = ctx.measureText('BLENDER').width;
  ctx.fillStyle = SUN;
  ctx.fillText('BATTLE', brandX + blenderWidth, footY - 6);

  ctx.font = `800 28px ${fonts.body}`;
  ctx.fillStyle = HAZE;
  ctx.textAlign = 'right';
  ctx.fillText(content.url, W - pad, footY - 6);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
