import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSignedPhotoUrl,
  hydrateSignedPhotoUrlCache,
  invalidateSignedPhotoUrl,
  peekSignedPhotoUrl,
  peekStaleSignedPhotoUrl,
} from '@/lib/signedUrls';
import { useSync } from '@/providers/SyncProvider';

export type SignedPhotoUrl = {
  url: string | null;
  // Call when the image at `url` failed to load. Re-signs once so an expired
  // or badly-signed URL is replaced; a second failure for the same path is
  // treated as a missing file and left to the caller's fallback.
  reportLoadFailure: (failedUrl: string) => void;
};

// Resolves to a fresh signed URL when Supabase is reachable, otherwise the
// last URL we ever had for this path (expo-image serves the bytes from its
// disk cache regardless of the URL's expiry). Re-signs when we come online.
export function useSignedPhotoUrl(storagePath: string | null): SignedPhotoUrl {
  const { isOnline } = useSync();
  const [url, setUrl] = useState<string | null>(
    () => peekSignedPhotoUrl(storagePath) ?? peekStaleSignedPhotoUrl(storagePath)
  );
  const retriedRef = useRef(false);
  const currentPathRef = useRef(storagePath);

  useEffect(() => {
    let active = true;
    retriedRef.current = false;
    currentPathRef.current = storagePath;
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

  const reportLoadFailure = useCallback(
    (failedUrl: string) => {
      if (!storagePath || isOnline === false || retriedRef.current) return;
      retriedRef.current = true;
      invalidateSignedPhotoUrl(storagePath, failedUrl);
      getSignedPhotoUrl(storagePath)
        .then((signedUrl) => {
          if (currentPathRef.current === storagePath && signedUrl !== failedUrl) setUrl(signedUrl);
        })
        .catch(() => {});
    },
    [storagePath, isOnline]
  );

  return { url, reportLoadFailure };
}
