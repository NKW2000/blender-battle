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
 * The two shapes Instagram gives a feed post.
 *
 * Square is the safe default; 4:5 is the tallest a feed post may be and so
 * takes the most screen on a phone. Any other ratio is cropped on upload, so
 * offering more would be offering a worse version of one of these.
 */
export const POST_FORMATS = {
  square: { id: 'square', label: 'Square', ratio: '1:1', width: 1080, height: 1080 },
  portrait: { id: 'portrait', label: 'Portrait', ratio: '4:5', width: 1080, height: 1350 },
} as const;

export type PostFormatId = keyof typeof POST_FORMATS;
export type PostFormat = (typeof POST_FORMATS)[PostFormatId];

/* ---------------------------------------------------------------- tokens */

const INK = '#0e0b2b';
const DEEP = '#14103a';
const CREAM = '#fff6e9';
const SUN = '#ffd23f';
const FLAME_LIFT = '#ffe580';
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
  title: string;
  difficulty: Difficulty;
  blurb: string;
  url: string;
  image: CanvasImageSource | null;
}

export interface PostFonts {
  display: string;
  body: string;
}

/* ------------------------------------------------- background knock-out */

/**
 * Knocks the flat backdrop out of a reference so the subject floats.
 *
 * A Blender render almost always arrives on one flat colour, and a rectangle of
 * grey sitting on the arcade gradient is the single thing that makes a post look
 * pasted together. Removing it is what lets the object sit *in* the poster.
 *
 * The method is a flood fill seeded from the edges rather than a colour-distance
 * pass over the whole image, and that distinction matters: a global pass also
 * deletes every pixel of the subject that happens to match the backdrop, which
 * on a grey render is most of its shading. Filling inwards from the border only
 * removes background that is actually connected to the border.
 *
 * Pixels are matched against the average of the four corners, so a subtle
 * vignette or gradient backdrop still reads as one region.
 */
export function knockOutBackground(image: ImageData, tolerance = 32): ImageData {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data);

  // The reference colour: the mean of the four corners.
  const corners = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + width - 1) * 4,
  ];
  let br = 0;
  let bg = 0;
  let bb = 0;
  for (const c of corners) {
    br += data[c]!;
    bg += data[c + 1]!;
    bb += data[c + 2]!;
  }
  br /= 4;
  bg /= 4;
  bb /= 4;

  const matches = (i: number) =>
    Math.abs(data[i]! - br) <= tolerance &&
    Math.abs(data[i + 1]! - bg) <= tolerance &&
    Math.abs(data[i + 2]! - bb) <= tolerance;

  /*
    An explicit stack rather than recursion.

    A 1080x1080 region is over a million pixels; a recursive fill blows the call
    stack on any real photograph long before it finishes.
  */
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (matches(p * 4)) stack.push(p);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length > 0) {
    const p = stack.pop()!;
    out[p * 4 + 3] = 0;

    const x = p % width;
    const y = (p - x) / width;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  /*
    One softening pass over the new edge.

    A hard alpha cut leaves the backdrop's colour fringing every outline, which
    reads as a bad cut-out. Averaging alpha across the boundary costs one pass
    and is the difference between "floating" and "badly masked".
  */
  const feathered = new Uint8ClampedArray(out);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = (y * width + x) * 4 + 3;
      if (out[p] === 0) continue;

      const neighbours =
        out[p - 4]! + out[p + 4]! + out[p - width * 4]! + out[p + width * 4]!;
      if (neighbours < 4 * 255) {
        feathered[p] = Math.round((out[p]! + neighbours / 4) / 2);
      }
    }
  }

  return new ImageData(feathered, width, height);
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
 * Contain-fit: the destination rect so a whole image fits inside a box.
 *
 * Used once the backdrop is gone. A knocked-out subject must never be cropped —
 * cover-fitting it would cut the model in half, which is the opposite of the
 * floating look the transparency exists to produce.
 */
