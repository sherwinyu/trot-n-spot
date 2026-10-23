import { setTimeout } from 'node:timers/promises';
import { config } from './config.ts';
import { createDb } from './db.ts';
import { storage } from './storage.ts';
import { openAIExtractor } from './extraction.ts';
import { processOne } from './worker.ts';
const env = config();
if (!env.OPENAI_API_KEY)
  throw new Error('Set OPENAI_API_KEY before starting the extraction worker.');
const db = createDb(env.DATABASE_URL),
  images = storage(env),
  extract = openAIExtractor(env.OPENAI_API_KEY, env.OPENAI_MODEL);
let running = true;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    running = false;
  });
console.log('Receipt worker ready.');
while (running) {
  try {
    if (!(await processOne(db, images, extract))) await setTimeout(2000);
  } catch (error) {
    console.error(
      'Worker iteration failed',
      error instanceof Error ? error.message : 'Unknown error',
    );
    await setTimeout(2000);
  }
}
await db.close();
