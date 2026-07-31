import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The ready-check columns and sweep index.
 *
 * Runs after the enum value exists (previous migration), which is what lets the
 * partial index predicate reference 'ready_check'.
 */
export class ReadyCheckColumns1754000100000 implements MigrationInterface {
  name = 'ReadyCheckColumns1754000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "battle_participants" ADD COLUMN IF NOT EXISTS "ready_at" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "battles" ADD COLUMN IF NOT EXISTS "ready_deadline" timestamptz
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_battles_pending_deadlines"`);
    await queryRunner.query(`
      CREATE INDEX "idx_battles_pending_deadlines"
        ON "battles" ("status", "ready_deadline", "started_at", "ends_at", "voting_ends_at")
        WHERE "status" IN ('ready_check', 'countdown', 'active', 'voting')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_battles_pending_deadlines"`);
    await queryRunner.query(`ALTER TABLE "battles" DROP COLUMN IF EXISTS "ready_deadline"`);
    await queryRunner.query(`ALTER TABLE "battle_participants" DROP COLUMN IF EXISTS "ready_at"`);
  }
}
