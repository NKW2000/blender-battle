import { ChallengeAssetType } from '@bb/shared';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { Challenge } from './challenge.entity';

/** Reference images and downloadable files attached to a challenge brief. */
@Entity('challenge_assets')
@Index('idx_challenge_assets_challenge', ['challengeId', 'sortOrder'])
export class ChallengeAsset extends BaseEntity {
  @Column({ type: 'uuid', name: 'challenge_id' })
  challengeId: string;

  @ManyToOne(() => Challenge, (challenge) => challenge.assets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'challenge_id' })
  challenge: Challenge;

  @Column({ type: 'enum', enum: ChallengeAssetType })
  type: ChallengeAssetType;

  @Column({ type: 'text' })
  url: string;

  /** Cloudinary public_id, required to destroy the remote asset on delete. */
  @Column({ type: 'text', name: 'public_id' })
  publicId: string;

  /** Original upload name, shown in the download link. */
  @Column({ type: 'text' })
  filename: string;

  @Column({ type: 'integer' })
  bytes: number;

  @Column({ type: 'text', name: 'mime_type' })
  mimeType: string;

  @Column({ type: 'integer', name: 'sort_order', default: 0 })
  sortOrder: number;
}
