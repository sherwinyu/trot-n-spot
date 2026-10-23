jest.mock('expo-crypto', () => {
  const crypto = require('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    getRandomValues: (value: Uint32Array) => crypto.randomFillSync(value),
    digest: async (_algorithm: string, value: ArrayBuffer) => {
      const bytes = crypto.createHash('sha256').update(Buffer.from(value)).digest();
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
});

import { Platform } from 'react-native';
import { installAuthCrypto } from '../authCrypto';
import { createClient } from '@supabase/supabase-js';

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

afterEach(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

it('generates S256 PKCE through the real Supabase client on a native runtime', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: undefined });
  installAuthCrypto();
  const store = new Map<string, string>();
  const client = createClient('https://example.supabase.co', 'public-test-key', {
    auth: {
      flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false,
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => { store.set(key, value); },
        removeItem: (key) => { store.delete(key); },
      },
    },
  });
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: 'quest://auth/callback', skipBrowserRedirect: true },
  });
  expect(error).toBeNull();
  const url = new URL(data.url!);
  expect(url.searchParams.get('code_challenge_method')).toBe('s256');
  expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const verifier = JSON.parse(store.get('sb-example-auth-token-code-verifier')!);
  expect(verifier).toHaveLength(112);
  expect(data.url).not.toContain(verifier);
});

it('implements the RFC 7636 SHA-256 test vector', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: undefined });
  installAuthCrypto();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'));
  expect(Buffer.from(digest).toString('base64url')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

it('preserves an existing WebCrypto implementation', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const existing = { subtle: { digest: jest.fn() }, getRandomValues: jest.fn() };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: existing });
  installAuthCrypto();
  expect(globalThis.crypto).toBe(existing);
});
