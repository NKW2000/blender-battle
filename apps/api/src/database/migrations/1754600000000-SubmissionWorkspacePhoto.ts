import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Room submissions carry a workspace photo, as challenge entries already do.
 *
 * The `model_url` and `model_filename` columns are left in place rather than
 * dropped. They hold the only record of what earlier rooms submitted, and a
 * migration that deletes finished contest history to tidy a schema is trading
 * something irreplaceable for something cosmetic. Nothing writes to them now.
 *
 * Nullable for the same reason: every row that predates this column has no
 * workspace photo and never will, so NOT NULL could only be satisfied by
 * inventing a value for work that is already judged.
 */
export class SubmissionWorkspacePhoto1754600000000 implements MigrationInterface {
  name = 'SubmissionWorkspacePhoto1754600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "submissions" ADD COLUMN "workspace_photo_url" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "workspace_photo_url"`);
  }
}
