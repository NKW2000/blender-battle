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
  /**
   * The challenge's own photo, shown as a thumbnail on the tease slide.
   *
   * Separate from `image`, which on a winner post is the winning render. The
   * two are different pictures doing different jobs: one says which challenge
   * this was, the other is the answer being withheld until slide two.
   */
  reference: CanvasImageSource | null;
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

/**
 * Places the frame and the type block down the poster.
 *
 * Pulled out of the drawing and given tests because it has been wrong twice in
 * the same way: the frame took a fixed share of the height, the type took what
 * was left, and when the type did not fit, the last line was printed through
 * the brand lockup at the foot. The invariant this exists to hold is that the
 * block never extends past `footTop`, whatever it contains.
 *
 * The frame is sized around the type rather than the other way round — an image
 * shrinking by thirty pixels is invisible, a headline colliding with the logo is
 * the only thing anyone will see.
 */
export function layoutPost({
  frameHeight,
  pad,
  stageTop,
  idealStageHeight,
  minStageHeight,
  blockHeight,
  minGap = 40,
}: {
  frameHeight: number;
  pad: number;
  stageTop: number;
  idealStageHeight: number;
  minStageHeight: number;
  blockHeight: number;
  minGap?: number;
}) {
  // Where the brand lockup begins, with a little air above it.
  const footTop = frameHeight - pad - 58;

  // The frame's hard shadow sits 14px below it and counts as part of its height.
  const shadow = 14;

  const stageHeight = Math.max(
    minStageHeight,
    Math.min(idealStageHeight, footTop - stageTop - shadow - blockHeight - minGap),
  );

  const subjectBottom = stageTop + stageHeight + shadow;

  /*
    Centred in the room the frame leaves, but never past the footer: the gap
    wants to be at least `minGap` and takes less only when honouring it would
    push the last line into the lockup.

    The final clamp covers the case the drawing cannot currently reach but the
    arithmetic can — a block taller than the room left once the frame is already
    at its floor. Overlapping the bottom of the reference by a few pixels is a
    blemish; printing the headline through the logo is a ruined post, so the
    footer wins. It is floored at `stageTop` so the block can never climb above
    the frame entirely.
  */
  const slack = footTop - subjectBottom - blockHeight;
  const preferred = subjectBottom + Math.min(Math.max(minGap, slack / 2), Math.max(0, slack));
  const blockTop = Math.max(stageTop, Math.min(preferred, footTop - blockHeight));

  return { footTop, stageHeight, subjectBottom, blockTop };
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
  referenceUrl?: string | null;
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
  put('reference', params.referenceUrl);

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

/* --------------------------------------------------------- shared furniture */

/** The arcade ground: deep field, lamp, dot grid, drifting brand shapes. */
function drawGround(ctx: CanvasRenderingContext2D, W: number, H: number, pad: number) {
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

  /*
    The brand shapes drifting past, with a trail behind each.

    They were four flat stickers pinned to the corners, which read as decoration
    on the surface of the poster. Each now carries a smear along the direction it
    is travelling — copies falling away in opacity and gaining blur — and sits at
    a depth: the near ones are large and sharp against a short trail, the far
    ones small, soft and streaked further. Between the two the field reads as
    something the poster is moving through rather than a pattern printed on it.
  */
  const particles: {
    x: number;
    y: number;
    size: number;
    colour: string;
    rot: number;
    drift: [number, number];
    depth: number;
  }[] = [
    { x: pad * 0.55, y: H * 0.3, size: 58, colour: SUN, rot: 14, drift: [-26, 34], depth: 1 },
    { x: W - pad * 0.5, y: H * 0.26, size: 30, colour: AQUA, rot: 0, drift: [22, -30], depth: 0.35 },
    { x: pad * 0.72, y: H * 0.72, size: 34, colour: MINT, rot: -12, drift: [-18, 26], depth: 0.45 },
    { x: W - pad * 0.62, y: H * 0.7, size: 26, colour: PUNCH, rot: 0, drift: [20, 24], depth: 0.3 },
    // Two more, far back, so the depth reads as a field rather than a pair.
    { x: W * 0.22, y: H * 0.14, size: 20, colour: PUNCH, rot: 0, drift: [14, -22], depth: 0.16 },
    { x: W * 0.82, y: H * 0.88, size: 24, colour: SUN, rot: -8, drift: [16, 20], depth: 0.2 },
  ];

  const shape = (x: number, y: number, size: number, colour: string, rot: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    slab(
      ctx,
      -size / 2,
      -size / 2,
      size,
      size,
      colour === AQUA || colour === PUNCH ? size / 2 : size * 0.3,
      colour,
      // The trail carries no outline: an ink border smeared six times reads as
      // a stack of stickers rather than one shape in motion.
      { shadow: 0, border: 0 },
    );
    ctx.restore();
  };

  const TRAIL = 6;

  for (const p of particles) {
    const [dx, dy] = p.drift;
    // Far things are smaller and their smear is longer, which is what selling
    // the distance actually depends on.
    const size = p.size * (0.6 + 0.4 * p.depth);
    const reach = 1.9 - p.depth;

    ctx.save();
    for (let step = TRAIL; step >= 1; step -= 1) {
      const t = step / TRAIL;
      ctx.globalAlpha = 0.22 * (1 - t) + 0.03;
      ctx.filter = `blur(${3 + t * 13}px)`;
      shape(p.x - dx * t * reach, p.y - dy * t * reach, size * (1 - t * 0.12), p.colour, p.rot);
    }
    ctx.restore();

    // The head, sharp only when it is near enough to be.
    ctx.save();
    ctx.filter = p.depth > 0.7 ? 'none' : `blur(${(1 - p.depth) * 2.4}px)`;
    ctx.globalAlpha = 0.35 + 0.65 * p.depth;
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rot * Math.PI) / 180);
    slab(
      ctx,
      -size / 2,
      -size / 2,
      size,
      size,
      p.colour === AQUA || p.colour === PUNCH ? size / 2 : size * 0.3,
      p.colour,
      { shadow: p.depth > 0.7 ? 7 : 0, border: p.depth > 0.7 ? 5 : 0 },
    );
    ctx.restore();
  }
}

