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
    /*
      `users` needs nothing.

      It once carried a `favorite_category_id`, and this cleared it. That column
      was a placeholder that never got wired to anything, and DropReservedColumns
      — which sorts earlier, so it has always already run by the time this does —
      removes it. Clearing it here could therefore only ever fail, and did: every
      migration from a fresh database stopped on `column "favorite_category_id"
      does not exist`, which on a serverless deployment surfaced as an API that
      would not start at all.
    */
    await queryRunner.query(`DELETE FROM "categories" WHERE "id" <> $1`, [id]);
  }

  /**
   * Restores the other thirteen.
   *
   * Copied verbatim from the Phase 2 seed — slug, name, description and the
   * original `sort_order` — rather than retyped. An approximation here would
   * restore categories under different slugs, and the slug is what filter links
   * and any saved URL are built from, so "roughly the same list" would be a
   * different list to every reader.
   *
   * What cannot be restored is which category each challenge used to be in:
   * that association was overwritten above and nothing recorded it. Reverting
   * gives back the list, not the assignments, and everything stays on Modeling
   * until a manager moves it. Worth knowing before running it.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    // [slug, name, description, sort_order] — sort_order is the row's index in
    // the original seed, so the restored list orders as it first did.
    const categories: Array<[string, string, string, number]> = [
      ['sculpting', 'Sculpting', 'Push clay. Organic shapes and high-frequency detail.', 1],
      ['animation', 'Animation', 'Make it move with weight and timing.', 2],
      ['rigging', 'Rigging', 'Build the controls someone else can animate with.', 3],
      ['lighting', 'Lighting', 'Shape the scene with light alone.', 4],
      ['materials', 'Materials', 'Author surfaces that read as the real thing.', 5],
      ['texturing', 'Texturing', 'Paint and project detail onto the surface.', 6],
      ['geometry-nodes', 'Geometry Nodes', 'Solve it procedurally. No manual placement.', 7],
      ['environment', 'Environment', 'Build a place, not an object.', 8],
      ['hard-surface', 'Hard Surface', 'Panels, bevels, and mechanical precision.', 9],
      ['character', 'Character', 'Someone who could hold a scene on their own.', 10],
      [
        'product-visualization',
        'Product Visualization',
        'Sell the object. Clean, deliberate, commercial.',
        11,
      ],
      ['vfx', 'VFX', 'Simulation, destruction, and effects work.', 12],
      ['rendering', 'Rendering', 'Camera, composition, and the final frame.', 13],
    ];

    for (const [slug, name, description, sortOrder] of categories) {
      await queryRunner.query(
        `INSERT INTO "categories" ("slug", "name", "description", "sort_order")
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (SELECT 1 FROM "categories" WHERE "slug" = $1)`,
        [slug, name, description, sortOrder],
      );
    }
  }
}
