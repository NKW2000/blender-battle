import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reduce the discipline list to Modeling.
 *
 * Fourteen categories were seeded up front — rigging, VFX, geometry nodes and
 * the rest — on the assumption the platform would fill them. It has not, and an
 * empty filter is worse than no filter: someone picks "Texturing", gets nothing,
 * and reasonably concludes the site is broken rather than that the category has
 * no briefs yet. Difficulty is untouched; that one does vary per challenge and
 * is the axis people actually choose along.
 *
 * The table stays. Categories are a real dimension and the schema, the foreign
 * keys and the pickers all still work — this deletes rows, not a feature, so
 * bringing one back later is an INSERT rather than a migration and a redeploy.
 *
 * Every reference is repointed before anything is removed. A challenge whose
 * category vanished would violate its NOT NULL foreign key, and a room's is
 * nullable but drives the draw, so silently nulling it would change which briefs
 * that room can pull.
 */
export class ModelingOnly1754700500000 implements MigrationInterface {
  name = 'ModelingOnly1754700500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
      Created if missing rather than assumed.

      The seed that inserted it is a migration that has already run everywhere
      this will run, but a database restored from before it — or one seeded by
      hand — would otherwise fail here with a null id and a confusing error far
      from the cause.
    */
    await queryRunner.query(`
      INSERT INTO "categories" ("slug", "name", "description", "sort_order")
      SELECT 'modeling', 'Modeling', 'Build the form. Topology, proportion, silhouette.', 0
      WHERE NOT EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'modeling')
    `);

    const rows: Array<{ id: string }> = await queryRunner.query(
      `SELECT "id" FROM "categories" WHERE "slug" = 'modeling'`,
    );
    const id = rows[0]?.id;
    // The INSERT above guarantees a row; failing loudly here beats passing
    // `undefined` into the UPDATEs, which would silently match nothing.
    if (!id) throw new Error('ModelingOnly: the modeling category is missing after seeding it');

    // Repoint first, delete second. The other order is a foreign key violation.
    await queryRunner.query(`UPDATE "challenges" SET "category_id" = $1 WHERE "category_id" <> $1`, [id]);
    await queryRunner.query(
      `UPDATE "rooms" SET "category_id" = $1 WHERE "category_id" IS NOT NULL AND "category_id" <> $1`,
      [id],
    );
    // Nullable and purely cosmetic on a profile, so it is cleared rather than
    // rewritten — claiming everyone's favourite discipline is Modeling would be
    // inventing data.
    await queryRunner.query(
      `UPDATE "users" SET "favorite_category_id" = NULL WHERE "favorite_category_id" <> $1`,
      [id],
    );

    await queryRunner.query(`DELETE FROM "categories" WHERE "id" <> $1`, [id]);
  }

  /**
   * Restores the other thirteen.
   *
   * What cannot be restored is which category each challenge used to be in —
   * that association was overwritten above and nothing recorded it. Reverting
   * gives back the list, not the assignments, and everything stays on Modeling
   * until a manager moves it. Worth knowing before running it.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const categories: Array<[string, string, string]> = [
      ['sculpting', 'Sculpting', 'Shape it by hand. Form, anatomy, detail.'],
      ['texturing', 'Texturing', 'Surface and material. Wear, grime, story.'],
      ['lighting', 'Lighting', 'Mood and readability. Key, fill, rim.'],
      ['rendering', 'Rendering', 'The final image. Composition and finish.'],
      ['animation', 'Animation', 'Motion and timing. Weight and intent.'],
      ['rigging', 'Rigging', 'Controls that make a model performable.'],
      ['vfx', 'VFX', 'Simulation and effects. Smoke, fire, cloth.'],
      ['geonodes', 'Geometry Nodes', 'Procedural systems and scattering.'],
      ['hardsurface', 'Hard Surface', 'Machined forms. Panels, bevels, edges.'],
      ['character', 'Character', 'People and creatures, from block-in to finish.'],
      ['environment', 'Environment', 'Place and scale. Terrain, architecture, set.'],
      ['productviz', 'Product Viz', 'Clean, commercial presentation of an object.'],
      ['materials', 'Materials', 'Shaders and procedural surfacing.'],
    ];

    for (const [index, [slug, name, description]] of categories.entries()) {
      await queryRunner.query(
        `INSERT INTO "categories" ("slug", "name", "description", "sort_order")
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (SELECT 1 FROM "categories" WHERE "slug" = $1)`,
        [slug, name, description, index + 1],
      );
    }
  }
}
