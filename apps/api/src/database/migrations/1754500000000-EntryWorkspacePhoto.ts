import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The workspace shot on a challenge entry.
 *
 * An entry is now two images — the final render plus a shot of the artist's
 * Blender workspace as proof of work — where it used to be a render plus an
 * optional 3D model. The model columns are left in place so entries that predate
 * this format keep their data; they are simply no longer written.
 *
 * Nullable, because existing rows have no workspace shot. New entries supply it,
 * enforced in the entry flow rather than by the column.
 */
export class EntryWorkspacePhoto1754500000000 implements MigrationInterface {
  name = 'EntryWorkspacePhoto1754500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "challenge_entries" ADD COLUMN "workspace_photo_url" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "challenge_entries" DROP COLUMN IF EXISTS "workspace_photo_url"`,
    );
  }
}
