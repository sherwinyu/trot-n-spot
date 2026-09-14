import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabaseAuth } from '../src/auth.ts';
import { storage } from '../src/storage.ts';
import type { Config } from '../src/config.ts';
import { userA } from './database.ts';

const env: Config = {
  DATABASE_URL: 'postgres://unused',
  SUPABASE_URL: 'https://project.test.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
  PORT: 3001,
  OPENAI_MODEL: 'test',
  CORS_ORIGINS: '',
};

test('Supabase Auth validates the supplied bearer with the configured project; invalid tokens fail closed', async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), `${env.SUPABASE_URL}/auth/v1/user`);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('apikey'), env.SUPABASE_SERVICE_ROLE_KEY);
    seen.push(headers.get('authorization')!);
    return headers.get('authorization') === 'Bearer valid-session'
      ? Response.json({
          id: userA,
          aud: 'authenticated',
          role: 'authenticated',
        })
      : Response.json({ msg: 'invalid JWT', code: 'bad_jwt' }, { status: 401 });
  };
  try {
    const authenticate = supabaseAuth(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
    );
    assert.equal(await authenticate('valid-session'), userA);
    assert.equal(await authenticate('forged-session'), null);
    assert.deepEqual(seen, ['Bearer valid-session', 'Bearer forged-session']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Supabase Storage preserves original bytes, verifies duplicate uploads, and signs private paths', async () => {
  const originalFetch = globalThis.fetch;
  const bytes = Buffer.from('synthetic original bytes');
  const key = `${userA}/receipt-id/hash`;
  const calls: { url: string; method: string }[] = [];
  let uploaded = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      method = init?.method ?? 'GET';
    calls.push({ url, method });
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    );
    if (url.includes('/object/sign/')) {
      assert.equal(JSON.parse(String(init?.body)).expiresIn, 300);
      return Response.json({
        signedURL: `/object/sign/grocery-receipts/${key}?token=test-signature`,
      });
    }
    if (method === 'POST') {
      assert.equal(new Headers(init?.headers).get('x-upsert'), 'false');
      assert.deepEqual(Buffer.from(init?.body as Uint8Array), bytes);
      if (uploaded)
        return Response.json(
          { statusCode: '409', error: 'Duplicate', message: 'Already exists' },
          { status: 409 },
        );
      uploaded = true;
      return Response.json({ Key: `grocery-receipts/${key}` });
    }
    return new Response(new Uint8Array(bytes));
  };
  try {
    const images = storage(env);
    await images.put(key, bytes, 'image/png');
    await images.put(key, bytes, 'image/png');
    assert.deepEqual(await images.get(key), bytes);
    assert.equal(
      await images.signedUrl(key),
      `${env.SUPABASE_URL}/storage/v1/object/sign/grocery-receipts/${key}?token=test-signature`,
    );
    assert.ok(calls.every((c) => c.url.includes(`grocery-receipts/${key}`)));
    assert.equal(calls.filter((c) => c.method === 'GET').length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
