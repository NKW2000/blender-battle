import {
  ChallengeAssetType,
  type CategorySummary,
  type ChallengeAsset as ChallengeAssetContract,
  type ChallengeDetail,
  type ChallengeSummary,
  type TagSummary,
} from '@bb/shared';

import type { Category } from './entities/category.entity';
import type { ChallengeAsset } from './entities/challenge-asset.entity';
import type { Challenge } from './entities/challenge.entity';
import type { Tag } from './entities/tag.entity';

const SHORT_DESCRIPTION_MAX_LENGTH = 140;

/** Cuts at the last whole word so a card never ends mid-token. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
}

/** Explicit projection, same reasoning as UserMapper: no entity leaks by default. */
export const ChallengeMapper = {
  category(category: Category, challengeCount?: number): CategorySummary {
    return {
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      ...(challengeCount === undefined ? {} : { challengeCount }),
    };
  },

  tag(tag: Tag): TagSummary {
    return { id: tag.id, slug: tag.slug, name: tag.name };
  },

  asset(asset: ChallengeAsset): ChallengeAssetContract {
    return {
      id: asset.id,
      type: asset.type,
      url: asset.url,
      filename: asset.filename,
      bytes: asset.bytes,
      sortOrder: asset.sortOrder,
    };
  },

  summary(challenge: Challenge): ChallengeSummary {
    return {
      id: challenge.id,
      slug: challenge.slug,
      title: challenge.title,
      difficulty: challenge.difficulty,
      category: ChallengeMapper.category(challenge.category),
      tags: (challenge.tags ?? []).map(ChallengeMapper.tag),
      estimatedMinutes: challenge.estimatedMinutes,
      rewardXp: challenge.rewardXp,
      status: challenge.status,
      visibility: challenge.visibility,
      // First reference image doubles as the card cover; no separate upload slot
      // for managers to fill in and forget.
      coverImageUrl:
        (challenge.assets ?? [])
          .filter((asset) => asset.type === ChallengeAssetType.REFERENCE_IMAGE)
          .sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null,
      shortDescription: truncate(challenge.description, SHORT_DESCRIPTION_MAX_LENGTH),
      createdAt: challenge.createdAt.toISOString(),
      publishedAt: challenge.publishedAt?.toISOString() ?? null,
    };
  },

  /**
   * Summary plus the written brief, without the author.
   *
   * The piece a reader needs to actually attempt the challenge, and nothing
   * that requires a relation beyond `assets` — `detail` reads `createdBy`, so
   * calling it from a context that did not join the author throws. Rooms load
   * the drawn challenge without its author and the event endpoint has no place
   * to show one, so both use this.
   */
  brief(challenge: Challenge) {
    return {
      ...ChallengeMapper.summary(challenge),
      description: challenge.description,
      rules: challenge.rules,
      objectives: challenge.objectives ?? [],
      allowedAssets: challenge.allowedAssets,
      forbiddenAssets: challenge.forbiddenAssets,
      blenderVersion: challenge.blenderVersion,
      assets: (challenge.assets ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(ChallengeMapper.asset),
    };
  },

  detail(challenge: Challenge): ChallengeDetail {
    return {
      ...ChallengeMapper.summary(challenge),
      description: challenge.description,
      rules: challenge.rules,
      objectives: challenge.objectives ?? [],
      allowedAssets: challenge.allowedAssets,
      forbiddenAssets: challenge.forbiddenAssets,
      blenderVersion: challenge.blenderVersion,
      assets: (challenge.assets ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(ChallengeMapper.asset),
      author: {
        id: challenge.createdBy.id,
        username: challenge.createdBy.username,
        avatarUrl: challenge.createdBy.avatarUrl,
      },
      updatedAt: challenge.updatedAt.toISOString(),
    };
  },
};
