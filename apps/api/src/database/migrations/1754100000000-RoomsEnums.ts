import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enum types for the rooms system, split from the tables that use them.
 *
 * Postgres refuses to use a newly-added enum value inside the same transaction
 * that created it, and `migrationsTransactionMode: 'each'` wraps every migration
 * in one. Creating the types in their own migration is what lets the next one
 * reference them as column defaults.
 */
export class RoomsEnums1754100000000 implements MigrationInterface {
  name = 'RoomsEnums1754100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "rooms_visibility_enum" AS ENUM('public', 'private')`);
    await queryRunner.query(
      `CREATE TYPE "rooms_status_enum" AS ENUM('lobby', 'drawing', 'active', 'voting', 'runoff', 'completed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "room_participants_status_enum" AS ENUM('entered', 'submitted', 'eliminated', 'left')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TYPE IF EXISTS "room_participants_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "rooms_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "rooms_visibility_enum"`);
  }
}