/** The mark, the wordmark and the address, centred at the foot of every slide. */
function drawFoot(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pad: number,
  url: string,
  fonts: PostFonts,
) {
  const footY = H - pad + 6;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 40px ${fonts.display}`;

  const blender = ctx.measureText('BLENDER').width;
  const battle = ctx.measureText('BATTLE').width;
  const markSize = 56;
  const startX = (W - (markSize + 22 + blender + battle)) / 2;

  drawMark(ctx, startX + markSize / 2, footY - 4, markSize);

  ctx.fillStyle = CREAM;
  ctx.fillText('BLENDER', startX + markSize + 22, footY - 4);
  ctx.fillStyle = SUN;
  ctx.fillText('BATTLE', startX + markSize + 22 + blender, footY - 4);

  ctx.font = `800 25px ${fonts.body}`;
  ctx.fillStyle = HAZE;
  ctx.textAlign = 'center';
  ctx.fillText(url, W / 2, footY + 42);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * The work, framed square.
 *
 * Square because every image the product accepts is 1024x1024 — the upload
 * refuses anything else — so any other shape has to crop somebody's render. A
 * frame that letterboxes a square throws away the top and the bottom of the
 * very thing the post exists to show.
 */
function drawSquareFrame(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource | null,
  cx: number,
  top: number,
  size: number,
  emptyLabel: string,
  fonts: PostFonts,
) {
  const left = cx - size / 2;
  const radius = Math.max(20, size * 0.055);

  if (!image) {
    ctx.strokeStyle = 'rgba(255,246,233,0.22)';
    ctx.lineWidth = 5;
    ctx.setLineDash([16, 14]);
    roundedRect(ctx, left, top, size, size, radius);
    ctx.stroke();
    ctx.setLineDash([]);

    if (emptyLabel) {
      ctx.fillStyle = HAZE;
      ctx.font = `800 30px ${fonts.body}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emptyLabel, cx, top + size / 2);
      ctx.textBaseline = 'alphabetic';
    }
    return;
  }

  const source = image as { width?: number; height?: number };
  // Still a cover crop, because a source that is not square — a pasted photo, a
  // legacy asset — must fill the frame rather than letterbox inside it.
  const crop = coverCrop(Number(source.width ?? size), Number(source.height ?? size), size, size);

  ctx.fillStyle = INK;
  roundedRect(ctx, left, top + 14, size, size, radius);
  ctx.fill();

  ctx.save();
  roundedRect(ctx, left, top, size, size, radius);
  ctx.clip();
  ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, left, top, size, size);
  ctx.restore();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  roundedRect(ctx, left, top, size, size, radius);
  ctx.stroke();
}

