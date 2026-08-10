import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames the notification types to the contests that actually exist.
 *
 * The original set was written for a matchmaking feature (`battle_matched`,
 * `battle_result`) and an achievements system (`achievement_unlocked`), neither
 * of which was ever built. Rooms replaced the first and the second has no
 * module at all — and because nothing in the codebase had ever called
 * `NotificationsService.create`, not one row of any type has ever existed.
 *
 * That is what makes this safe to do as a straight swap rather than a mapping:
 * there is no data to migrate. The delete below is belt and braces for any
 * environment where somebody inserted a row by hand.
 */
export class NotificationTypes1754700000000 implements MigrationInterface {
  name = 'NotificationTypes1754700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Detach the column from the type so the type can be replaced. Postgres
    // will not drop an enum that a column still depends on.
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE text USING "type"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "notifications_type_enum"`);

    await queryRunner.query(`
      CREATE TYPE "notifications_type_enum" AS ENUM (
        'room_started',
        'room_voting_open',
        'room_result',
        'event_voting_open',
        'event_result',
        'role_changed',
        'account_status',
        'challenge_published'
      )
    `);

    // Anything left over cannot be cast into the new type, and there is nothing
    // meaningful to map it to.
    await queryRunner.query(`
      DELETE FROM "notifications"
      WHERE "type" NOT IN (
        'room_started','room_voting_open','room_result',
        'event_voting_open','event_result',
        'role_changed','account_status','challenge_published'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "type" TYPE "notifications_type_enum"
      USING "type"::"notifications_type_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE text USING "type"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "notifications_type_enum"`);

    await queryRunner.query(`
      CREATE TYPE "notifications_type_enum" AS ENUM (
        'battle_matched',
        'battle_result',
        'achievement_unlocked',
        'role_changed',
        'account_status',
        'challenge_published'
      )
    `);

    // The new types have no equivalent in the old set, so rows carrying them
    // cannot come back. Reverting this migration discards them.
    await queryRunner.query(`
      DELETE FROM "notifications"
      WHERE "type" NOT IN (
        'battle_matched','battle_result','achievement_unlocked',
        'role_changed','account_status','challenge_published'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "type" TYPE "notifications_type_enum"
      USING "type"::"notifications_type_enum"
    `);
  }
}
