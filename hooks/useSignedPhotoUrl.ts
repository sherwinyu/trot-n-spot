import { useEffect, useState } from 'react';
import { getSignedPhotoUrl } from '@/lib/signedUrls';

export function useSignedPhotoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    getSignedPhotoUrl(path).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}
