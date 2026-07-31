import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `ready_check` battle status, and nothing else.
 *
 * Deliberately split from the migration that uses it: Postgres refuses to
 * reference a newly added enum value inside the same transaction that added it
 * ("unsafe use of new value"). Two migrations, two transactions.
 */
export class ReadyCheckEnum1754000000000 implements MigrationInterface {
  name = 'ReadyCheckEnum1754000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "battles_status_enum" ADD VALUE IF NOT EXISTS 'ready_check' BEFORE 'countdown'
    `);
  }

  public async down(): Promise<void> {
    // Postgres cannot remove a value from an enum type. Left in place; harmless
    // once nothing writes it.
  }
}
