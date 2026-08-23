export type PhotoVariantPaths = {
  fullPath: string;
  detailPath: string;
  thumbnailPath: string;
};

export type PhotoVariantKind = 'quest' | 'completion';

// Every file name is immutable. Stable paths let the image client use the
// storage path as a persistent cache key even though signed URLs rotate.
export function getPhotoVariantPaths(
  userId: string,
  questId: string,
  kind: PhotoVariantKind
): PhotoVariantPaths {
  const prefix = `${userId}/${questId}`;
  const namePrefix = kind === 'completion' ? 'completion-' : '';

  return {
    fullPath: `${prefix}/${namePrefix}full.jpg`,
    detailPath: `${prefix}/${namePrefix}detail.jpg`,
    thumbnailPath: `${prefix}/${namePrefix}thumbnail.jpg`,
  };
}
