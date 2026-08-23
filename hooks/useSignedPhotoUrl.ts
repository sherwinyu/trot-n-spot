import { useEffect, useState } from 'react';
import { getSignedPhotoUrl, peekSignedPhotoUrl } from '@/lib/signedUrls';

export function useSignedPhotoUrl(storagePath: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => peekSignedPhotoUrl(storagePath));

  useEffect(() => {
    let active = true;
    setUrl(peekSignedPhotoUrl(storagePath));

    if (!storagePath) return () => {
      active = false;
    };

    getSignedPhotoUrl(storagePath)
      .then((signedUrl) => {
        if (active) setUrl(signedUrl);
      })
      .catch(() => {
        if (active) setUrl(null);
      });

    return () => {
      active = false;
    };
  }, [storagePath]);

  return url;
}
