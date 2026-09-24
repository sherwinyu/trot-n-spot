import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { ImageStyle, StyleProp } from 'react-native';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';

type QuestPhotoProps = {
  storagePath: string | null;
  // Local file for a quest that hasn't synced yet; skips signing entirely.
  localUri?: string | null;
  style: StyleProp<ImageStyle>;
  fallback?: ReactNode;
  accessibilityLabel?: string;
};

export function QuestPhoto({
  storagePath,
  localUri = null,
  style,
  fallback = null,
  accessibilityLabel,
}: QuestPhotoProps) {
  const { url: signedUrl, reportLoadFailure } = useSignedPhotoUrl(storagePath);
  const [failed, setFailed] = useState(false);
  const source = useMemo(() => {
    if (localUri) return { uri: localUri };
    if (signedUrl && storagePath) return { uri: signedUrl, cacheKey: `quest-photo:${storagePath}` };
    return null;
  }, [localUri, signedUrl, storagePath]);

  useEffect(() => {
    setFailed(false);
  }, [localUri, storagePath, signedUrl]);

  if (!source || failed) return <>{fallback}</>;

  // Keyed by URI so a late error from a superseded (expired) URL can't hide
  // the image that replaced it.
  return (
    <Image
      key={source.uri}
      source={source}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={localUri ?? storagePath ?? undefined}
      transition={100}
      accessibilityLabel={accessibilityLabel}
      onError={() => {
        setFailed(true);
        if (!localUri) reportLoadFailure(source.uri);
      }}
    />
  );
}
