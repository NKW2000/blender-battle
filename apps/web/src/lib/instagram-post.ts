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
  challenge: { id: 'challenge', label: 'New challenge', marquee: 'NEW CHALLENGE' },
  winner: { id: 'winner', label: 'Winner', marquee: 'WINNER' },
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
  const footTop = frameHeight - pad - 46;

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
export function postFileName(title: string, format: PostFormatId, kind: PostKind = 'challenge') {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'challenge';

  // The announcement and the result for one challenge share a title, so without
  // the kind in the name the second download lands as "(1)" beside the first.
  const prefix = kind === 'winner' ? 'blenderbattle-winner' : 'blenderbattle';

  return `${prefix}-${slug}-${POST_FORMATS[format].ratio.replace(':', 'x')}.png`;
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
 * Composed as a poster: the reference is framed in the product's own slab —
 * ink outline, hard offset shadow — the type is set big and tight underneath,
 * and everything is anchored by the marquee at the top and the brand at the
 * foot. A winner post is the same poster with a different headline, so the
 * announcement and the result read as one product in a feed.
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
  marquee(ctx, POST_KINDS[content.kind].marquee, pad + 4, W, fonts);

  /* --- the type, measured before the frame is sized ---------------------

     Measuring first is what keeps the two apart. The frame used to be a fixed
     fraction of the height and the type took what was left, with a floor under
     the gap above it — so a post whose type nearly filled the remaining room
     had that floor override the centring and push the last line straight
     through the brand lockup. The frame is now sized around the type instead.
  */
  /*
    The winner post sets its title smaller.

    On an announcement the brief is the headline. On a result it is context —
    the person who won is the headline, and they are set below. Left at
    announcement scale the title crowded the credit out and squeezed the winning
    render into a letterbox on the square.
  */
  const isWinner = content.kind === 'winner';
  const titleSize = format.id === 'portrait' ? (isWinner ? 76 : 104) : isWinner ? 64 : 90;
  ctx.font = `700 ${titleSize}px ${fonts.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  /*
    The title's measure, as a fraction of the frame rather than a padding
    multiple — the two formats are the same width, so a shared inset gave the
    square, whose type is smaller, a much longer line. It ran to within a few
    pixels of the edge and pushed a single orphaned word onto line two. A
    narrower measure breaks it into two balanced lines instead.
  */
  const titleLines = wrapText(
    (content.title || 'Untitled challenge').toUpperCase(),
    W * (format.id === 'portrait' ? 0.9 : 0.8),
    (s) => ctx.measureText(s).width,
  ).slice(0, 2);

  /*
    The blurb is measured before anything is drawn, because the whole type block
    is centred in whatever room the subject leaves. A one-line title under a
    short subject and a two-line title under a tall one both want to sit in the
    middle of that space; anchoring to a fixed offset only ever suits one of them.
  */
  ctx.font = `800 31px ${fonts.body}`;
  const blurbLines = content.blurb.trim()
    ? wrapText(content.blurb, W - pad * 1.3, (s) => ctx.measureText(s).width).slice(0, 2)
    : [];

  /*
    The gap above the blurb, measured to its baseline.

    It was 16, which is less than the type's own cap height — so the blurb's
    first line actually started *above* the cursor. Nothing sat there until the
    winner credit did, and then the two printed through each other.
  */
  const blurbGap = 44;

  /*
    The winner's credit.

    It is the reason a winner post exists, so it is set in the sun accent at
    nearly title scale rather than tucked into the blurb — big enough that the
    person being credited can see their own name from the feed. A challenge post
    has no credit and skips the line entirely.
  */
  const handle = isWinner ? normalizeInstagramHandle(content.handle) : '';
  const name = isWinner ? content.username.trim() : '';
  const creditSize = Math.round(titleSize * 0.52);
  const creditGap = 30;

  /*
    The credit is a lockup, not a line: the winner's avatar beside their name on
    the site with their Instagram handle under it. Its height is whichever of
    the portrait and the two lines of type is taller, so the layout above can
    size the frame around it.
  */
  const avatarSize = Math.round(creditSize * 1.75);
  const handleSize = Math.round(creditSize * 0.66);
  const creditLines = (name ? 1 : 0) + (handle ? 1 : 0);
  const creditTextHeight = creditLines === 2 ? creditSize + handleSize + 10 : creditSize;
  const creditHeight =
    creditLines === 0 ? 0 : Math.max(content.avatar ? avatarSize : 0, creditTextHeight);

  /*
    The block's height expressed as the same advances the drawing below makes,
    including the drop from the block's top to the first baseline and the line
    advance after the last one. Counting only the lines understated it by about
    a third of a line, which is exactly the margin by which the last line ended
    up printed through the brand lockup.
  */
  const blockHeight =
    titleSize * 0.78 +
    titleLines.length * titleSize +
    (creditHeight ? creditGap + creditHeight : 0) +
    (blurbLines.length ? blurbGap + blurbLines.length * 44 : 0);




  // --- the reference, framed -------------------------------------------
  const stageTop = pad + 92;
  const stageWidth = W - pad * 2;

  const { stageHeight, blockTop } = layoutPost({
    frameHeight: H,
    pad,
    stageTop,
    idealStageHeight: format.id === 'portrait' ? H * 0.44 : H * 0.4,
    minStageHeight: H * 0.26,
    blockHeight,
  });
  const stageCx = W / 2;
  const stageCy = stageTop + stageHeight / 2;
  const stageRadius = 34;

  /*
    The frame is the product's slab, not a plain rectangle: ink shadow beneath,
    the image clipped to the rounded corners, then the outline drawn over the
    top so the image cannot creep past it.
  */
  /*
    How wide the frame is allowed to be for its height.

    Every image the product accepts is square, and cover-cropping a square into
    a wide letterbox throws away the top and bottom of someone's work. When the
    type leaves little height — a winner post carries a credit the announcement
    does not — the frame narrows and stays centred instead of widening into a
    slot the render cannot survive.
  */
  const frameWidth = Math.min(stageWidth, stageHeight * 1.6);
  const frameLeft = (W - frameWidth) / 2;

  if (content.image) {
    const sw = Number((content.image as { width?: number }).width ?? frameWidth);
    const sh = Number((content.image as { height?: number }).height ?? stageHeight);
    const crop = coverCrop(sw, sh, frameWidth, stageHeight);

    ctx.fillStyle = INK;
    roundedRect(ctx, frameLeft, stageTop + 14, frameWidth, stageHeight, stageRadius);
    ctx.fill();

    ctx.save();
    roundedRect(ctx, frameLeft, stageTop, frameWidth, stageHeight, stageRadius);
    ctx.clip();
    ctx.drawImage(
      content.image,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      frameLeft,
      stageTop,
      frameWidth,
      stageHeight,
    );
    ctx.restore();

    ctx.strokeStyle = INK;
    ctx.lineWidth = 7;
    roundedRect(ctx, frameLeft, stageTop, frameWidth, stageHeight, stageRadius);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(255,246,233,0.22)';
    ctx.lineWidth = 5;
    ctx.setLineDash([16, 14]);
    roundedRect(ctx, frameLeft, stageTop, frameWidth, stageHeight, stageRadius);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = HAZE;
    ctx.font = `800 32px ${fonts.body}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      content.kind === 'winner' ? 'Drop the winning render here' : 'Drop the challenge reference here',
      stageCx,
      stageCy,
    );
  }

  // The difficulty rides the frame's shoulder, tilted.
  const style = DIFFICULTY_STYLE[content.difficulty];
  tiltedBadge(
    ctx,
    style.label,
    frameLeft + frameWidth - 30,
    stageTop + 34,
    -7,
    fonts,
    style.fill,
    style.ink,
    34,
  );

  /*
    The tally rides the opposite corner.

    On the frame rather than in the type block below, so the number costs the
    headline no room and the two badges read as a scoreboard around the work —
    which is what they are.
  */
  if (isWinner && content.votes !== null && content.votes >= 0) {
    const label = `${content.votes} ${content.votes === 1 ? 'VOTE' : 'VOTES'}`;
    tiltedBadge(ctx, label, frameLeft + 34, stageTop + stageHeight - 20, 5, fonts, SUN, INK, 32);
  }

  // --- title ------------------------------------------------------------
  // `cursor` is a baseline, so drop it off the block's top by the cap height.
  let cursor = blockTop + titleSize * 0.78;

  ctx.font = `700 ${titleSize}px ${fonts.display}`;

  for (const line of titleLines) {
    // Ink behind the type, offset — the product's shadow, not a blur.
    ctx.fillStyle = INK;
    ctx.fillText(line, W / 2 + 5, cursor + 7);
    ctx.fillStyle = CREAM;
    ctx.fillText(line, W / 2, cursor);
    cursor += titleSize * 1.0;
  }

  if (creditHeight) {
    cursor += creditGap;

    // Widest of the two lines decides how far the block sits from centre.
    ctx.font = `700 ${creditSize}px ${fonts.display}`;
    const nameWidth = name ? ctx.measureText(name).width : 0;
    ctx.font = `800 ${handleSize}px ${fonts.body}`;
    const handleWidth = handle ? ctx.measureText(`@${handle}`).width : 0;
    const textWidth = Math.max(nameWidth, handleWidth);

    const portrait = content.avatar ? avatarSize : 0;
    const spacing = portrait ? 24 : 0;
    const left = (W - (portrait + spacing + textWidth)) / 2;
    const middle = cursor + creditHeight / 2 - creditSize * 0.1;

    if (content.avatar) {
      const cx = left + avatarSize / 2;

      // The product's hard shadow, then the portrait clipped to a circle, then
      // the ink ring over the top so the crop cannot show a hard edge.
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

    if (name && handle) {
      ctx.font = `700 ${creditSize}px ${fonts.display}`;
      ctx.fillStyle = CREAM;
      ctx.fillText(name, textLeft, middle + creditSize * 0.1);

      ctx.font = `800 ${handleSize}px ${fonts.body}`;
      ctx.fillStyle = SUN;
      ctx.fillText(`@${handle}`, textLeft, middle + creditSize * 0.1 + handleSize + 10);
    } else {
      // One line only — centred on the portrait rather than sitting high.
      const single = name || `@${handle}`;
      ctx.font = name ? `700 ${creditSize}px ${fonts.display}` : `800 ${handleSize}px ${fonts.body}`;
      ctx.fillStyle = name ? CREAM : SUN;
      ctx.fillText(single, textLeft, middle + creditSize * 0.35);
    }

    ctx.textAlign = 'center';
    cursor += creditHeight;
  }

  if (blurbLines.length) {
    ctx.font = `800 31px ${fonts.body}`;
    ctx.fillStyle = HAZE;
    cursor += blurbGap;
    for (const line of blurbLines) {
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
