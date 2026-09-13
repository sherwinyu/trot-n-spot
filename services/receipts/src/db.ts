import pg from 'pg';
import { readFile } from 'node:fs/promises';

export interface DB {
  query(
    sql: string,
    params?: any[],
  ): Promise<{ rows: any[]; rowCount?: number | null }>;
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
}
export function createDb(url: string): DB & { close(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: url, max: 8 });
  const wrap = (client: pg.PoolClient): DB => ({
    query: (sql, args) => client.query(sql, args),
    transaction: (fn) => fn(wrap(client)),
  });
  return {
    query: (sql, args) => pool.query(sql, args),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
export async function migrate(db: DB) {
  await db.query(
    await readFile(new URL('./schema.sql', import.meta.url), 'utf8'),
  );
}
