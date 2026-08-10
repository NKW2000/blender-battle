import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ActivityAction,
  ApiErrorCode,
  ChallengeStatus,
  ChallengeVisibility,
  DIFFICULTY_BASE_XP,
  Role,
  type ChallengeDetail,
  type ChallengeSummary,
  type CursorPage,
} from '@bb/shared';

/** Used when a brief is created without a manual estimate. */
const DEFAULT_ESTIMATED_MINUTES = 45;
import { DataSource, In, Repository } from 'typeorm';

import { AppException } from '@/common/exceptions/app.exception';
import { buildPage, decodeCursor, encodeCursor } from '@/common/pagination/cursor';
import type { AuthenticatedUser } from '@/common/types/authenticated-user';
import { ActivityLogService } from '@/modules/activity-log/activity-log.service';

import { ChallengeMapper } from './challenges.mapper';
import type {
  CreateChallengeDto,
  DrawChallengeDto,
  ListChallengesQueryDto,
  UpdateChallengeDto,
} from './dto/challenge.dto';
import { Category } from './entities/category.entity';
import { Challenge } from './entities/challenge.entity';
import { Tag } from './entities/tag.entity';

/** Relations every detail projection needs. Listed once so no query forgets one. */
const DETAIL_RELATIONS = {
  category: true,
  tags: true,
  assets: true,
  createdBy: true,
} as const;

@Injectable()
export class ChallengesService {
  constructor(
    @InjectRepository(Challenge) private readonly challenges: Repository<Challenge>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
    private readonly activity: ActivityLogService,
    private readonly dataSource: DataSource,
  ) {}

  // --- Read ----------------------------------------------------------------

