import { useEffect, useState } from 'react';
import {
  getSignedPhotoUrl,
  hydrateSignedPhotoUrlCache,
  peekSignedPhotoUrl,
  peekStaleSignedPhotoUrl,
} from '@/lib/signedUrls';
import { useSync } from '@/providers/SyncProvider';

// Resolves to a fresh signed URL when Supabase is reachable, otherwise the
// last URL we ever had for this path (expo-image serves the bytes from its
// disk cache regardless of the URL's expiry). Re-signs when we come online.
export function useSignedPhotoUrl(storagePath: string | null): string | null {
  const { isOnline } = useSync();
  const [url, setUrl] = useState<string | null>(
    () => peekSignedPhotoUrl(storagePath) ?? peekStaleSignedPhotoUrl(storagePath)
  );

  useEffect(() => {
    let active = true;
    if (!storagePath) {
      setUrl(null);
      return () => {
        active = false;
      };
    }

    const fresh = peekSignedPhotoUrl(storagePath);
    setUrl(fresh ?? peekStaleSignedPhotoUrl(storagePath));
    if (fresh) return () => {
      active = false;
    };

    hydrateSignedPhotoUrlCache()
      .then(() => {
        if (!active) return;
        const stale = peekStaleSignedPhotoUrl(storagePath);
        if (stale) setUrl(stale);
        if (isOnline === false) return null;
        return getSignedPhotoUrl(storagePath);
      })
      .then((signedUrl) => {
        if (active && signedUrl) setUrl(signedUrl);
      })
      .catch(() => {
        // Keep whatever we already have; the stale URL is still usable offline.
      });

    return () => {
      active = false;
    };
  }, [storagePath, isOnline]);

  return url;
}
