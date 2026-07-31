import { Column, Entity, ManyToMany } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { Challenge } from './challenge.entity';

/**
 * Free-form facet, unlike the single required category. Tags are created on
 * demand when a manager types a new one, deduplicated by slug.
 */
@Entity('tags')
export class Tag extends BaseEntity {
  @Column({ type: 'citext', unique: true })
  slug: string;

  @Column({ type: 'text' })
  name: string;

  @ManyToMany(() => Challenge, (challenge) => challenge.tags)
  challenges: Challenge[];
}