  async list(
    query: ListChallengesQueryDto,
    viewer: AuthenticatedUser | null,
  ): Promise<CursorPage<ChallengeSummary>> {
    const builder = this.challenges
      .createQueryBuilder('challenge')
      .leftJoinAndSelect('challenge.category', 'category')
      .leftJoinAndSelect('challenge.tags', 'tag')
      .leftJoinAndSelect('challenge.assets', 'asset')
      .take(query.limit + 1);

    this.applyVisibilityScope(builder, query, viewer);

    if (query.categoryId) {
      builder.andWhere('challenge.category_id = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.difficulty) {
      builder.andWhere('challenge.difficulty = :difficulty', {
        difficulty: query.difficulty,
      });
    }
    if (query.tag) {
      // Subquery rather than filtering the joined alias: filtering the join would
      // also drop the challenge's *other* tags from the response.
      builder.andWhere(
        `EXISTS (
           SELECT 1 FROM challenge_tags ct
           JOIN tags t ON t.id = ct.tag_id
           WHERE ct.challenge_id = challenge.id AND t.slug = :tagSlug
         )`,
        { tagSlug: query.tag },
      );
    }
    if (query.search) {
      builder.andWhere('challenge.title ILIKE :search', { search: `%${query.search}%` });
    }

    // Published rows order by publication; a manager's drafts have no
    // published_at, so their view orders by creation instead.
    const byCreation = Boolean(query.mine || query.status);

    // Two spellings of the same field, deliberately: orderBy() is resolved
    // through entity metadata and needs the property name, while the keyset
    // comparison below is raw SQL and needs the column name.
    const sortProperty = byCreation ? 'createdAt' : 'publishedAt';
    const sortColumn = byCreation ? 'created_at' : 'published_at';

    builder
      .orderBy(`challenge.${sortProperty}`, 'DESC')
      .addOrderBy('challenge.id', 'DESC');

    if (query.cursor) {
      const { value, id } = decodeCursor(query.cursor);
      builder.andWhere(`(challenge.${sortColumn}, challenge.id) < (:value, :id)`, {
        value,
        id,
      });
    }

    const rows = await builder.getMany();
    const page = buildPage(rows, query.limit, (row) =>
      encodeCursor(byCreation ? row.createdAt : (row.publishedAt ?? row.createdAt), row.id),
    );

    return {
      items: page.items.map(ChallengeMapper.summary),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async findBySlug(slug: string, viewer: AuthenticatedUser | null): Promise<ChallengeDetail> {
    const challenge = await this.challenges.findOne({
      where: { slug },
      relations: DETAIL_RELATIONS,
    });

    if (!challenge) throw AppException.notFound('Challenge');
    this.assertCanView(challenge, viewer);

    return ChallengeMapper.detail(challenge);
  }

  async listCategories(): Promise<Category[]> {
    return this.categories.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async listTags(): Promise<Tag[]> {
    return this.tags.find({ order: { name: 'ASC' }, take: 200 });
  }

  // --- Random draw ---------------------------------------------------------

  /**
   * Record that this brief was actually used in a contest.
   *
   * A bare atomic increment, kept off the read path: the column feeds the admin
   * "most played" panel and every manager's authoring stats, both of which read
   * it and neither of which could ever show anything, because nothing in the
   * codebase incremented it.
   *
   * Deliberately not a `save()` of a loaded entity — two rooms starting at once
   * would each write `read value + 1` and lose one of the plays.
   */
  async recordPlay(challengeId: string): Promise<void> {
    await this.challenges.increment({ id: challengeId }, 'timesPlayed', 1);
  }

  /**
   * Picks a challenge server-side from the filtered, drawable set.
   *
   * The caller supplies filters only. Accepting an id here — even "just to
   * re-roll" — would let a client hand its opponent a brief it had already
   * prepared for, which is the whole reason this endpoint exists rather than
   * letting the frontend pick from a list it already fetched.
   *
   * Implemented as count-then-offset instead of ORDER BY random(): random()
   * sorts the entire eligible set on every draw, while an offset seek uses the
   * partial index. At battle-start frequency that difference matters.
   */
  async draw(dto: DrawChallengeDto, viewer: AuthenticatedUser): Promise<ChallengeDetail> {
    let effective = dto;
    let total = await this.drawableQuery(effective).getCount();

    // The exclusion list is a nicety for re-rolls, not a filter the player asked
    // for. On a small catalogue it can empty the pool on its own — in that case
    // drop it and draw from the real filters rather than refusing to deal.
    if (total === 0 && dto.excludeIds?.length) {
      effective = { ...dto, excludeIds: undefined };
      total = await this.drawableQuery(effective).getCount();
    }

    if (total === 0) {
      // Not notFound(): that helper appends "not found" to a resource name, and
      // this needs to be a full sentence telling the player what to change.
      throw new AppException(
        ApiErrorCode.NOT_FOUND,
        'No published challenge matches those filters. Try a different category or difficulty.',
        HttpStatus.NOT_FOUND,
      );
    }

    const offset = Math.floor(Math.random() * total);
    const picked = await this.drawableQuery(effective)
      .orderBy('challenge.id', 'ASC')
      .skip(offset)
      .take(1)
      .getOne();

    if (!picked) throw AppException.notFound('Challenge');

    // Re-read with relations: the draw query is deliberately lean so COUNT and
    // OFFSET stay index-only.
    const challenge = await this.challenges.findOneOrFail({
      where: { id: picked.id },
      relations: DETAIL_RELATIONS,
    });

    await this.activity.record({
      action: ActivityAction.CHALLENGE_DRAWN,
      actorId: viewer.id,
      entityType: 'challenge',
      entityId: challenge.id,
      metadata: {
        categoryId: dto.categoryId ?? null,
        difficulty: dto.difficulty ?? null,
        poolSize: total,
      },
    });

    return ChallengeMapper.detail(challenge);
  }

  // --- Write ---------------------------------------------------------------

  async create(dto: CreateChallengeDto, author: AuthenticatedUser): Promise<ChallengeDetail> {
    await this.assertCategoryExists(dto.categoryId);

    const challenge = this.challenges.create({
      title: dto.title,
      slug: await this.uniqueSlug(dto.title),
      description: dto.description,
      difficulty: dto.difficulty,
      categoryId: dto.categoryId,
      estimatedMinutes: dto.estimatedMinutes ?? DEFAULT_ESTIMATED_MINUTES,
      rewardXp: dto.rewardXp ?? DIFFICULTY_BASE_XP[dto.difficulty],
      blenderVersion: dto.blenderVersion ?? null,
      rules: dto.rules ?? null,
      objectives: dto.objectives ?? [],
      allowedAssets: dto.allowedAssets ?? null,
      forbiddenAssets: dto.forbiddenAssets ?? null,
      visibility: dto.visibility ?? ChallengeVisibility.PUBLIC,
      // Always a draft. A challenge goes live through the publish endpoint,
      // which checks it is actually complete.
      status: ChallengeStatus.DRAFT,
      createdById: author.id,
      tags: await this.resolveTags(dto.tags ?? []),
    });

    const saved = await this.challenges.save(challenge);

    await this.activity.record({
      action: ActivityAction.CHALLENGE_CREATED,
      actorId: author.id,
      entityType: 'challenge',
      entityId: saved.id,
      metadata: { title: saved.title },
    });

    return this.findById(saved.id);
  }

  async update(
    id: string,
    dto: UpdateChallengeDto,
    actor: AuthenticatedUser,
  ): Promise<ChallengeDetail> {
    const challenge = await this.findEntityOrFail(id);
    this.assertCanEdit(challenge, actor);

    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);

    // Explicit assignment; see UsersService for why Object.assign is avoided.
    if (dto.title !== undefined) challenge.title = dto.title;
    if (dto.description !== undefined) challenge.description = dto.description;
    if (dto.difficulty !== undefined) challenge.difficulty = dto.difficulty;
    if (dto.categoryId !== undefined) challenge.categoryId = dto.categoryId;
    if (dto.estimatedMinutes !== undefined) challenge.estimatedMinutes = dto.estimatedMinutes;
    if (dto.rewardXp !== undefined) challenge.rewardXp = dto.rewardXp;
    if (dto.blenderVersion !== undefined) challenge.blenderVersion = dto.blenderVersion;
    if (dto.rules !== undefined) challenge.rules = dto.rules;
    if (dto.objectives !== undefined) challenge.objectives = dto.objectives;
    if (dto.allowedAssets !== undefined) challenge.allowedAssets = dto.allowedAssets;
    if (dto.forbiddenAssets !== undefined) challenge.forbiddenAssets = dto.forbiddenAssets;
    if (dto.visibility !== undefined) challenge.visibility = dto.visibility;
    if (dto.tags !== undefined) challenge.tags = await this.resolveTags(dto.tags);

    // The slug is intentionally never regenerated from a retitled challenge:
    // links shared into Discord during a battle must keep resolving.
    await this.challenges.save(challenge);

    await this.activity.record({
      action: ActivityAction.CHALLENGE_UPDATED,
      actorId: actor.id,
      entityType: 'challenge',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });

    return this.findById(id);
  }

  async publish(id: string, actor: AuthenticatedUser): Promise<ChallengeDetail> {
    const challenge = await this.findEntityOrFail(id, true);
    this.assertCanEdit(challenge, actor);

    // Publication preconditions live here rather than in a DTO, because they are
    // about the state of the whole record, not the shape of one request.
    if (challenge.objectives.length === 0) {
      throw AppException.conflict(
        'Add at least one objective before publishing. Players need to know what they are being judged on.',
      );
    }

    challenge.status = ChallengeStatus.PUBLISHED;
    challenge.publishedAt ??= new Date();
    await this.challenges.save(challenge);

    await this.activity.record({
      action: ActivityAction.CHALLENGE_PUBLISHED,
      actorId: actor.id,
      entityType: 'challenge',
      entityId: id,
    });

    return this.findById(id);
  }

  async archive(id: string, actor: AuthenticatedUser): Promise<ChallengeDetail> {
    const challenge = await this.findEntityOrFail(id);
    this.assertCanEdit(challenge, actor);

    challenge.status = ChallengeStatus.ARCHIVED;
    await this.challenges.save(challenge);

    await this.activity.record({
      action: ActivityAction.CHALLENGE_ARCHIVED,
      actorId: actor.id,
      entityType: 'challenge',
      entityId: id,
    });

    return this.findById(id);
  }

  /**
   * Soft delete. Phase 3 battles will reference the challenge they were fought
   * over; removing the row would leave those battles unexplainable.
   */
  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const challenge = await this.findEntityOrFail(id);
    this.assertCanEdit(challenge, actor);

    await this.challenges.softDelete({ id });

    await this.activity.record({
      action: ActivityAction.CHALLENGE_DELETED,
      actorId: actor.id,
      entityType: 'challenge',
      entityId: id,
      metadata: { title: challenge.title },
    });
  }

  async findById(id: string): Promise<ChallengeDetail> {
    const challenge = await this.challenges.findOne({
      where: { id },
      relations: DETAIL_RELATIONS,
    });
    if (!challenge) throw AppException.notFound('Challenge');
    return ChallengeMapper.detail(challenge);
  }

  async findEntityOrFail(id: string, withRelations = false): Promise<Challenge> {
    const challenge = await this.challenges.findOne({
      where: { id },
      relations: withRelations ? DETAIL_RELATIONS : undefined,
    });
    if (!challenge) throw AppException.notFound('Challenge');
    return challenge;
  }

  /** Manager owns it, or the actor is an admin. Used by uploads too. */
  assertCanEdit(challenge: Challenge, actor: AuthenticatedUser): void {
    if (actor.role === Role.ADMIN) return;
    if (challenge.createdById !== actor.id) {
      throw AppException.forbidden('You can only edit challenges you created');
    }
  }

  // --- internals -----------------------------------------------------------

  private drawableQuery(dto: DrawChallengeDto) {
    const builder = this.challenges
      .createQueryBuilder('challenge')
      .where('challenge.status = :status', { status: ChallengeStatus.PUBLISHED })
      .andWhere('challenge.visibility = :visibility', {
        visibility: ChallengeVisibility.PUBLIC,
      });

    if (dto.categoryId) {
      builder.andWhere('challenge.category_id = :categoryId', {
        categoryId: dto.categoryId,
      });
    }
    if (dto.difficulty) {
      builder.andWhere('challenge.difficulty = :difficulty', {
        difficulty: dto.difficulty,
      });
    }
    if (dto.excludeIds?.length) {
      builder.andWhere('challenge.id NOT IN (:...excludeIds)', {
        excludeIds: dto.excludeIds,
      });
    }

    return builder;
  }

  /**
   * Restricts a listing to what the caller is allowed to see. Anonymous and
   * player callers see published+public only, whatever they pass as filters.
   */
  private applyVisibilityScope(
    builder: ReturnType<Repository<Challenge>['createQueryBuilder']>,
    query: ListChallengesQueryDto,
    viewer: AuthenticatedUser | null,
  ): void {
    const isPrivileged =
      viewer !== null && (viewer.role === Role.MANAGER || viewer.role === Role.ADMIN);

    if (!isPrivileged) {
      builder
        .andWhere('challenge.status = :published', {
          published: ChallengeStatus.PUBLISHED,
        })
        .andWhere('challenge.visibility = :public', {
          public: ChallengeVisibility.PUBLIC,
        });
      return;
    }

    if (query.mine) {
      builder.andWhere('challenge.created_by_id = :authorId', { authorId: viewer.id });
    } else if (viewer.role === Role.MANAGER) {
      // A manager browsing everything still sees only their own unpublished work
      // alongside the public catalogue.
      builder.andWhere(
        `(challenge.created_by_id = :authorId
          OR (challenge.status = :published AND challenge.visibility = :public))`,
        {
          authorId: viewer.id,
          published: ChallengeStatus.PUBLISHED,
          public: ChallengeVisibility.PUBLIC,
        },
      );
    }

    if (query.status) {
      builder.andWhere('challenge.status = :statusFilter', { statusFilter: query.status });
    }
  }

  private assertCanView(challenge: Challenge, viewer: AuthenticatedUser | null): void {
    if (challenge.isDrawable) return;

    // Unlisted is reachable by direct link once published — that is its purpose.
    if (
      challenge.status === ChallengeStatus.PUBLISHED &&
      challenge.visibility === ChallengeVisibility.UNLISTED
    ) {
      return;
    }

    const isOwner = viewer?.id === challenge.createdById;
    const isAdmin = viewer?.role === Role.ADMIN;

    // Not "forbidden": telling an anonymous caller that a draft exists at this
    // slug is itself a disclosure.
    if (!isOwner && !isAdmin) throw AppException.notFound('Challenge');
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const exists = await this.categories.existsBy({ id: categoryId });
    if (!exists) throw AppException.notFound('Category');
  }

  /** Finds existing tags by slug and creates the ones that do not exist yet. */
  private async resolveTags(names: string[]): Promise<Tag[]> {
    if (names.length === 0) return [];

    const bySlug = new Map(
      names
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => [this.slugify(name), name]),
    );

    const existing = await this.tags.find({ where: { slug: In([...bySlug.keys()]) } });
    const existingSlugs = new Set(existing.map((tag) => tag.slug.toLowerCase()));

    const created = [...bySlug.entries()]
      .filter(([slug]) => !existingSlugs.has(slug))
      .map(([slug, name]) => this.tags.create({ slug, name }));

    return [...existing, ...(created.length ? await this.tags.save(created) : [])];
  }

  /** Slug from title, with a numeric suffix if the base is taken. */
  private async uniqueSlug(title: string): Promise<string> {
    const base = this.slugify(title) || 'challenge';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.challenges.existsBy({ slug: candidate });
      if (!taken) return candidate;
    }

    // Exhausted the readable options; fall back to something guaranteed free.
    return `${base}-${Date.now().toString(36)}`;
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      // Strip combining marks left by NFKD so "Sculpté" slugs as "sculpte".
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }
}
