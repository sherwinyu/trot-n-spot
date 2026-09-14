import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { receiptDb, type DB } from '../src/db.ts';
export const userA = '11111111-1111-4111-8111-111111111111';
export const userB = '22222222-2222-4222-8222-222222222222';
export async function createTestDatabase() {
  const pg = new PGlite();
  const migrations = new URL('../../../supabase/migrations/', import.meta.url);
  const migration = (await readdir(migrations)).find((f) =>
    f.endsWith('_groceries_supabase_store.sql'),
  )!;
  const shim = (
    await readFile(
      new URL('../../../supabase/tests/supabase-shim.sql', import.meta.url),
      'utf8',
    )
  ).replace('create extension if not exists pgcrypto;', '');
  await pg.exec(shim);
  await pg.exec(
    'BEGIN;\n' +
      (await readFile(new URL(migration, migrations), 'utf8')) +
      '\nCOMMIT;',
  );
  await pg.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [userA, userB]);
  const wrap = (client: any): DB => ({
    query: (sql, params) => client.query(sql, params),
    transaction: (fn) => fn(wrap(client)),
  });
  const raw: DB = {
    query: (sql, params) => pg.query(sql, params),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
  };
  return { pg, raw, db: receiptDb(raw) };
}
