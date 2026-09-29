import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const envPath = new URL('../services/receipts/.env', import.meta.url);
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'OPENAI_API_KEY'];

try {
  const env = parseEnv(readFileSync(envPath, 'utf8'));
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Fill services/receipts/.env: ${missing.join(', ')}`);
  if (env.SUPABASE_URL !== 'https://xbegbjicfgsozazlbysc.supabase.co')
    throw new Error('SUPABASE_URL must point to the TrotNSpot production project.');
  let db;
  try { db = new URL(env.DATABASE_URL); }
  catch { throw new Error('DATABASE_URL must be a valid Postgres connection URL.'); }
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.password)
    throw new Error('DATABASE_URL needs a Postgres URL with its database password.');
  if (!['require', 'verify-ca', 'verify-full'].includes(db.searchParams.get('sslmode')))
    throw new Error('Use TLS in DATABASE_URL: append ?sslmode=require (or verify-full).');
  if (process.argv.includes('--check')) {
    console.log('Receipt deployment credentials are present; values were not displayed.');
    process.exit(0);
  }
  // Secrets travel on stdin, never in command arguments, build context, or logs.
  const input = required.map((name) => `${name}=${JSON.stringify(env[name])}`).join('\n');
  const imported = spawnSync('fly', ['secrets', 'import', '--app', 'trotnspot-receipts', '--stage'], {
    cwd: root, input, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8',
  });
  if (imported.status !== 0)
    throw new Error('Fly secret import failed. Check Fly authentication and app access; secret output was withheld.');
  console.log('Receipt service secrets staged on Fly.');
  const deployed = spawnSync('fly', ['deploy', '--config', 'fly.receipts.toml', '--remote-only', '--ha=false', '--yes'], {
    cwd: root, stdio: 'inherit',
  });
  process.exit(deployed.status ?? 1);
} catch (error) {
  // Deliberately avoid echoing parser/OS errors that may contain secret text.
  if (error instanceof Error && /^(Fill |SUPABASE_URL |DATABASE_URL |Use TLS |Fly secret)/.test(error.message))
    console.error(error.message);
  else console.error('Could not read receipt deployment configuration. Check services/receipts/.env.');
  process.exit(1);
}
