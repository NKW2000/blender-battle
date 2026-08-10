/**
 * Single source of truth for cross-boundary vocabulary.
 *
 * The backend validates with class-validator (@IsEnum) and the frontend validates
 * with Zod (z.nativeEnum) — but both import the SAME enum from here. Validation is
 * not duplicated; only the vocabulary is shared, so the two sides cannot drift.
 */

export enum Role {
  PLAYER = 'player',
  MANAGER = 'manager',
  ADMIN = 'admin',
}

/**
 * Role privilege ordering. Used by RolesGuard so that `@Roles(Role.MANAGER)` also
 * admits ADMIN without every decorator having to list admin explicitly.
 */
export const ROLE_RANK: Record<Role, number> = {
  [Role.PLAYER]: 0,
  [Role.MANAGER]: 1,
  [Role.ADMIN]: 2,
};

export enum UserStatus {
  ACTIVE = 'active',
  /** Manager/player temporarily blocked; reversible, has an expiry. */
  SUSPENDED = 'suspended',
  /** Permanent block by an admin. */
  BANNED = 'banned',
  /** Soft-deleted account; restorable by an admin. */
  DELETED = 'deleted',
}

export enum ExperienceLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  PROFESSIONAL = 'professional',
}

/**
 * Machine-readable error codes returned in the response envelope. The frontend
 * switches on these, never on human-readable `message` text.
 */
export enum ApiErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_REUSED = 'TOKEN_REUSED',
  ACCOUNT_BANNED = 'ACCOUNT_BANNED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Three fixed tiers. Deliberately an enum rather than a table: difficulty gates
 * matchmaking and XP awards, so the set is closed by design — a lookup table
 * would add a join to every challenge read and invite a fourth tier that no
 * scoring rule knows how to handle.
 */
export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

/** Base XP per difficulty. Managers may override per challenge within bounds. */
export const DIFFICULTY_BASE_XP: Record<Difficulty, number> = {
  [Difficulty.EASY]: 50,
  [Difficulty.MEDIUM]: 120,
  [Difficulty.HARD]: 250,
};

export enum ChallengeStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum ChallengeVisibility {
  /** Listed in browse and eligible for the random draw. */
  PUBLIC = 'public',
  /** Reachable by direct link, never drawn at random or listed. */
  UNLISTED = 'unlisted',
  /** Author and admins only. */
  PRIVATE = 'private',
}

export enum ChallengeAssetType {
  REFERENCE_IMAGE = 'reference_image',
  REFERENCE_FILE = 'reference_file',
}

/**
 * The outcome recorded against a room participant.
 *
 * Named `BattleResult` because that is the Postgres enum type's name and the
 * column has data in it; renaming would be a migration that buys nothing.
 *
 * `DRAW` remains a legal value and is never produced. A room is ranked by
 * likes and every tie escalates to a runoff, which itself falls back to the
 * earliest submission — a rule chosen precisely so that a result always
 * separates. `users.draws` therefore stays at zero, and the
 * `chk_users_battles_consistent` constraint still needs the column.
 */
export enum BattleResult {
  WIN = 'win',
  LOSS = 'loss',
  DRAW = 'draw',
}

/**
 * Who can find a room.
 *
 * Discovery only. Whether a room's result counts is decided by how many people
 * actually submitted (`ROOM_RANKED_MIN_SUBMISSIONS`), not by who could see it —
 * a private room of four artists who each did the work is a real contest, and a
 * listed one of two is not. Every room has a join code either way.
 */
export enum RoomVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export enum RoomStatus {
  /** Open for players to join. The challenge has not been drawn yet. */
  LOBBY = 'lobby',
  /** Host has started it; the brief is being revealed to everyone at once. */
  DRAWING = 'drawing',
  /** Modelling window open. Players upload before it closes. */
  ACTIVE = 'active',
  /** Work locked. Non-submitters have been eliminated; the ballot is open. */
  VOTING = 'voting',
  /** Voting tied at the top; the tied entries go to a single-pick runoff. */
  RUNOFF = 'runoff',
  COMPLETED = 'completed',
  /** Ended without a result — too few submissions, or the host abandoned it. */
  CANCELLED = 'cancelled',
}

export enum RoomParticipantStatus {
  /** In the room, has not uploaded yet. */
  ENTERED = 'entered',
  /** Uploaded before the deadline and is on the ballot. */
  SUBMITTED = 'submitted',
  /** Deadline passed with no upload. Cannot win, and cannot be voted on. */
  ELIMINATED = 'eliminated',
  /** Left the room before it started. */
  LEFT = 'left',
}

/**
 * What a notification is about. The type drives the icon and the link, so the
 * client never parses the message text to decide where to send someone.
 *
 * The previous set named a matchmaking feature (`battle_matched`) and an
 * achievements system (`achievement_unlocked`) that were never built — and
 * since nothing had ever called `NotificationsService.create`, the bell was
 * permanently empty while its empty state promised "unlocks".
 */
export enum NotificationType {
  /** The host pressed Start; the brief is being revealed. */
  ROOM_STARTED = 'room_started',
  /** The modelling deadline passed and the ballot is open. */
  ROOM_VOTING_OPEN = 'room_voting_open',
  /** A room you competed in has a result. */
  ROOM_RESULT = 'room_result',
  /** A public challenge you entered has moved to voting. */
  EVENT_VOTING_OPEN = 'event_voting_open',
  /** A public challenge you entered has a winner. */
  EVENT_RESULT = 'event_result',
  ROLE_CHANGED = 'role_changed',
  ACCOUNT_STATUS = 'account_status',
  CHALLENGE_PUBLISHED = 'challenge_published',
}

/** Third-party identity providers. */
export enum OAuthProvider {
  DISCORD = 'discord',
  GOOGLE = 'google',
}

/** Audit trail actions. Append new members; never renumber or reuse. */
export enum ActivityAction {
  USER_REGISTERED = 'user.registered',
  USER_LOGGED_IN = 'user.logged_in',
  USER_LOGGED_OUT = 'user.logged_out',
  USER_PROFILE_UPDATED = 'user.profile_updated',
  USER_AVATAR_UPDATED = 'user.avatar_updated',
  USER_PASSWORD_CHANGED = 'user.password_changed',
  ADMIN_ROLE_CHANGED = 'admin.role_changed',
  ADMIN_STATUS_CHANGED = 'admin.status_changed',
  SECURITY_TOKEN_REUSE_DETECTED = 'security.token_reuse_detected',
  SECURITY_PASSWORD_RESET_REQUESTED = 'security.password_reset_requested',
  SECURITY_PASSWORD_RESET_COMPLETED = 'security.password_reset_completed',
  SECURITY_LOGIN_FAILED = 'security.login_failed',
  CHALLENGE_CREATED = 'challenge.created',
  CHALLENGE_UPDATED = 'challenge.updated',
  CHALLENGE_PUBLISHED = 'challenge.published',
  CHALLENGE_ARCHIVED = 'challenge.archived',
  CHALLENGE_DELETED = 'challenge.deleted',
  CHALLENGE_DRAWN = 'challenge.drawn',
  CATEGORY_CREATED = 'category.created',
  CATEGORY_UPDATED = 'category.updated',
  BATTLE_STARTED = 'battle.started',
  BATTLE_COMPLETED = 'battle.completed',
  BATTLE_CANCELLED = 'battle.cancelled',
  SECURITY_VOTE_REJECTED = 'security.vote_rejected',
  ACHIEVEMENT_UNLOCKED = 'achievement.unlocked',
  OAUTH_LINKED = 'oauth.linked',
  OAUTH_SIGNUP = 'oauth.signup',
}
