import { supabase } from '@/lib/supabase';

const SIGNED_URL_LIFETIME_SECONDS = 6 * 60 * 60;
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

type CachedSignedUrl = {
  url: string;
  expiresAt: number;
};

const signedUrlCache = new Map<string, CachedSignedUrl>();
const inFlightRequests = new Map<string, Promise<string>>();
let cacheGeneration = 0;

export function peekSignedPhotoUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  const cached = signedUrlCache.get(storagePath);
  if (!cached || cached.expiresAt <= Date.now() + EXPIRY_MARGIN_MS) return null;
  return cached.url;
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

export function clearSignedPhotoUrlCache(): void {
  cacheGeneration += 1;
  signedUrlCache.clear();
  inFlightRequests.clear();
}
