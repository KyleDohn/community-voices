import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { connect, probe, runMigrations } from './client';

const { pool, db } = connect(process.env.DATABASE_URL!);
afterAll(() => pool.end());

describe('database', () => {
  it('applies migrations and enables pgvector', async () => {
    await runMigrations(db);
    const { rows } = await db.execute<{ extversion: string }>(
      sql`select extversion from pg_extension where extname = 'vector'`,
    );
    expect(rows[0]?.extversion).toBe('0.8.7');
  });

  it('answers the health probe', async () => {
    await expect(probe(db)).resolves.toBe(true);
  });
});
