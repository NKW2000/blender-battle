import type { AdminUserListItem, PublicUserProfile, SelfUserProfile } from '@bb/shared';

import type { User } from './entities/user.entity';

/**
 * Entity-to-DTO projection.
 *
 * Serialisation is explicit rather than returning entities directly: an entity
 * gains a column the moment someone writes a migration, and an implicit
 * serialiser would start leaking it to every client without anyone noticing.
 * Adding a field to the API is a deliberate edit here.
 */
export const UserMapper = {
  /**
   * `rank` is passed in rather than read off the user.
   *
   * It is a property of the standings, not of the row — you cannot know where
   * someone places without looking at everyone else — so the mapper stays a
   * pure projection and the caller that has the leaderboard supplies it. It
   * defaults to null because most callers legitimately do not have it: an auth
   * response returning the signed-in user has no business running a standings
   * query to do it.
   */
  toPublic(user: User, rank: number | null = null): PublicUserProfile {
    return {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      country: user.country,
      socialLinks: user.socialLinks ?? {},
      experienceLevel: user.experienceLevel,
      totalXp: user.totalXp,
      score: user.score,
      rank,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      totalBattles: user.totalBattles,
      winRate: user.winRate,
      currentStreak: user.currentStreak,
      highestStreak: user.highestStreak,
      totalVotesReceived: user.totalVotesReceived,
      joinedAt: user.createdAt.toISOString(),
    };
  },

  toSelf(user: User, rank: number | null = null): SelfUserProfile {
    return {
      ...UserMapper.toPublic(user, rank),
      email: user.email,
      role: user.role,
      status: user.status,
      updatedAt: user.updatedAt.toISOString(),
      showcaseEntryIds: user.showcaseEntryIds ?? [],
    };
  },

  toAdminListItem(user: User): AdminUserListItem {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    };
  },
};
