import type {
  BattleResult,
  BattleSide,
  BattleStatus,
  AchievementTier,
  ChallengeAssetType,
  ChallengeStatus,
  ChallengeVisibility,
  Difficulty,
  ExperienceLevel,
  NotificationType,
  OAuthProvider,
  Role,
  UserStatus,
} from './enums.js';

/** Fields any visitor may see. Never contains email, status, or auth material. */
export interface PublicUserProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  country: string | null;
  socialLinks: SocialLinks;
  experienceLevel: ExperienceLevel;
  totalXp: number;
  score: number;
  rank: number | null;
  wins: number;
  losses: number;
  draws: number;
  totalBattles: number;
  winRate: number;
  currentStreak: number;
  highestStreak: number;
  totalVotesReceived: number;
  joinedAt: string;
}

/**
 * One finished piece of work on an artist's public portfolio.
 *
 * Only ever drawn from challenges that have fully resolved. An entry still in
 * its submission or voting window must never appear here: the ballot is blind,
 * and a portfolio that named the author of a live entry would be a way to
 * unmask it from the outside.
 */
export interface PortfolioItem {
  id: string;
  challengeTitle: string;
  challengeSlug: string;
  imageUrl: string;
  /** Absent when the artist uploaded only a render. */
  modelUrl: string | null;
  modelFilename: string | null;
  voteCount: number;
  isWinner: boolean;
  submittedAt: string;
}

/** Public profile plus the private fields the owner is entitled to. */
export interface SelfUserProfile extends PublicUserProfile {
  email: string;
  role: Role;
  status: UserStatus;
  updatedAt: string;
}

/** Admin list view: identity + moderation state, no battle statistics. */
export interface AdminUserListItem {
  id: string;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
  avatarUrl: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface SocialLinks {
  website?: string;
  twitter?: string;
  artstation?: string;
  youtube?: string;
  instagram?: string;
  discord?: string;
}

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  challengeCount?: number;
}

export interface TagSummary {
  id: string;
  slug: string;
  name: string;
}

export interface ChallengeAsset {
  id: string;
  type: ChallengeAssetType;
  url: string;
  filename: string;
  bytes: number;
  sortOrder: number;
}

/** Card-sized projection for browse grids and lists. */
export interface ChallengeSummary {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  category: CategorySummary;
  tags: TagSummary[];
  estimatedMinutes: number;
  rewardXp: number;
  status: ChallengeStatus;
  visibility: ChallengeVisibility;
  coverImageUrl: string | null;
  /** Truncated to a card-friendly length server-side; the full text lives on the detail. */
  shortDescription: string;
  createdAt: string;
  publishedAt: string | null;
}

/** Full detail, including everything needed to actually attempt the challenge. */
export interface ChallengeDetail extends ChallengeSummary {
  description: string;
  rules: string | null;
  objectives: string[];
  allowedAssets: string | null;
  forbiddenAssets: string | null;
  blenderVersion: string | null;
  assets: ChallengeAsset[];
  author: { id: string; username: string; avatarUrl: string | null };
  updatedAt: string;
}

export interface BattleParticipant {
  userId: string;
  username: string;
  avatarUrl: string | null;
  side: BattleSide;
  result: BattleResult | null;
  xpAwarded: number;
  /** Whether this competitor has accepted the match. */
  isReady: boolean;
}

export interface BattleSummary {
  id: string;
  status: BattleStatus;
  challenge: ChallengeSummary;
  participants: BattleParticipant[];
  votesA: number;
  votesB: number;
  winnerSide: BattleSide | null;
  durationSeconds: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/**
 * The authoritative snapshot a client receives on join or reconnect.
 *
 * Deadlines are absolute ISO instants plus `serverNow`, never a remaining-seconds
 * countdown: a client that reconnects mid-battle must be able to compute the true
 * remaining time itself, and a client whose clock is wrong must still agree with
 * the server about when the phase ends.
 */
export interface BattleStateSnapshot extends BattleSummary {
  /** Server time at the moment the snapshot was built. */
  serverNow: string;
  /** When the current phase ends. Null once the battle is over. */
  phaseEndsAt: string | null;
  votingEndsAt: string | null;
  spectatorCount: number;
  /** The side this viewer already voted for, if any. */
  myVote: BattleSide | null;
  /** True when the viewer is competing rather than spectating. */
  isParticipant: boolean;
}

export interface QueueTicket {
  /** Position is advisory — matching is first-come, not a strict queue. */
  position: number;
  waitingSince: string;
  expiresAt: string;
  categoryId: string | null;
  difficulty: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  score: number;
  totalXp: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  currentStreak: number;
}

/**
 * Admin overview. Every field here is read from a periodically refreshed
 * snapshot, not aggregated on request — `generatedAt` tells the reader how old
 * the numbers are rather than implying they are live.
 */
export interface AdminMetrics {
  generatedAt: string;
  users: {
    total: number;
    byRole: { player: number; manager: number; admin: number };
    banned: number;
    suspended: number;
    online: number;
    newLast7Days: number;
  };
  challenges: {
    total: number;
    published: number;
    draft: number;
    archived: number;
  };
  battles: {
    total: number;
    completed: number;
    live: number;
    last24h: number;
  };
  engagement: {
    totalVotes: number;
    totalReactions: number;
    dau: number;
    wau: number;
    mau: number;
  };
  mostPlayedChallenge: { id: string; title: string; timesPlayed: number } | null;
  trendingCategories: Array<{ id: string; name: string; battles: number }>;
  topPlayers: Array<{ userId: string; username: string; score: number; wins: number }>;
  /** Battles completed per day, oldest first. Drives the growth chart. */
  battlesPerDay: Array<{ date: string; battles: number }>;
  signupsPerDay: Array<{ date: string; signups: number }>;
}

/** A manager's own authoring statistics. */
export interface ManagerMetrics {
  generatedAt: string;
  challenges: { total: number; published: number; draft: number; archived: number };
  totalPlays: number;
  mostPlayed: Array<{ id: string; title: string; slug: string; timesPlayed: number }>;
  byCategory: Array<{ name: string; challenges: number }>;
}

export interface ActivityLogEntry {
  id: string;
  action: string;
  actor: { id: string; username: string } | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** In-app path to open. Never an external URL. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AchievementDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  tier: AchievementTier;
  xpReward: number;
  /** Null until this viewer has earned it. */
  unlockedAt: string | null;
  /** Current value against the threshold, for a progress bar. */
  progress: { current: number; target: number } | null;
}

export interface LinkedAccount {
  provider: OAuthProvider;
  /** Display handle at the provider, for "connected as …". */
  handle: string | null;
  linkedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds; drives the client's silent-refresh timer. */
  expiresIn: number;
}

export interface AuthSession extends AuthTokens {
  user: SelfUserProfile;
}
