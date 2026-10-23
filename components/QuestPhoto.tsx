import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { ImageStyle, Pressable, StyleProp, StyleSheet } from 'react-native';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { ImageViewerModal } from '@/components/ImageViewerModal';

type QuestPhotoProps = {
  storagePath: string | null;
  // Local file for a quest that hasn't synced yet; skips signing entirely.
  localUri?: string | null;
  previewStoragePath?: string | null;
  style: StyleProp<ImageStyle>;
  fallback?: ReactNode;
  accessibilityLabel?: string;
};

export function QuestPhoto({
  storagePath,
  localUri = null,
  previewStoragePath = storagePath,
  style,
  fallback = null,
  accessibilityLabel,
}: QuestPhotoProps) {
  const { url: signedUrl, reportLoadFailure } = useSignedPhotoUrl(localUri ? null : storagePath);
  const [failed, setFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const previewPath = previewStoragePath ?? storagePath;
  const { url: previewUrl, reportLoadFailure: reportPreviewFailure } = useSignedPhotoUrl(
    previewOpen && !localUri ? previewPath : null
  );
  const source = useMemo(() => {
    if (localUri) return { uri: localUri };
    if (signedUrl && storagePath) return { uri: signedUrl, cacheKey: `quest-photo:${storagePath}` };
    return null;
  }, [localUri, signedUrl, storagePath]);

  useEffect(() => {
    setFailed(false);
  }, [localUri, storagePath, signedUrl]);

  useEffect(() => {
    setPreviewOpen(false);
    setFailedPreviewUrl(null);
  }, [localUri, storagePath, previewStoragePath]);

  if (!source || failed) return <>{fallback}</>;

  const previewSource = !localUri && previewUrl && previewUrl !== failedPreviewUrl
    ? { uri: previewUrl, cacheKey: `quest-photo:${previewPath}` }
    : source;

  // Keyed by URI so a late error from a superseded (expired) URL can't hide
  // the image that replaced it.
  return (
    <>
      <Pressable
        style={[style, { overflow: 'hidden' }]}
        accessibilityRole="button"
        accessibilityLabel={`View ${accessibilityLabel ?? 'photo'} full screen`}
        onPress={(event) => {
          event.stopPropagation();
          setFailedPreviewUrl(null);
          setPreviewOpen(true);
        }}
      >
        <Image
          key={source.uri}
          source={source}
          style={StyleSheet.absoluteFill}
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
      </Pressable>
      {previewOpen && (
        <ImageViewerModal
          source={previewSource}
          accessibilityLabel={accessibilityLabel}
          onClose={() => setPreviewOpen(false)}
          onError={() => {
            if (!localUri && previewSource.uri === previewUrl) {
              setFailedPreviewUrl(previewUrl);
              reportPreviewFailure(previewUrl);
            }
          }}
        />
      )}
    </>
  );
}
