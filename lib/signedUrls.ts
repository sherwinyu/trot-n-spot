import { supabase } from '@/lib/supabase';

// Supabase signs URLs with a fresh token every call, even for the same
// path — so without this cache every re-render/refetch/focus event hands
// the Image component a brand-new URI and defeats its cache, forcing a
// full re-download. Memoizing by path keeps the URI stable so the same
// photo only ever downloads once per app session.
const SIGNED_URL_TTL_SECONDS = 3600;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type CacheEntry = {
  url: string;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

export function getSignedPhotoUrl(path: string, bucket = 'quest-photos'): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.url);
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    .then(({ data }) => {
      const url = data?.signedUrl ?? null;
      if (url) {
        cache.set(key, {
          url,
          expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 - REFRESH_MARGIN_MS,
        });
      }
      return url;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
