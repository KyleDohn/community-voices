import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

export const connect = (databaseUrl: string) => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  return { pool, db: drizzle(pool) };
};
export type Database = ReturnType<typeof connect>['db'];

export const runMigrations = (db: Database) => migrate(db, { migrationsFolder: MIGRATIONS_DIR });

export const probe = async (db: Database) => {
  await db.execute(sql`select 1`);
  return true;
};
