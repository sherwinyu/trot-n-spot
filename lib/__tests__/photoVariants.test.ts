import { getCommentPhotoPaths, getPhotoVariantPaths } from '../photoVariants';

describe('getPhotoVariantPaths', () => {
  it('isolates every reply so retakes and different photos cannot overwrite each other', () => {
    expect(getCommentPhotoPaths('user', 'quest', 'comment')).toEqual({
      fullPath: 'user/quest/comments/comment/full.jpg',
      detailPath: 'user/quest/comments/comment/detail.jpg',
      thumbnailPath: 'user/quest/comments/comment/thumbnail.jpg',
    });
    expect(getCommentPhotoPaths('user', 'quest', 'other')).not.toEqual(getCommentPhotoPaths('user', 'quest', 'comment'));
  });
  it('builds immutable paths for all original quest variants', () => {
    expect(getPhotoVariantPaths('user-1', 'quest-1', 'quest')).toEqual({
      fullPath: 'user-1/quest-1/full.jpg',
      detailPath: 'user-1/quest-1/detail.jpg',
      thumbnailPath: 'user-1/quest-1/thumbnail.jpg',
    });
  });

  it('keeps completion variants distinct in the same quest folder', () => {
    expect(getPhotoVariantPaths('user-2', 'quest-2', 'completion')).toEqual({
      fullPath: 'user-2/quest-2/completion-full.jpg',
      detailPath: 'user-2/quest-2/completion-detail.jpg',
      thumbnailPath: 'user-2/quest-2/completion-thumbnail.jpg',
    });
  });
});
