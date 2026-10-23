import pg from 'pg';

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
  const raw: DB & { close(): Promise<void> } = {
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
  return { ...receiptDb(raw), close: raw.close };
}

/** Apply transaction-local settings on every checkout, safe with Supavisor pooling.
 * No connection or elevated role is held while calling Auth, Storage, or OpenAI.
 */
export function receiptDb(db: DB, userId?: string): DB {
  const transaction: DB['transaction'] = (fn) =>
    db.transaction(async (tx) => {
      await tx.query('SET LOCAL search_path = groceries, pg_catalog');
      if (userId !== undefined) {
        await tx.query('SET LOCAL ROLE receipts_api');
        await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: userId, role: 'authenticated' }),
        ]);
      }
      return fn(tx);
    });
  return {
    query: (sql, args) => transaction((tx) => tx.query(sql, args)),
    transaction,
  };
}
