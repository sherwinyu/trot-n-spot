import { config } from './config.ts';
import { createDb } from './db.ts';
import { storage } from './storage.ts';
import { supabaseAuth } from './auth.ts';
import { buildApp } from './app.ts';
const env = config();
const db = createDb(env.DATABASE_URL);
const app = buildApp(
  db,
  storage(env),
  supabaseAuth(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
  env.CORS_ORIGINS.split(',').filter(Boolean),
);
await app.listen({ host: '0.0.0.0', port: env.PORT });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
