/** Shared limits. The backend enforces these; the frontend mirrors them for UX only. */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
/** Lowercase/uppercase letters, digits, underscore, hyphen. No leading/trailing separator. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]{1,22}[a-zA-Z0-9])?$/;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const BIO_MAX_LENGTH = 500;

/** How many works an artist may pin to their profile showcase. The viewer loads
 *  each as a real mesh, so the cap bounds how many models one page downloads. */
export const SHOWCASE_MAX_ITEMS = 10;

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const CHALLENGE_TITLE_MAX_LENGTH = 120;
export const CHALLENGE_DESCRIPTION_MAX_LENGTH = 4000;
export const CHALLENGE_MAX_OBJECTIVES = 10;
export const CHALLENGE_MAX_TAGS = 8;
export const CHALLENGE_MAX_ASSETS = 12;
export const CHALLENGE_MIN_MINUTES = 5;
export const CHALLENGE_MAX_MINUTES = 480;
/** Bounds on a manager-set XP reward, so one challenge cannot mint a rank. */
export const CHALLENGE_MIN_XP = 10;
export const CHALLENGE_MAX_XP = 1000;

export const CHALLENGE_ASSET_MAX_BYTES = 15 * 1024 * 1024;
export const CHALLENGE_IMAGE_ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
/** .blend files arrive as octet-stream; zip covers packed asset bundles. */
export const CHALLENGE_FILE_ALLOWED_MIME = [
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
] as const;

// --- Rooms -------------------------------------------------------------------

export const ROOM_NAME_MIN_LENGTH = 3;
export const ROOM_NAME_MAX_LENGTH = 60;
/** Join code for private rooms. Unambiguous alphabet — no O/0, I/1. */
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const ROOM_MIN_PLAYERS = 2;
export const ROOM_MAX_PLAYERS = 16;
/**
 * Submissions required before a room can award XP or touch the leaderboard.
 *
 * Below this a room is scored as casual. Two or three people can agree to trade
 * likes; the floor is what stops a private group from minting rank, and it is
 * checked on submissions rather than joins so padding a room with idle accounts
 * does not clear it.
 */
export const ROOM_RANKED_MIN_SUBMISSIONS = 4;

/** How long the drawn brief is revealed on the reel before the clock starts. */
export const ROOM_DRAW_SECONDS = 7;

/**
 * The disciplines actually offered.
 *
 * Fourteen were seeded up front on the assumption the platform would fill them.
 * It has not, and an empty filter is worse than no filter: someone picks
 * "Texturing", gets nothing back, and reasonably concludes the site is broken
 * rather than that the category has no briefs in it yet.
 *
 * Enforced in code rather than only by deleting rows, because the two are not
 * the same promise. A migration fixes the database it is run against; this
 * decides what the application offers, on every deployment, the moment it
 * starts. The migration still exists and still tidies the table — it is just no
 * longer what the behaviour depends on.
 *
 * Adding a discipline back is this array plus a row. Difficulty is untouched:
 * that one genuinely varies per challenge and is the axis people choose along.
 */
export const ACTIVE_CATEGORY_SLUGS = ['modeling'] as const;

// --- Submissions -------------------------------------------------------------

/**
 * The upload ceiling for a submission image.
 *
 * 2MB, down from 10MB. At the fixed 1024x1024 these are, 2MB is generous for
 * anything Blender writes with PNG compression on — a lossless 1024 square of a
 * rendered scene lands well inside it. What blew past 10MB was compression left
 * at 0%, which stores the image essentially raw and produces a file many times
 * larger for pixels that are bit-for-bit identical.
 *
 * So the limit is also the advice: if an entry is refused, the fix is Output
 * Properties, Compression to 100% — not a smaller or worse render. Every place
 * that rejects on size says so, because "file too large" on its own sends
 * people to re-render at lower quality, which is the wrong repair.
 */
export const SUBMISSION_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** The one-line repair for an oversized entry, shown wherever size is refused. */
export const SUBMISSION_SIZE_HINT =
  'Set Compression to 100% in Blender under Output Properties — it is lossless for PNG and usually cuts the file by most of its size.';

/**
 * Exact pixel dimensions every entry image must have — the final render and the
 * workspace shot both. Square and fixed so the vote wheel and the profile
 * gallery lay out identically for every entry, with no letterboxing.
 */
export const SUBMISSION_IMAGE_SIZE = 1024;
export const SUBMISSION_IMAGE_ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const SUBMISSION_NOTES_MAX_LENGTH = 500;

// --- Voting ------------------------------------------------------------------

/**
 * Seconds a voter gets on each entry before the ballot advances on its own.
 *
 * Enforced server-side. A client-held timer could be paused to study a rival's
 * work or scripted to auto-like, and the whole point of the limit is that every
 * entry gets the same amount of attention.
 */
export const VOTE_SECONDS_PER_ENTRY = 10;
/** Grace added server-side, covering render and network latency on each step. */
export const VOTE_STEP_GRACE_SECONDS = 3;
/** A voter who never opens the ballot is not counted as having abstained. */
export const VOTE_WINDOW_SECONDS = 5 * 60;

// --- Scoring -----------------------------------------------------------------

/**
 * How a ranked result moves a player's standing.
 *
 * Separate from XP, which only ever rises and measures how much someone has
 * done. A standing has to be able to fall, or the leaderboard ranks whoever has
 * entered the most rooms rather than whoever wins them — and could be climbed
 * by losing.
 *
 * Asymmetric on purpose: a win is worth more than a loss costs, so competing
 * has positive expected value and nobody is discouraged from entering a room
 * they might not win. The floor at zero is applied at the write site.
 */
export const SCORE_WIN = 25;
export const SCORE_LOSS = -10;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const API_PREFIX = 'api/v1';
