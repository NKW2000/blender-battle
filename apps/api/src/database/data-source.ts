import 'reflect-metadata';

import { join } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { migrations } from './migrations';

// The TypeORM CLI runs outside the Nest container, so it loads env itself. Same
// search order as ConfigModule: app-local first, then the monorepo root.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });
loadEnv({ path: join(__dirname, '../../../../.env.local') });
loadEnv({ path: join(__dirname, '../../../../.env') });

/**
 * CLI-only DataSource: migration generate/run/revert.
 * The application gets its DataSource from TypeOrmModule.forRootAsync instead.
 *
 * `synchronize` is absent, not merely false — schema changes travel through
 * reviewed, reversible migration files in every environment including local dev.
 * Auto-sync silently drops columns it does not recognise.
 */
/**
 * Connection parts, from a URL when one is given.
 *
 * Mirrors `AppConfig.database`, because migrations have to reach the same
 * database the application will. Hosted Postgres is handed out as a single
 * connection string, and the production image is pruned to `dist` plus runtime
 * dependencies — so migrations are run from a checkout with the target's URL in
 * the environment, and that has to work without also unpacking it by hand.
 */
function connection() {
  const url = process.env.DATABASE_URL;

  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 5432,
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.slice(1),
      ssl:
        process.env.DATABASE_SSL === 'true' || /sslmode=(require|verify)/.test(parsed.search)
          ? { rejectUnauthorized: false }
          : false,
    };
  }

  return {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    username: process.env.DATABASE_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'postgres',
    database: process.env.DATABASE_NAME ?? 'blender_battle',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

export default new DataSource({
  type: 'postgres',
  ...connection(),
  entities: ['src/**/*.entity.ts'],
  /*
    The same list the application uses, not a second glob.

    Two ways of finding the same migrations is one way too many: this glob also
    matched the list's own `index.ts`, which re-exports every class, so the CLI
    saw all twenty twice and refused to run any of them. Importing the list
    means the CLI and the running application can never disagree about what
    exists or in what order.
  */
  migrations,
  migrationsTableName: 'migrations',
  /**
   * Each migration in its own transaction, not one transaction for the batch.
   * Postgres refuses to use an enum value in the same transaction that added it,
   * so a two-step "add the value, then use it" change is only possible this way.
   */
  migrationsTransactionMode: 'each',
});
