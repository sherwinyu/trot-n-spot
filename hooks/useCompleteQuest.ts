import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/providers/SyncProvider';
import { syncCompleteQuest } from '@/lib/sync';
import { enqueue, isNetworkError } from '@/lib/offline';

export function useCompleteQuest() {
  const { user } = useAuth();
  const { refreshPendingCount } = useSync();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeQuest = useCallback(async ({
    questId,
    photoUri,
    journeyId,
  }: {
    questId: string;
    photoUri: string;
    journeyId?: string;
  }): Promise<{ queued: boolean } | null> => {
    if (!user) {
      setError('Must be signed in');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        questId,
        userId: user.id,
        journeyId: journeyId ?? null,
        photoUri,
        completedAt: new Date().toISOString(),
      };

      try {
        await syncCompleteQuest(payload);
        return { queued: false };
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await enqueue({ id: questId, type: 'complete_quest', payload });
        await refreshPendingCount();
        return { queued: true };
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to complete quest');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, refreshPendingCount]);

  return { completeQuest, loading, error };
}
