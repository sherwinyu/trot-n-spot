import { supabase } from '@/lib/supabase';
import { createPhotoVariants, uploadPhoto } from '@/lib/photos';
import { getCommentPhotoPaths } from '@/lib/photoVariants';
import { COMMENT_MAX_LENGTH, insertComment } from '@/lib/questActivity';
import { QuestComment } from '@/types/database';

export type PhotoCommentInput = {
  commentId: string;
  questId: string;
  userId: string;
  photoUri: string;
  body?: string;
};

export async function savePhotoComment(input: PhotoCommentInput, completion?: { journeyId: string | null }): Promise<QuestComment> {
  const body = (input.body ?? '').trim();
  if (body.length > COMMENT_MAX_LENGTH) throw new Error('Captions must be 500 characters or less');
  const findExisting = async () => {
    const { data, error } = await supabase.from('quest_comments').select('*')
      .eq('id', input.commentId).eq('quest_id', input.questId).eq('author_id', input.userId).maybeSingle();
    if (error) throw error;
    return data as QuestComment | null;
  };
  // A lost response must not post another comment or require the local photo again.
  const existing = await findExisting();
  if (existing) {
    if (completion) await promotePhotoComment(input.questId, input.commentId, completion.journeyId);
    return existing;
  }

  const paths = getCommentPhotoPaths(input.userId, input.questId, input.commentId);
  const variants = await createPhotoVariants(input.photoUri);
  await uploadPhoto(variants.fullUri, paths.fullPath);
  await uploadPhoto(variants.detailUri, paths.detailPath);
  await uploadPhoto(variants.thumbnailUri, paths.thumbnailPath);
  if (completion) {
    // Insert and promote in one transaction so push delivery sees the final state.
    const { data, error } = await supabase.rpc('complete_quest_with_photo_comment', {
      p_quest_id: input.questId, p_comment_id: input.commentId, p_body: body,
      p_photo_path: paths.detailPath, p_photo_full_path: paths.fullPath,
      p_photo_thumbnail_path: paths.thumbnailPath, p_journey_id: completion.journeyId,
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.comment as QuestComment;
  }
  try {
    return await insertComment({
      id: input.commentId, quest_id: input.questId, author_id: input.userId, body,
      photo_path: paths.detailPath, photo_full_path: paths.fullPath, photo_thumbnail_path: paths.thumbnailPath,
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      const saved = await findExisting();
      if (saved) return saved;
    }
    throw error;
  }
}

export async function promotePhotoComment(questId: string, commentId: string, journeyId?: string | null): Promise<void> {
  const { data, error } = await supabase.rpc('complete_quest_from_comment', {
    p_quest_id: questId, p_comment_id: commentId, p_journey_id: journeyId ?? null,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}
