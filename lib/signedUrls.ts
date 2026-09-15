import { supabase } from '@/lib/supabase';
import { cacheGet, cacheSet } from '@/lib/offline';

const SIGNED_URL_LIFETIME_SECONDS = 6 * 60 * 60;
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const PERSIST_KEY = 'signed-urls';

type CachedSignedUrl = {
  url: string;
  expiresAt: number;
};

// Signed URLs are persisted so a cold start with no network can still hand
// expo-image a source: the bytes live in its disk cache keyed by storage
// path, so even an expired URL renders. The Supabase call only happens
// when the URL is missing or about to expire.
const signedUrlCache = new Map<string, CachedSignedUrl>();
const inFlightRequests = new Map<string, Promise<string>>();
let cacheGeneration = 0;
let hydration: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function hydrateSignedPhotoUrlCache(): Promise<void> {
  if (!hydration) {
    const generation = cacheGeneration;
    hydration = cacheGet<Record<string, CachedSignedUrl>>(PERSIST_KEY)
      .then((stored) => {
        if (!stored || generation !== cacheGeneration) return;
        for (const [path, entry] of Object.entries(stored)) {
          if (!signedUrlCache.has(path)) signedUrlCache.set(path, entry);
        }
      })
      .catch(() => {});
  }
  return hydration;
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    cacheSet(PERSIST_KEY, Object.fromEntries(signedUrlCache)).catch(() => {});
  }, 250);
}

function isFresh(cached: CachedSignedUrl): boolean {
  return cached.expiresAt > Date.now() + EXPIRY_MARGIN_MS;
}

export function peekSignedPhotoUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  const cached = signedUrlCache.get(storagePath);
  if (!cached || !isFresh(cached)) return null;
  return cached.url;
}

// Last known URL regardless of expiry — good enough for expo-image to
// consult its disk cache when we can't reach Supabase to re-sign.
export function peekStaleSignedPhotoUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  return signedUrlCache.get(storagePath)?.url ?? null;
}

export async function getSignedPhotoUrl(storagePath: string): Promise<string> {
  const cached = peekSignedPhotoUrl(storagePath);
  if (cached) return cached;

  const existingRequest = inFlightRequests.get(storagePath);
  if (existingRequest) return existingRequest;

  const requestGeneration = cacheGeneration;
  const request: Promise<string> = supabase.storage
    .from('quest-photos')
    .createSignedUrl(storagePath, SIGNED_URL_LIFETIME_SECONDS)
    .then(({ data, error }) => {
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Photo URL was not returned');

      if (requestGeneration === cacheGeneration) {
        signedUrlCache.set(storagePath, {
          url: data.signedUrl,
          expiresAt: Date.now() + SIGNED_URL_LIFETIME_SECONDS * 1000,
        });
        schedulePersist();
      }
      return data.signedUrl;
    })
    .finally(() => {
      if (inFlightRequests.get(storagePath) === request) {
        inFlightRequests.delete(storagePath);
      }
    });

  inFlightRequests.set(storagePath, request);
  return request;
}

// In-memory only; the persisted copy is removed with the other
// `offline:cache:*` entries by `cacheClearAll` on sign-out.
export function clearSignedPhotoUrlCache(): void {
  cacheGeneration += 1;
  signedUrlCache.clear();
  inFlightRequests.clear();
  hydration = null;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}
