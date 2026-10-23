import { copyFile, chmod, constants } from 'node:fs/promises';
try {
  const target = new URL('./.env', import.meta.url);
  await copyFile(
    new URL('./.env.example', import.meta.url),
    target,
    constants.COPYFILE_EXCL,
  );
  await chmod(target, 0o600);
  console.log(
    'Created services/receipts/.env. Fill in Supabase and OpenAI credentials; see docs/groceries.md.',
  );
} catch (error) {
  if (error.code === 'EEXIST')
    console.log(
      '.env already exists; kept unchanged. For the Supabase migration, use the new .env.example fields.',
    );
  else throw error;
}
