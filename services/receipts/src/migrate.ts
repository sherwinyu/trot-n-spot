import { config } from './config.ts';
import { createDb, migrate } from './db.ts';
const db = createDb(config().DATABASE_URL);
try {
  await migrate(db);
  console.log('Database schema ready.');
} finally {
  await db.close();
}
