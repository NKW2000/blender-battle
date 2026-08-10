import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes columns that were reserved for features that never arrived, and the
 * remains of the 3D-model upload.
 *
 * `model_url` / `model_filename` date from when an entry was a mesh file. That
 * was replaced by the workspace screenshot: a model could not be opened on the
 * ballot, so it proved almost nothing to a voter, while costing every artist an
 * export step and the storage account tens of megabytes per room. Nothing has
 * written these since, and nothing reads them.
 *
 * `org_id` and `favorite_category_id` were placeholders for multi-tenancy and a
 * personalisation feature. Neither was built, no code references either, and a
 * nullable column nobody populates is indistinguishable from a bug in whatever
 * feature a future reader assumes it belongs to.
 *
 * Dropped rather than left in place because the workspace photo makes the model
 * columns genuinely unrecoverable context: an entry from that era has an image
 * either way, and the mesh URL points at assets that are no longer served.
 */
export class DropReservedColumns1754700300000 implements MigrationInterface {
  name = 'DropReservedColumns1754700300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "challenge_entries" DROP COLUMN IF EXISTS "model_url"`);
    await queryRunner.query(
      `ALTER TABLE "challenge_entries" DROP COLUMN IF EXISTS "model_filename"`,
    );
    await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN IF EXISTS "model_url"`);
    await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN IF EXISTS "model_filename"`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "org_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "favorite_category_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Structure only — the values are gone, and were null for every row anyway.
    await queryRunner.query(`ALTER TABLE "challenge_entries" ADD COLUMN "model_url" text`);
    await queryRunner.query(
      `ALTER TABLE "challenge_entries" ADD COLUMN "model_filename" varchar(255)`,
    );
    await queryRunner.query(`ALTER TABLE "submissions" ADD COLUMN "model_url" text`);
    await queryRunner.query(`ALTER TABLE "submissions" ADD COLUMN "model_filename" varchar(255)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "org_id" uuid`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "favorite_category_id" uuid`);
  }
}
