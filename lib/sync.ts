import { supabase } from '@/lib/supabase';
import { compressPhoto, uploadPhoto } from '@/lib/photos';
import { flushQueue, FlushHandlers } from '@/lib/offline';

// The actual server writes for each queued mutation type. Shared by the
// online paths in useCreateQuest/useCompleteQuest and the offline replay.

export async function syncCreateQuest(payload: {
  questId: string;
  packId: string;
  creatorId: string;
  assigneeId: string | null;
  mode: 'targeted' | 'open';
  journeyId: string | null;
  description: string | null;
  photoUri: string;
  locationLat: number | null;
  locationLng: number | null;
  createdAt?: string;
}): Promise<void> {
  const compressedUri = await compressPhoto(payload.photoUri);
  const photoPath = `${payload.creatorId}/${payload.questId}/original.jpg`;
  await uploadPhoto(compressedUri, photoPath);

  const { error } = await supabase.from('quests').insert({
    id: payload.questId,
    pack_id: payload.packId,
    creator_id: payload.creatorId,
    assignee_id: payload.assigneeId,
    mode: payload.mode,
    journey_id: payload.journeyId,
    description: payload.description,
    photo_path: photoPath,
    location_lat: payload.locationLat,
    location_lng: payload.locationLng,
    ...(payload.createdAt ? { created_at: payload.createdAt } : {}),
  });

  // Replays can double-fire if the request succeeded but the response
  // was lost; a duplicate-key error means it's already synced.
  if (error && error.code !== '23505') throw error;
}

export async function syncCompleteQuest(payload: {
  questId: string;
  userId: string;
  journeyId: string | null;
  photoUri: string;
  completedAt?: string;
}): Promise<void> {
  const compressedUri = await compressPhoto(payload.photoUri);
  const photoPath = `${payload.userId}/${payload.questId}/completion.jpg`;
  await uploadPhoto(compressedUri, photoPath);

  const { data, error } = await supabase.rpc('complete_quest', {
    p_quest_id: payload.questId,
    p_photo_path: photoPath,
    p_journey_id: payload.journeyId,
  });

  if (error) throw error;
  if (data?.error && data.error !== 'Quest is already completed') {
    throw new Error(data.error);
  }
}

const handlers: FlushHandlers = {
  create_quest: syncCreateQuest,
  complete_quest: syncCompleteQuest,
};

export function flushPendingMutations(): Promise<number> {
  return flushQueue(handlers);
}
