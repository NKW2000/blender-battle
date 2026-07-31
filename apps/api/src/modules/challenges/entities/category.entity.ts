import { Column, Entity, OneToMany } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { Challenge } from './challenge.entity';

/**
 * Seeded with the fourteen disciplines the platform launches with, but a table
 * rather than an enum: managers add categories as the community's practice
 * shifts, and Phase 4 reports on "trending categories" by joining battle counts
 * to these rows.
 */
@Entity('categories')
export class Category extends BaseEntity {
  /** Stable URL key. Never regenerated from the name after creation. */
  @Column({ type: 'citext', unique: true })
  slug: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Manual ordering for the browse filter; ties break on name. */
  @Column({ type: 'integer', name: 'sort_order', default: 0 })
  sortOrder: number;

  @OneToMany(() => Challenge, (challenge) => challenge.category)
  challenges: Challenge[];
}
