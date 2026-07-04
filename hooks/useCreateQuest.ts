import { useState, useCallback } from 'react';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/providers/SyncProvider';
import { getCurrentLocation } from '@/lib/location';
import { syncCreateQuest } from '@/lib/sync';
import { enqueue, isNetworkError } from '@/lib/offline';
import { Quest } from '@/types/database';

export function useCreateQuest() {
  const { user, partner } = useAuth();
  const { refreshPendingCount } = useSync();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createQuest = useCallback(async ({
    photoUri,
    description,
    journeyId,
  }: {
    photoUri: string;
    description?: string;
    journeyId?: string;
  }): Promise<{ quest: Quest; queued: boolean } | null> => {
    if (!user || !partner) {
      setError('Must be signed in and paired');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const questId = Crypto.randomUUID();
      const createdAt = new Date().toISOString();
      // Capture GPS now — it works offline and must reflect where the
      // quest was spotted, not where we are when the upload syncs.
      const location = await getCurrentLocation();

      const payload = {
        questId,
        creatorId: user.id,
        assigneeId: partner.id,
        journeyId: journeyId ?? null,
        description: description?.trim() || null,
        photoUri,
        locationLat: location?.lat ?? null,
        locationLng: location?.lng ?? null,
        createdAt,
      };

      const quest: Quest = {
        id: questId,
        creator_id: user.id,
        assignee_id: partner.id,
        journey_id: payload.journeyId,
        status: 'active',
        description: payload.description,
        photo_path: `${user.id}/${questId}/original.jpg`,
        location_lat: payload.locationLat,
        location_lng: payload.locationLng,
        completion_photo_path: null,
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
  }, [user, partner, refreshPendingCount]);

  return { createQuest, loading, error };
}
