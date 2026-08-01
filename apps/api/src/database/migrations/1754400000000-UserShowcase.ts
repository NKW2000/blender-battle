import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The artist's curated profile showcase.
 *
 * An ordered array of entry ids, not a join table: order matters, the list is
 * capped at ten, and it is always read whole. No foreign key — an entry later
 * hidden or deleted should quietly drop out of the showcase, not reject the row.
 */
export class UserShowcase1754400000000 implements MigrationInterface {
  name = 'UserShowcase1754400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "showcase_entry_ids" uuid[] NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "showcase_entry_ids"`);
  }
}
