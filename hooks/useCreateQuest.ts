import { useState, useCallback } from 'react';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/providers/SyncProvider';
import { getCurrentLocation } from '@/lib/location';
import { syncCreateQuest } from '@/lib/sync';
import { enqueue, isNetworkError } from '@/lib/offline';
import { Quest } from '@/types/database';
import { getPhotoVariantPaths } from '@/lib/photoVariants';

export function useCreateQuest() {
  const { user, packs } = useAuth();
  const { refreshPendingCount } = useSync();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createQuest = useCallback(async ({
    photoUri,
    description,
    journeyId,
    packId,
    assigneeId,
  }: {
    photoUri: string;
    description?: string;
    journeyId?: string;
    packId: string;
    assigneeId: string | null; // a packmate for targeted, null for open-to-the-pack
  }): Promise<{ quest: Quest; queued: boolean } | null> => {
    if (!user) {
      setError('Must be signed in');
      return null;
    }
    const pack = packs.find((p) => p.id === packId);
    if (!pack) {
      setError('Pick a pack for this quest');
      return null;
    }
    if (assigneeId && !pack.members.some((m) => m.user_id === assigneeId)) {
      setError('That person is not in this pack');
      return null;
    }
    const mode: 'targeted' | 'open' = assigneeId ? 'targeted' : 'open';

    setLoading(true);
    setError(null);

    try {
      const questId = Crypto.randomUUID();
      const createdAt = new Date().toISOString();
      // Capture GPS now — it works offline and must reflect where the
      // quest was spotted, not where we are when the upload syncs.
      const location = await getCurrentLocation();
      const photoPaths = getPhotoVariantPaths(user.id, questId, 'quest');

      const payload = {
        questId,
        packId,
        creatorId: user.id,
        assigneeId,
        mode,
        journeyId: journeyId ?? null,
        description: description?.trim() || null,
        photoUri,
        locationLat: location?.lat ?? null,
        locationLng: location?.lng ?? null,
        createdAt,
      };

      const quest: Quest = {
        id: questId,
        pack_id: packId,
        creator_id: user.id,
        assignee_id: assigneeId,
        finder_id: null,
        mode,
        journey_id: payload.journeyId,
        status: 'active',
        description: payload.description,
        photo_path: photoPaths.detailPath,
        photo_full_path: photoPaths.fullPath,
        photo_thumbnail_path: photoPaths.thumbnailPath,
        location_lat: payload.locationLat,
        location_lng: payload.locationLng,
        completion_photo_path: null,
        completion_full_path: null,
        completion_thumbnail_path: null,
        completion_journey_id: null,
        completed_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      };

      try {
        await syncCreateQuest(payload);
        return { quest, queued: false };
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await enqueue({ id: questId, type: 'create_quest', payload });
        await refreshPendingCount();
        return { quest, queued: true };
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to create quest');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, packs, refreshPendingCount]);

  return { createQuest, loading, error };
}
