import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const appToken = randomBytes(32).toString('hex'),
  password = randomBytes(24).toString('hex');
const template = await readFile(
  new URL('./.env.example', import.meta.url),
  'utf8',
);
const value = template
  .replace('APP_TOKEN=GENERATE_WITH_NPM_RUN_SETUP', `APP_TOKEN=${appToken}`)
  .replaceAll('GENERATE_WITH_NPM_RUN_SETUP', password);
try {
  await writeFile(new URL('./.env', import.meta.url), value, {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    'Created .env. Add OPENAI_API_KEY, then run npm run receipts:up.',
  );
} catch (error) {
  if (error.code === 'EEXIST')
    console.log('.env already exists; kept it unchanged.');
  else throw error;
}