export function containBox(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
) {
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { width, height, offsetX: (boxWidth - width) / 2, offsetY: (boxHeight - height) / 2 };
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

/** The mark: a rounded square turned 45 degrees with a square punched out. */
function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);

  const half = size / 2;
  ctx.fillStyle = INK;
  roundedRect(ctx, -half, -half + size * 0.09, size, size, size * 0.24);
  ctx.fill();

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

/** A chunky tilted pill, the shape the product puts a difficulty in. */
function tiltedBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  angleDeg: number,
  fonts: PostFonts,
  fill: string,
  ink: string,
  fontSize: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angleDeg * Math.PI) / 180);

  ctx.font = `700 ${fontSize}px ${fonts.display}`;
  const w = ctx.measureText(text).width + fontSize * 1.9;
  const h = fontSize * 2.1;

  slab(ctx, -w / 2, -h / 2, w, h, h / 2, fill, { shadow: 10, border: 6 });

  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 1);
  ctx.restore();
}

/** The attract-mode strip that runs across the top of the poster. */
function marquee(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  W: number,
  fonts: PostFonts,
) {
  const h = 62;
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.rotate((-2.2 * Math.PI) / 180);

  ctx.fillStyle = INK;
  ctx.fillRect(-W * 0.62, -h / 2 + 8, W * 1.24, h);
  ctx.fillStyle = SUN;
  ctx.fillRect(-W * 0.62, -h / 2, W * 1.24, h);

  ctx.fillStyle = INK;
  ctx.font = `700 26px ${fonts.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  const piece = `  ${text}  ·`;
  ctx.fillText(piece.repeat(4), 0, 1);
  ctx.letterSpacing = '0px';
  ctx.restore();
}

/**
 * Renders the whole post.
 *
 * Composed as a poster rather than a card: the subject floats over the arcade
 * ground with a glow behind it, the type is set big and tight underneath, and
 * everything is anchored by the marquee at the top and the brand at the foot.
 */
export function drawPost(
  ctx: CanvasRenderingContext2D,
  format: PostFormat,
  content: PostContent,
  fonts: PostFonts,
) {
  const { width: W, height: H } = format;
  const pad = 76;

  ctx.clearRect(0, 0, W, H);

  // --- ground --------------------------------------------------------
  ctx.fillStyle = DEEP;
  ctx.fillRect(0, 0, W, H);

  const lamp = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, W * 0.85);
  lamp.addColorStop(0, 'rgba(64, 52, 176, 0.9)');
  lamp.addColorStop(0.55, 'rgba(34, 26, 99, 0.5)');
  lamp.addColorStop(1, 'rgba(20, 16, 58, 0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 26; y < H; y += 46) {
    for (let x = 26; x < W; x += 46) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Loose brand shapes, the same furniture that drifts behind the landing hero.
  const floats: [number, number, number, string, number][] = [
    [pad * 0.55, H * 0.30, 52, SUN, 14],
    [W - pad * 0.5, H * 0.26, 34, AQUA, 0],
    [pad * 0.7, H * 0.72, 40, MINT, -12],
    [W - pad * 0.62, H * 0.70, 28, PUNCH, 0],
  ];
  for (const [x, y, size, colour, rot] of floats) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    slab(ctx, -size / 2, -size / 2, size, size, colour === AQUA || colour === PUNCH ? size / 2 : size * 0.3, colour, {
      shadow: 7,
      border: 5,
    });
    ctx.restore();
  }

  // --- the marquee ----------------------------------------------------
  marquee(ctx, 'NEW CHALLENGE', pad + 4, W, fonts);

  // --- the subject, floating ------------------------------------------
  const stageTop = pad + 92;
  const stageHeight = format.id === 'portrait' ? H * 0.44 : H * 0.40;
  const stageWidth = W - pad * 2;
  const stageCx = W / 2;
  const stageCy = stageTop + stageHeight / 2;

  // A glow behind the subject: what makes a cut-out sit in the frame rather
  // than on top of it.
  const halo = ctx.createRadialGradient(stageCx, stageCy, 0, stageCx, stageCy, stageWidth * 0.6);
  halo.addColorStop(0, 'rgba(255, 210, 63, 0.30)');
  halo.addColorStop(0.45, 'rgba(255, 210, 63, 0.09)');
  halo.addColorStop(1, 'rgba(255, 210, 63, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, stageTop - 40, W, stageHeight + 120);

  if (content.image) {
    const sw = Number((content.image as { width?: number }).width ?? stageWidth);
    const sh = Number((content.image as { height?: number }).height ?? stageHeight);
    const box = containBox(sw, sh, stageWidth, stageHeight);

    // A soft contact shadow under the subject, so it stands on the ground.
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.filter = 'blur(26px)';
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(stageCx, stageTop + stageHeight - 6, box.width * 0.34, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.drawImage(
      content.image,
      pad + box.offsetX,
      stageTop + box.offsetY,
      box.width,
      box.height,
    );
  } else {
    ctx.strokeStyle = 'rgba(255,246,233,0.22)';
    ctx.lineWidth = 5;
    ctx.setLineDash([16, 14]);
    roundedRect(ctx, pad, stageTop, stageWidth, stageHeight, 34);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = HAZE;
    ctx.font = `800 32px ${fonts.body}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Drop the challenge reference here', stageCx, stageCy);
  }

  // The difficulty rides the subject's shoulder, tilted.
  const style = DIFFICULTY_STYLE[content.difficulty];
  tiltedBadge(ctx, style.label, W - pad - 30, stageTop + 34, -7, fonts, style.fill, style.ink, 34);

  // --- title ------------------------------------------------------------
  let cursor = stageTop + stageHeight + (format.id === 'portrait' ? 118 : 96);

  const titleSize = format.id === 'portrait' ? 104 : 90;
  ctx.font = `700 ${titleSize}px ${fonts.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const titleLines = wrapText(
    (content.title || 'Untitled challenge').toUpperCase(),
    W - pad * 1.4,
    (s) => ctx.measureText(s).width,
  ).slice(0, 2);

  for (const line of titleLines) {
    // Ink behind the type, offset — the product's shadow, not a blur.
    ctx.fillStyle = INK;
    ctx.fillText(line, W / 2 + 5, cursor + 7);
    ctx.fillStyle = CREAM;
    ctx.fillText(line, W / 2, cursor);
    cursor += titleSize * 1.0;
  }

  if (content.blurb.trim()) {
    ctx.font = `800 31px ${fonts.body}`;
    ctx.fillStyle = HAZE;
    cursor += 16;
    for (const line of wrapText(content.blurb, W - pad * 2, (s) => ctx.measureText(s).width).slice(0, 2)) {
      ctx.fillText(line, W / 2, cursor);
      cursor += 44;
    }
  }

  // --- foot -------------------------------------------------------------
  const footY = H - pad + 6;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.font = `700 40px ${fonts.display}`;
  const blender = ctx.measureText('BLENDER').width;
  const battle = ctx.measureText('BATTLE').width;
  const markSize = 56;
  const lockup = markSize + 22 + blender + battle;
  const startX = (W - lockup) / 2;

  drawMark(ctx, startX + markSize / 2, footY - 4, markSize);

  ctx.fillStyle = CREAM;
  ctx.fillText('BLENDER', startX + markSize + 22, footY - 4);
  ctx.fillStyle = SUN;
  ctx.fillText('BATTLE', startX + markSize + 22 + blender, footY - 4);

  ctx.font = `800 25px ${fonts.body}`;
  ctx.fillStyle = HAZE;
  ctx.textAlign = 'center';
  ctx.fillText(content.url, W / 2, footY + 42);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** Exported so the composer can tint the empty state the same way. */
export const POST_COLORS = { INK, DEEP, CREAM, SUN, FLAME_LIFT, AQUA, MINT, PUNCH };