/** The winner's portrait, name and handle, as one centred lockup. */
function drawCredit(
  ctx: CanvasRenderingContext2D,
  W: number,
  top: number,
  content: PostContent,
  fonts: PostFonts,
  nameSize: number,
) {
  const handle = normalizeInstagramHandle(content.handle);
  const name = content.username.trim();
  if (!name && !handle) return;

  const handleSize = Math.round(nameSize * 0.68);
  const avatarSize = Math.round(nameSize * 1.9);
  const lines = (name ? 1 : 0) + (handle ? 1 : 0);
  const textHeight = lines === 2 ? nameSize + handleSize + 12 : nameSize;
  const height = Math.max(content.avatar ? avatarSize : 0, textHeight);

  ctx.font = `700 ${nameSize}px ${fonts.display}`;
  const nameWidth = name ? ctx.measureText(name).width : 0;
  ctx.font = `800 ${handleSize}px ${fonts.body}`;
  const handleWidth = handle ? ctx.measureText(`@${handle}`).width : 0;
  const textWidth = Math.max(nameWidth, handleWidth);

  const portrait = content.avatar ? avatarSize : 0;
  const spacing = portrait ? 26 : 0;
  const left = (W - (portrait + spacing + textWidth)) / 2;
  const middle = top + height / 2;

  if (content.avatar) {
    const cx = left + avatarSize / 2;

    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(cx, middle + 7, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, middle, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();

    const source = content.avatar as { width?: number; height?: number };
    const crop = coverCrop(
      Number(source.width ?? avatarSize),
      Number(source.height ?? avatarSize),
      avatarSize,
      avatarSize,
    );
    ctx.drawImage(
      content.avatar,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      cx - avatarSize / 2,
      middle - avatarSize / 2,
      avatarSize,
      avatarSize,
    );
    ctx.restore();

    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, middle, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  const textLeft = left + portrait + spacing;
  ctx.textAlign = 'left';

  if (lines === 2) {
    ctx.font = `700 ${nameSize}px ${fonts.display}`;
    ctx.fillStyle = CREAM;
    ctx.fillText(name, textLeft, middle - 4);

    ctx.font = `800 ${handleSize}px ${fonts.body}`;
    ctx.fillStyle = SUN;
    ctx.fillText(`@${handle}`, textLeft, middle - 4 + handleSize + 12);
  } else {
    const single = name || `@${handle}`;
    ctx.font = name ? `700 ${nameSize}px ${fonts.display}` : `800 ${handleSize}px ${fonts.body}`;
    ctx.fillStyle = name ? CREAM : SUN;
    ctx.fillText(single, textLeft, middle + nameSize * 0.34);
  }

  ctx.textAlign = 'center';
}

/**
 * The swipe cue: a chunky arrow slab with a word beside it.
 *
 * The first slide deliberately does not answer its own question, so it has to
 * say plainly that there is a second one. Instagram draws its own small chevron
 * and a reader moving through a feed does not look for it.
 */
function drawSwipeCue(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  fonts: PostFonts,
  scale = 1,
) {
  const label = 'SWIPE';
  const fontSize = Math.round(34 * scale);
  const box = Math.round(96 * scale);

  ctx.font = `700 ${fontSize}px ${fonts.display}`;
  const labelWidth = ctx.measureText(label).width;
  const gap = Math.round(22 * scale);
  const left = cx - (labelWidth + gap + box) / 2;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.fillText(label, left + 3, cy + 5);
  ctx.fillStyle = CREAM;
  ctx.fillText(label, left, cy);

  const boxLeft = left + labelWidth + gap;
  slab(ctx, boxLeft, cy - box / 2, box, box, box * 0.3, SUN, { shadow: 10, border: 6 });

  /*
    The chevron is drawn, not typed.

    An arrow glyph is among the first things a fallback face gets wrong or drops
    entirely, and the one element whose whole job is to say "there is more this
    way" must not depend on which font actually loaded.
  */
  const arm = box * 0.22;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(7, box * 0.1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(boxLeft + box / 2 - arm * 0.5, cy - arm);
  ctx.lineTo(boxLeft + box / 2 + arm * 0.6, cy);
  ctx.lineTo(boxLeft + box / 2 - arm * 0.5, cy + arm);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
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
  const pad = 76;

  ctx.clearRect(0, 0, W, H);
  drawGround(ctx, W, H, pad);
  marquee(ctx, POST_KINDS[content.kind].marquee, pad + 4, W, fonts);

  if (content.kind === 'winner') {
    if (slide === 0) drawWinnerTease(ctx, format, content, fonts, pad);
    else drawWinnerReveal(ctx, format, content, fonts, pad);
    drawFoot(ctx, W, H, pad, content.url, fonts);
    return;
  }

  /*
    The announcement keeps the marquee and carries its brand directly under it
    rather than at the foot. Both at the head is what leaves the reference the
    rest of the poster; the strip is what says at a glance which of the two
    kinds of post this is, and losing it cost more than the space it takes.
  */
  drawChallengeSlide(ctx, format, content, fonts, pad);
}

/**
 * The announcement: the brand at the top, the reference below it, the title
 * under that.
 *
 * The brand moved from the foot to the head, which is what let the reference
 * grow. It had a marquee strip above it and a lockup beneath it, so the picture
 * — the only thing on the poster anybody actually stops for — was squeezed
 * between two bands of furniture and came out about half the width it could
 * have been. One band, at the top, and the picture takes everything left.
 */
function drawChallengeSlide(
  ctx: CanvasRenderingContext2D,
  format: PostFormat,
  content: PostContent,
  fonts: PostFonts,
  pad: number,
) {
  const { width: W, height: H } = format;
  const isPortrait = format.id === 'portrait';

  // Clear of the marquee, which is 62 tall on a -2.2 degree tilt with a hard
  // shadow under it.
  const brandBottom = drawBrand(ctx, W, pad + 74, content.url, fonts);

  const titleSize = isPortrait ? 96 : 78;
  ctx.font = `700 ${titleSize}px ${fonts.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const titleLines = wrapText(
    (content.title || 'Untitled challenge').toUpperCase(),
    W * (isPortrait ? 0.9 : 0.86),
    (s) => ctx.measureText(s).width,
  ).slice(0, 2);

  /*
    The picture takes whatever the brand and the title leave.

    Square, because every image the product accepts is 1024x1024 and any other
    shape has to crop someone's work, and capped at the column width so it stays
    square rather than stretching once there is more height than room.
  */
  const titleGap = isPortrait ? 46 : 38;
  const titleBlock = titleGap + titleSize * 0.78 + titleLines.length * titleSize;
  const stageTop = brandBottom + (isPortrait ? 34 : 26);
  const frame = Math.min(W - pad * 2, H - stageTop - titleBlock - pad);

  drawSquareFrame(ctx, content.image, W / 2, stageTop, frame, 'Drop the reference here', fonts);

  const style = DIFFICULTY_STYLE[content.difficulty];
  tiltedBadge(
    ctx,
    style.label,
    W / 2 + frame / 2 - 26,
    stageTop + 30,
    -7,
    fonts,
    style.fill,
    style.ink,
    32,
  );

  let cursor = stageTop + frame + titleGap + titleSize * 0.78;
  ctx.font = `700 ${titleSize}px ${fonts.display}`;
  ctx.textAlign = 'center';

  for (const line of titleLines) {
    // Ink behind the type, offset — the product's shadow, not a blur.
    ctx.fillStyle = INK;
    ctx.fillText(line, W / 2 + 5, cursor + 7);
    // The sun, not the cream: the title is the loudest thing on the poster and
    // the accent the whole product is built around.
    ctx.fillStyle = SUN;
    ctx.fillText(line, W / 2, cursor);
    cursor += titleSize;
  }
}

/**
 * The mark, the wordmark and the address, across the head of the poster.
 *
 * Returns the y it finished at, so whatever comes next can start from where the
 * brand actually ended rather than from a number that has to be kept in step
 * with it by hand.
 */
function drawBrand(
  ctx: CanvasRenderingContext2D,
  W: number,
  top: number,
  url: string,
  fonts: PostFonts,
): number {
  const markSize = 46;
  const y = top + markSize / 2;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 34px ${fonts.display}`;

  const blender = ctx.measureText('BLENDER').width;
  const battle = ctx.measureText('BATTLE').width;
  const startX = (W - (markSize + 20 + blender + battle)) / 2;

  drawMark(ctx, startX + markSize / 2, y, markSize);

  ctx.fillStyle = CREAM;
  ctx.fillText('BLENDER', startX + markSize + 20, y);
  ctx.fillStyle = SUN;
  ctx.fillText('BATTLE', startX + markSize + 20 + blender, y);

  ctx.font = `800 22px ${fonts.body}`;
  ctx.fillStyle = HAZE;
  ctx.textAlign = 'center';
  ctx.fillText(url, W / 2, y + markSize / 2 + 19);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  return y + markSize / 2 + 30;
}

/**
 * Slide one: the question.
 *
 * No render, no name, no handle. Everything is deliberately withheld — the
 * slide exists to be swiped past, and showing the winner on it would remove the
 * only reason to swipe.
 */
function drawWinnerTease(
  ctx: CanvasRenderingContext2D,
  format: PostFormat,
  content: PostContent,
  fonts: PostFonts,
  pad: number,
) {
  const { width: W, height: H } = format;
  const isPortrait = format.id === 'portrait';

  const leadSize = isPortrait ? 56 : 48;
  const nameSize = isPortrait ? 108 : 92;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `700 ${nameSize}px ${fonts.display}`;
  const nameLines = wrapText(
    (content.title || 'this challenge').toUpperCase(),
    W * 0.84,
    (s) => ctx.measureText(s).width,
  ).slice(0, 3);

  const cueHeight = isPortrait ? 150 : 132;
  const textHeight =
    leadSize + leadSize * 0.5 + nameLines.length * nameSize * 0.92 + leadSize * 1.5 + cueHeight;

  const top = pad + 150;
  const bottom = H - pad - 58;
  const room = bottom - top;

  /*
    The challenge's photo, sized from what the sentence leaves.

    It is a thumbnail rather than a hero: the slide's job is to name the
    challenge and point right, and a large picture here competes with the
    winning render on the slide after it. Capped, floored, and dropped entirely
    when a long title leaves no room for it — the sentence is the slide.
  */
  const thumbGap = isPortrait ? 44 : 36;
  const maxThumb = isPortrait ? 340 : 250;
  const spare = room - textHeight - thumbGap - 40;
  const thumb = content.reference && spare >= 150 ? Math.min(maxThumb, spare) : 0;

  const blockHeight = (thumb ? thumb + thumbGap : 0) + textHeight;
  let cursor = top + Math.max(20, (room - blockHeight) / 2);

  if (thumb) {
    drawSquareFrame(ctx, content.reference, W / 2, cursor, thumb, '', fonts);
    cursor += thumb + thumbGap;
  }

  cursor += leadSize;
  ctx.font = `800 ${leadSize}px ${fonts.body}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = HAZE;
  ctx.fillText('THE WINNER OF', W / 2, cursor);
  cursor += leadSize * 0.5;

  ctx.font = `700 ${nameSize}px ${fonts.display}`;
  for (const line of nameLines) {
    cursor += nameSize * 0.92;
    ctx.fillStyle = INK;
    ctx.fillText(line, W / 2 + 5, cursor + 7);
    ctx.fillStyle = SUN;
    ctx.fillText(line, W / 2, cursor);
  }

  cursor += leadSize * 1.5;
  ctx.font = `800 ${leadSize}px ${fonts.body}`;
  ctx.fillStyle = HAZE;
  ctx.fillText('IS…', W / 2, cursor);

  drawSwipeCue(ctx, W / 2, cursor + cueHeight * 0.62, fonts, isPortrait ? 1 : 0.9);
}

/** Slide two: the answer — their render, their face, their handle. */
function drawWinnerReveal(
  ctx: CanvasRenderingContext2D,
  format: PostFormat,
  content: PostContent,
  fonts: PostFonts,
  pad: number,
) {
  const { width: W, height: H } = format;
  const isPortrait = format.id === 'portrait';

  const nameSize = isPortrait ? 60 : 52;
  const ctaSize = isPortrait ? 34 : 30;
  const creditGap = 44;
  const ctaGap = 40;

  const handle = normalizeInstagramHandle(content.handle);
  const name = content.username.trim();
  const creditHeight =
    name || handle
      ? Math.max(
          content.avatar ? Math.round(nameSize * 1.9) : 0,
          name && handle ? nameSize + Math.round(nameSize * 0.68) + 12 : nameSize,
        )
      : 0;

  // No handle, no invitation to follow one.
  const cta = handle ? content.callToAction.trim().toUpperCase() : '';
  const blockHeight = (creditHeight ? creditGap + creditHeight : 0) + (cta ? ctaGap + ctaSize : 0);

  const stageTop = pad + 92;
  const { stageHeight, blockTop } = layoutPost({
    frameHeight: H,
    pad,
    stageTop,
    // Larger than the announcement's: this slide carries no title, and the
    // render is the reason anyone swiped to it.
    idealStageHeight: isPortrait ? H * 0.6 : H * 0.54,
    minStageHeight: H * 0.28,
    blockHeight,
  });

  const frame = Math.min(W - pad * 2, stageHeight);
  drawSquareFrame(ctx, content.image, W / 2, stageTop, frame, 'Drop the winning render here', fonts);

  if (content.votes !== null && content.votes >= 0) {
    const label = `${content.votes} ${content.votes === 1 ? 'VOTE' : 'VOTES'}`;
    tiltedBadge(
      ctx,
      label,
      W / 2 - frame / 2 + 30,
      stageTop + frame - 18,
      5,
      fonts,
      SUN,
      INK,
      30,
    );
  }

  let cursor = blockTop;

  if (creditHeight) {
    cursor += creditGap;
    drawCredit(ctx, W, cursor, content, fonts, nameSize);
    cursor += creditHeight;
  }

  if (cta) {
    cursor += ctaGap + ctaSize * 0.78;
    ctx.font = `800 ${ctaSize}px ${fonts.body}`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '2px';
    ctx.fillStyle = INK;
    ctx.fillText(cta, W / 2 + 3, cursor + 4);
    ctx.fillStyle = CREAM;
    ctx.fillText(cta, W / 2, cursor);
    ctx.letterSpacing = '0px';
  }
}

export const POST_COLORS = { INK, DEEP, CREAM, SUN, FLAME_LIFT, AQUA, MINT, PUNCH };
