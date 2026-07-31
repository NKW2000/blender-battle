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
 * Battle phases. The server is the only authority on which phase a battle is in;
 * clients render whatever they are told and never advance the phase themselves.
 */
export enum BattleStatus {
  /**
   * Matched, waiting for both players to accept. Nothing is at stake yet — a
   * battle that times out here is cancelled and nobody is scored.
   */
  READY_CHECK = 'ready_check',
  /** Both accepted; the brief is revealed and the pre-battle countdown runs. */
  COUNTDOWN = 'countdown',
  /** Modelling window open. */
  ACTIVE = 'active',
  /** Work stopped, spectators voting. */
  VOTING = 'voting',
  COMPLETED = 'completed',
  /** Ended before it started — opponent never confirmed. No XP either way. */
  CANCELLED = 'cancelled',
}

/**
 * Two sides, not two players. A duel puts one player on each side; Phase 5 team
 * battles put several on each, without the battle row or the vote tally
 * changing shape.
 */
export enum BattleSide {
  A = 'a',
  B = 'b',
}

export enum BattleResult {
  WIN = 'win',
  LOSS = 'loss',
  DRAW = 'draw',
}

/**
 * Who can find and join a room.
 *
 * Visibility is not only a discovery setting — it decides whether the room can
 * award anything. A private room is a closed group of the host's choosing, which
 * is exactly the arrangement needed to trade likes back and forth, so private
 * rooms are always casual.
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

export enum ReactionType {
  FIRE = 'fire',
  CLAP = 'clap',
  MIND_BLOWN = 'mind_blown',
  LAUGH = 'laugh',
}

/**
 * Socket event names, shared so a typo cannot silently desynchronise the two
 * sides. Prefixed by direction: `client:*` is sent by the browser, `battle:*`
 * and `queue:*` are broadcast by the server.
 */
export const SOCKET_EVENTS = {
  // client → server
  JOIN_BATTLE: 'client:join_battle',
  LEAVE_BATTLE: 'client:leave_battle',
  CAST_VOTE: 'client:cast_vote',
  SEND_REACTION: 'client:send_reaction',

  // server → client
  BATTLE_STATE: 'battle:state',
  BATTLE_PHASE_CHANGED: 'battle:phase_changed',
  BATTLE_TALLY: 'battle:tally',
  BATTLE_REACTION: 'battle:reaction',
  BATTLE_COMPLETED: 'battle:completed',
  SPECTATOR_COUNT: 'battle:spectators',

  QUEUE_MATCHED: 'queue:matched',
  QUEUE_TIMEOUT: 'queue:timeout',

  /** Pushed to the recipient's personal room the moment one is created. */
  NOTIFICATION_NEW: 'notification:new',

  ERROR: 'error',
} as const;

/**
 * What a notification is about. The type drives the icon and the link, so the
 * client never parses the message text to decide where to send someone.
 */
export enum NotificationType {
  BATTLE_MATCHED = 'battle_matched',
  BATTLE_RESULT = 'battle_result',
  ACHIEVEMENT_UNLOCKED = 'achievement_unlocked',
  ROLE_CHANGED = 'role_changed',
  ACCOUNT_STATUS = 'account_status',
  CHALLENGE_PUBLISHED = 'challenge_published',
}

/**
 * How an achievement is earned. Every criterion is a threshold on a statistic
 * the platform already maintains, which is what lets unlocks be evaluated with
 * one cheap comparison after a battle rather than a bespoke query per badge.
 */
export enum AchievementStat {
  WINS = 'wins',
  BATTLES = 'total_battles',
  CURRENT_STREAK = 'current_streak',
  HIGHEST_STREAK = 'highest_streak',
  TOTAL_XP = 'total_xp',
  VOTES_RECEIVED = 'total_votes_received',
  SCORE = 'score',
}

/** Rarity drives presentation only — it has no effect on how a badge is earned. */
export enum AchievementTier {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
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
