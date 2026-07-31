import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A voting deadline for public challenges.
 *
 * Nullable: an event without it keeps the old behaviour — voting stays open
 * until a manager closes it. When set, the scheduler freezes the winner at that
 * moment, so the whole event can be scheduled up front.
 */
export class ChallengeVotingWindow1754300000000 implements MigrationInterface {
  name = 'ChallengeVotingWindow1754300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "challenges" ADD COLUMN "voting_ends_at" timestamptz`);
    // Finds events whose vote window has elapsed but not yet been resolved.
    await queryRunner.query(`
      CREATE INDEX "idx_challenges_voting_due"
        ON "challenges" ("voting_ends_at")
        WHERE "voting_ends_at" IS NOT NULL AND "winner_entry_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_challenges_voting_due"`);
    await queryRunner.query(`ALTER TABLE "challenges" DROP COLUMN IF EXISTS "voting_ends_at"`);
  }
}
