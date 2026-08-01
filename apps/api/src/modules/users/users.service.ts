import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ActivityAction,
  ApiErrorCode,
  Role,
  SHOWCASE_MAX_ITEMS,
  UserStatus,
  type AdminUserListItem,
  type CursorPage,
  type PortfolioItem,
  type PublicUserProfile,
  type SelfUserProfile,
} from '@bb/shared';
import { Repository, type SelectQueryBuilder } from 'typeorm';

import { AppException } from '@/common/exceptions/app.exception';
import { buildPage, decodeCursor, encodeCursor } from '@/common/pagination/cursor';
import { ActivityLogService } from '@/modules/activity-log/activity-log.service';
import { TokenFamilyRevokeReason } from '@/modules/auth/entities/refresh-token-family.entity';
import { TokenService } from '@/modules/auth/services/token.service';
import { ChallengeEntry } from '@/modules/challenges/entities/challenge-entry.entity';
import { CloudinaryService } from '@/modules/uploads/cloudinary.service';

import type { ListUsersQueryDto } from './dto/admin-user.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './entities/user.entity';
import { UserMapper } from './users.mapper';

/**
 * How many finished pieces a portfolio returns.
 *
 * The page loads the models of these into a WebGL scene, and an artist with a
 * hundred entries would otherwise hand the browser a hundred mesh downloads.
 */
