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
  toPublic(user: User): PublicUserProfile {
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
      // Rank is a property of the leaderboard read model, not of the row itself;
      // it is filled in by the leaderboard service in Phase 4.
      rank: null,
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

  toSelf(user: User): SelfUserProfile {
    return {
      ...UserMapper.toPublic(user),
      email: user.email,
      role: user.role,
      status: user.status,
      updatedAt: user.updatedAt.toISOString(),
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
