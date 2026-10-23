export type PhotoVariantPaths = {
  fullPath: string;
  detailPath: string;
  thumbnailPath: string;
};

export type PhotoVariantKind = 'quest' | 'completion';

export function getCommentPhotoPaths(userId: string, questId: string, commentId: string): PhotoVariantPaths {
  const prefix = `${userId}/${questId}/comments/${commentId}`;
  return {
    fullPath: `${prefix}/full.jpg`,
    detailPath: `${prefix}/detail.jpg`,
    thumbnailPath: `${prefix}/thumbnail.jpg`,
  };
}

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
