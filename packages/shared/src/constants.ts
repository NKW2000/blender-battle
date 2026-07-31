/** Shared limits. The backend enforces these; the frontend mirrors them for UX only. */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
/** Lowercase/uppercase letters, digits, underscore, hyphen. No leading/trailing separator. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]{1,22}[a-zA-Z0-9])?$/;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const BIO_MAX_LENGTH = 500;

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

// --- Submissions -------------------------------------------------------------

/**
 * The render is what voting actually shows, so it is the required artefact.
 * Without an image there is nothing to put on a ballot.
 */
export const SUBMISSION_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const SUBMISSION_IMAGE_ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Interchange formats only — deliberately not `.blend`.
 *
 * A packed .blend routinely runs into the hundreds of megabytes, which would
 * exhaust free object storage in a few dozen battles and cannot be previewed by
 * anything but Blender. FBX/OBJ/glTF are an order of magnitude smaller and are
 * readable by every DCC and by the browser, which leaves the door open to an
 * in-page viewer later.
 */
export const SUBMISSION_MODEL_MAX_BYTES = 50 * 1024 * 1024;
export const SUBMISSION_MODEL_EXTENSIONS = ['.fbx', '.obj', '.glb', '.gltf'] as const;
/** Browsers are inconsistent here: most send octet-stream for these formats. */
export const SUBMISSION_MODEL_ALLOWED_MIME = [
  'application/octet-stream',
  'model/gltf-binary',
  'model/gltf+json',
  'model/obj',
  'application/x-tgif',
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

// --- Battle timing -----------------------------------------------------------
// Every one of these is enforced server-side. The client is told the resulting
// absolute deadlines and never computes a phase change from these numbers.

/** How long a player waits for an opponent before being returned to the lobby. */
export const QUEUE_TIMEOUT_SECONDS = 60;
/**
 * How long the match reel spends coasting to a stop on the drawn brief, before
 * the arena opens.
 *
 * The server has to know this number. A matched battle is created straight into
 * the countdown, and the no-show sweep cancels a countdown nobody has joined —
 * so if the countdown were budgeted without the reveal, both players would still
 * be watching the reel when their battle was cancelled underneath them. Shared
 * so the animation and the deadline cannot drift apart.
 */
export const MATCH_REVEAL_SECONDS = 7;

/**
 * Pre-battle countdown, so both players see the brief before the clock starts.
 *
 * Short because the brief was already revealed on the reel during
 * `MATCH_REVEAL_SECONDS` — this is the 3-2-1, not a reading window. Note that it
 * also sets the no-show margin: the sweep cancels an unjoined battle at
 * `startsAt`, so a player has reveal + countdown to get their arena page mounted
 * and its socket joined.
 */
export const BATTLE_COUNTDOWN_SECONDS = 3;
/** Grace window after the timer ends, for votes already in flight. */
export const VOTING_WINDOW_SECONDS = 15;

/** Bounds on battle length, independent of the challenge's estimated time. */
export const BATTLE_MIN_DURATION_SECONDS = 5 * 60;
export const BATTLE_MAX_DURATION_SECONDS = 60 * 60;

// --- Scoring -----------------------------------------------------------------
/** Winner takes the challenge's full reward; the rest is a share of it. */
export const XP_SHARE_LOSS = 0.25;
export const XP_SHARE_DRAW = 0.5;
/** Leaderboard score movement per result. */
export const SCORE_WIN = 25;
export const SCORE_LOSS = -10;
export const SCORE_DRAW = 5;

// --- Socket abuse limits -----------------------------------------------------
/** Reactions per user per battle per window. Votes are capped at one by the DB. */
export const REACTION_LIMIT_PER_WINDOW = 10;
export const REACTION_WINDOW_SECONDS = 10;

/**
 * Redis key for the leaderboard sorted set. Shared because two services write to
 * it — scoring after a battle, and the leaderboard service on rebuild — and a
 * typo in either would silently produce a second, invisible leaderboard.
 */
export const LEADERBOARD_KEY = 'leaderboard:score';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const API_PREFIX = 'api/v1';
