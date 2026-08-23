import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { ImageStyle, StyleProp } from 'react-native';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';

type QuestPhotoProps = {
  storagePath: string | null;
  style: StyleProp<ImageStyle>;
  fallback?: ReactNode;
  accessibilityLabel?: string;
};

export function QuestPhoto({
  storagePath,
  style,
  fallback = null,
  accessibilityLabel,
}: QuestPhotoProps) {
  const signedUrl = useSignedPhotoUrl(storagePath);
  const [failed, setFailed] = useState(false);
  const source = useMemo(
    () => signedUrl && storagePath
      ? { uri: signedUrl, cacheKey: `quest-photo:${storagePath}` }
      : null,
    [signedUrl, storagePath]
  );

  useEffect(() => {
    setFailed(false);
  }, [storagePath, signedUrl]);

  if (!source || failed) return <>{fallback}</>;

  return (
    <Image
      source={source}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={storagePath ?? undefined}
      transition={100}
      accessibilityLabel={accessibilityLabel}
      onError={() => setFailed(true)}
    />
  );
}
