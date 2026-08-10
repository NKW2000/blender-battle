import type {
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
  /** The brief itself, reused as the work's blurb — artists write no separate caption. */
  challengeDescription: string;
  category: string;
  difficulty: Difficulty;
  /** The final render — a 1024×1024 image. */
  imageUrl: string;
  /** The workspace shot — a 1024×1024 image. Null on legacy entries. */
  workspacePhotoUrl: string | null;
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
  /**
   * The artist's curated showcase: entry ids, in display order, at most ten.
   * Only exposed to the owner — a viewer sees the resolved works, not the id
   * list — because it is the input to the settings picker, not public data.
   */
  showcaseEntryIds: string[];
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

/**
 * Where an artist can be found off the site.
 *
 * Every field is a full URL except `discord`, which is a handle — Discord has no
 * public profile page to link to, so a URL would have nowhere to point.
 *
 * The list is deliberately finite rather than free-form key/value pairs. A
 * fixed set is what lets the profile label each link, order them, and refuse
 * anything else; an open map would put whatever a client sent straight onto a
 * public page.
 */
export interface SocialLinks {
  website?: string;
  artstation?: string;
  sketchfab?: string;
  behance?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
  facebook?: string;
  twitter?: string;
  discord?: string;
}

/** The order the profile lists them in: portfolio first, then social, then chat. */
export const SOCIAL_LINK_KEYS = [
  'website',
  'artstation',
  'sketchfab',
  'behance',
  'instagram',
  'youtube',
  'tiktok',
  'facebook',
  'twitter',
  'discord',
] as const satisfies readonly (keyof SocialLinks)[];

export const SOCIAL_LINK_LABELS: Record<keyof SocialLinks, string> = {
  website: 'Website',
  artstation: 'ArtStation',
  sketchfab: 'Sketchfab',
  behance: 'Behance',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  twitter: 'X',
  discord: 'Discord',
};

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
  /**
   * Rooms — the private, timed contests players actually run.
   *
   * Named `contests` rather than `battles` because these counts used to come
   * from a `battles` table that nothing has written to since rooms replaced it.
   * The dashboard was not showing "no data yet"; it was showing a permanent,
   * structural zero with no indication the number could never be anything else.
   */
  contests: {
    total: number;
    completed: number;
    live: number;
    last24h: number;
  };
  engagement: {
    /** Challenge-event votes plus room ballot likes — every vote cast anywhere. */
    totalVotes: number;
    /** Entries across both contest kinds. */
    totalEntries: number;
    dau: number;
    wau: number;
    mau: number;
  };
  mostPlayedChallenge: { id: string; title: string; timesPlayed: number } | null;
  trendingCategories: Array<{ id: string; name: string; contests: number }>;
  topPlayers: Array<{ userId: string; username: string; score: number; wins: number }>;
  /** Contests completed per day, oldest first. Drives the growth chart. */
  contestsPerDay: Array<{ date: string; contests: number }>;
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

export interface LinkedAccount {
  provider: OAuthProvider;
  /** Display handle at the provider, for "connected as …". */
  handle: string | null;
  linkedAt: string;
}

/**
 * What a browser receives from an auth call.
 *
 * There is deliberately no `refreshToken` here. It is delivered as an httpOnly
 * cookie and never enters JavaScript, so a type that promised one would be
 * describing a field the client can neither read nor send.
 */
export interface AuthTokens {
  accessToken: string;
  /** Access-token lifetime in seconds; drives the client's silent-refresh timer. */
  expiresIn: number;
}

export interface AuthSession extends AuthTokens {
  user: SelfUserProfile;
}