const PORTFOLIO_LIMIT = 24;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ChallengeEntry)
    private readonly entries: Repository<ChallengeEntry>,
    private readonly uploads: CloudinaryService,
    private readonly tokens: TokenService,
    private readonly activity: ActivityLogService,
  ) {}

  async getSelf(userId: string): Promise<SelfUserProfile> {
    return UserMapper.toSelf(await this.findOrFail(userId));
  }

  /**
   * Public profile by username. Deleted and banned accounts are reported as not
   * found rather than as blocked — a distinguishable response would let anyone
   * enumerate who has been moderated.
   */
  async getPublicProfile(username: string): Promise<PublicUserProfile> {
    const user = await this.users.findOne({ where: { username } });

    if (!user || user.status === UserStatus.BANNED || user.status === UserStatus.DELETED) {
      throw AppException.notFound('User');
    }

    return UserMapper.toPublic(user);
  }

  /**
   * An artist's finished work, newest first.
   *
   * The phase filter is the security boundary here, not a tidiness preference.
   * Voting on a challenge is blind — `challenge-events.controller` strips the
   * author from every entry it serves while a ballot is open — so an entry that
   * has not resolved must not be reachable through a named profile either.
   * Returning one would let anyone open the artist's page, read the render, and
   * match it back to a card on the live ballot.
   *
   * "Resolved" mirrors `ChallengeEventsService.phaseOf` exactly: the submission
   * window has closed AND either a winner is frozen or the vote deadline has
   * passed. Hidden entries are excluded, since a moderator pulling an entry from
   * a ballot should pull it from the artist's shopfront too.
   */
  async getPortfolio(username: string): Promise<PortfolioItem[]> {
    const user = await this.findVisibleByUsername(username);

    const rows = await this.finishedEntriesQuery(user.id)
      .orderBy('entry.submittedAt', 'DESC')
      .take(PORTFOLIO_LIMIT)
      .getMany();

    return rows.map((entry) => this.toPortfolioItem(entry));
  }

  /**
   * The artist's curated showcase — the ordered works pinned to their profile,
   * at most ten.
   *
   * Falls back to their most recent finished works when nothing is pinned, so a
   * profile is never empty before its owner has visited settings. The same
   * resolved-challenge guard as `getPortfolio` applies: a live entry is never
   * exposed, pinned or not.
   */
  async getShowcase(username: string): Promise<PortfolioItem[]> {
    const user = await this.findVisibleByUsername(username);

    // Every finished, non-hidden entry is a candidate — an entry is a pair of
    // images now, so all of them have something to show.
    const rows = await this.finishedEntriesQuery(user.id).getMany();

    const byId = new Map(rows.map((entry) => [entry.id, entry]));
    const pinned = (user.showcaseEntryIds ?? [])
      .map((id) => byId.get(id))
      .filter((entry): entry is ChallengeEntry => Boolean(entry));

    // Un-pinned profile: show the newest few rather than nothing.
    const chosen =
      pinned.length > 0
        ? pinned
        : rows
            .slice()
            .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
            .slice(0, SHOWCASE_MAX_ITEMS);

    return chosen.map((entry) => this.toPortfolioItem(entry));
  }

  /**
   * Finished, non-hidden entries for one user, with the challenge and its
   * category joined for the card and panel.
   *
   * "Finished" mirrors `ChallengeEventsService.phaseOf`: the submission window
   * has closed AND either a winner is frozen or the vote deadline has passed.
   * Property names, never raw columns — `take` with a joined select wraps the
   * query in a DISTINCT subquery that only rewrites `alias.propertyName`.
   */
  private finishedEntriesQuery(userId: string): SelectQueryBuilder<ChallengeEntry> {
    return this.entries
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.challenge', 'challenge')
      .innerJoinAndSelect('challenge.category', 'category')
      .where('entry.userId = :userId', { userId })
      .andWhere('entry.isHidden = false')
      .andWhere('challenge.startDate IS NOT NULL')
      .andWhere('challenge.endDate IS NOT NULL')
      .andWhere('challenge.endDate <= :now')
      .andWhere(
        '(challenge.winnerEntryId IS NOT NULL OR (challenge.votingEndsAt IS NOT NULL AND challenge.votingEndsAt <= :now))',
      )
      .setParameter('now', new Date());
  }

  private toPortfolioItem(entry: ChallengeEntry): PortfolioItem {
    return {
      id: entry.id,
      challengeTitle: entry.challenge.title,
      challengeSlug: entry.challenge.slug,
      challengeDescription: entry.challenge.description,
      category: entry.challenge.category.name,
      difficulty: entry.challenge.difficulty,
      imageUrl: entry.imageUrl,
      workspacePhotoUrl: entry.workspacePhotoUrl,
      voteCount: entry.voteCount,
      isWinner: entry.challenge.winnerEntryId === entry.id,
      submittedAt: entry.submittedAt.toISOString(),
    };
  }

  private async findVisibleByUsername(username: string): Promise<User> {
    const user = await this.users.findOne({ where: { username } });
    if (!user || user.status === UserStatus.BANNED || user.status === UserStatus.DELETED) {
      throw AppException.notFound('User');
    }
    return user;
  }

  /**
   * Reduce a requested showcase to the ids the caller may actually pin.
   *
   * The requested order is preserved, duplicates collapse, and any id that is
   * not one of the caller's own finished entries is rejected — not silently
   * dropped — because a request naming someone else's entry is a bug or an
   * attempt, and swallowing it would hide both. Clearing the showcase (an empty
   * array) is allowed and returns empty.
   */
  private async resolveShowcaseIds(userId: string, requested: string[]): Promise<string[]> {
    const ordered = [...new Set(requested)];
    if (ordered.length === 0) return [];

    const owned = await this.finishedEntriesQuery(userId)
      .andWhere('entry.id IN (:...ids)', { ids: ordered })
      .getMany();

    const ownedIds = new Set(owned.map((entry) => entry.id));
    const invalid = ordered.filter((id) => !ownedIds.has(id));
    if (invalid.length > 0) {
      throw new AppException(
        ApiErrorCode.VALIDATION_FAILED,
        'A showcase item must be one of your own finished works.',
        400,
      );
    }

    return ordered;
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    context: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<SelfUserProfile> {
    const user = await this.findOrFail(userId);

    // Explicit field assignment. Object.assign(user, dto) would happily write any
    // property that slipped through validation.
    if (dto.bio !== undefined) user.bio = dto.bio;
    if (dto.country !== undefined) user.country = dto.country;
    if (dto.experienceLevel !== undefined) user.experienceLevel = dto.experienceLevel;
    if (dto.socialLinks !== undefined) user.socialLinks = dto.socialLinks;
    if (dto.showcaseEntryIds !== undefined) {
      user.showcaseEntryIds = await this.resolveShowcaseIds(userId, dto.showcaseEntryIds);
    }

    const saved = await this.users.save(user);

    await this.activity.record({
      action: ActivityAction.USER_PROFILE_UPDATED,
      actorId: userId,
      entityType: 'user',
      entityId: userId,
      metadata: { fields: Object.keys(dto) },
      ...context,
    });

    return UserMapper.toSelf(saved);
  }

  async updateAvatar(userId: string, file: Express.Multer.File): Promise<SelfUserProfile> {
    const user = await this.findOrFail(userId);
    const previousPublicId = user.avatarPublicId;

    const asset = await this.uploads.uploadAvatar(file, userId);

    user.avatarUrl = asset.url;
    user.avatarPublicId = asset.publicId;
    const saved = await this.users.save(user);

    // Only after the new asset is persisted — a failure between upload and save
    // must not leave the user with no avatar at all.
    if (previousPublicId && previousPublicId !== asset.publicId) {
      await this.uploads.destroy(previousPublicId);
    }

    await this.activity.record({
      action: ActivityAction.USER_AVATAR_UPDATED,
      actorId: userId,
      entityType: 'user',
      entityId: userId,
    });

    return UserMapper.toSelf(saved);
  }

  /** Admin list. Keyset paginated over (created_at DESC, id DESC). */
  async listForAdmin(query: ListUsersQueryDto): Promise<CursorPage<AdminUserListItem>> {
    const builder = this.users
      .createQueryBuilder('user')
      .withDeleted()
      .orderBy('user.created_at', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .take(query.limit + 1);

    if (query.role) builder.andWhere('user.role = :role', { role: query.role });
    if (query.status) builder.andWhere('user.status = :status', { status: query.status });

    if (query.search) {
      // Prefix-only so the citext index can serve it; a leading wildcard would
      // force a sequential scan of the whole table.
      builder.andWhere('(user.username ILIKE :q OR user.email ILIKE :q)', {
        q: `${query.search}%`,
      });
    }

    if (query.cursor) {
      const { value, id } = decodeCursor(query.cursor);
      builder.andWhere('(user.created_at, user.id) < (:createdAt, :id)', {
        createdAt: value,
        id,
      });
    }

    const rows = await builder.getMany();
    const page = buildPage(rows, query.limit, (row) => encodeCursor(row.createdAt, row.id));

    return {
      items: page.items.map(UserMapper.toAdminListItem),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async changeRole(
    targetId: string,
    role: Role,
    reason: string,
    actorId: string,
  ): Promise<AdminUserListItem> {
    if (targetId === actorId) {
      // Prevents an admin demoting themselves into a state where no admin remains.
      throw AppException.forbidden('You cannot change your own role');
    }

    const user = await this.findOrFail(targetId);
    const previousRole = user.role;
    user.role = role;
    const saved = await this.users.save(user);

    // A role change alters what every existing access token is allowed to do, and
    // those tokens stay valid until they expire. Revoking the sessions forces a
    // re-authentication that picks up the new role immediately.
    await this.tokens.revokeAllForUser(targetId, TokenFamilyRevokeReason.ADMIN_ACTION);

    await this.activity.record({
      action: ActivityAction.ADMIN_ROLE_CHANGED,
      actorId,
      entityType: 'user',
      entityId: targetId,
      metadata: { from: previousRole, to: role, reason },
    });

    return UserMapper.toAdminListItem(saved);
  }

  async changeStatus(
    targetId: string,
    status: UserStatus,
    reason: string,
    actorId: string,
    suspendedUntil?: Date,
  ): Promise<AdminUserListItem> {
    if (targetId === actorId) {
      throw AppException.forbidden('You cannot change your own status');
    }

    const user = await this.findOrFail(targetId, true);
    const previousStatus = user.status;

    user.status = status;
    user.suspendedUntil = status === UserStatus.SUSPENDED ? (suspendedUntil ?? null) : null;

    if (status === UserStatus.DELETED) {
      user.deletedAt = new Date();
    } else if (previousStatus === UserStatus.DELETED) {
      user.deletedAt = null; // restore
    }

    const saved = await this.users.save(user);

    if (status !== UserStatus.ACTIVE) {
      await this.tokens.revokeAllForUser(targetId, TokenFamilyRevokeReason.ADMIN_ACTION);
    }

    await this.activity.record({
      action: ActivityAction.ADMIN_STATUS_CHANGED,
      actorId,
      entityType: 'user',
      entityId: targetId,
      metadata: { from: previousStatus, to: status, reason, suspendedUntil },
    });

    return UserMapper.toAdminListItem(saved);
  }

  private async findOrFail(id: string, includeDeleted = false): Promise<User> {
    const user = await this.users.findOne({ where: { id }, withDeleted: includeDeleted });
    if (!user) throw AppException.notFound('User');
    return user;
  }
}
