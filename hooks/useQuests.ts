import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { cacheGetEntry, cacheSet, getQueue, isNetworkError, PendingMutation } from '@/lib/offline';
import { prefetchQuestPhotos } from '@/lib/prefetch';
import { applyPendingMutations, partitionQuests, QuestLists, EMPTY_QUEST_LISTS } from '@/lib/questFeed';
import { useSync } from '@/providers/SyncProvider';
import { Quest, QUEST_COLUMNS_NO_LOCATION } from '@/types/database';

export { QUEST_COLUMNS_NO_LOCATION };
export type { QuestLists };

// What the most recent refresh attempt did. Anything other than `fresh`
// means the lists on screen are the cached copy.
export type FetchState = 'idle' | 'fetching' | 'fresh' | 'offline' | 'error';

export function useQuests() {
  const { user, packs } = useAuth();
  const { pendingCount, isOnline } = useSync();
  const [lists, setLists] = useState<QuestLists>(EMPTY_QUEST_LISTS);
  const [queue, setQueue] = useState<PendingMutation[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const packIds = packs.map((p) => p.id).join(',');

  // Serve the last good fetch immediately so the feed is browsable
  // offline (e.g. reviewing quests mid-walk with no signal). The cache is
  // also the channel other screens use to push edits/deletes into a feed
  // that stays mounted underneath them, so refresh() re-reads it too.
  const hydrateFromCache = useCallback(async () => {
    if (!user) return;
    const cached = await cacheGetEntry<QuestLists>(`quests:${user.id}`);
    if (!cached) return;
    setLists({ ...EMPTY_QUEST_LISTS, ...cached.value });
    setLastFetchedAt((prev) => prev ?? cached.updatedAt);
  }, [user]);

  useEffect(() => {
    hydrateFromCache();
  }, [hydrateFromCache]);

  // Queued creates/completes overlay the feed until they sync.
  useEffect(() => {
    if (!user) return;
    getQueue(user.id).then(setQueue);
  }, [user, pendingCount]);

  const refresh = useCallback(async () => {
    if (!user) return;
    if (!packIds) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchState('fetching');
    await hydrateFromCache();

    try {
      const ids = packIds.split(',');
      const [active, completed] = await Promise.all([
        supabase
          .from('quests')
          .select(QUEST_COLUMNS_NO_LOCATION)
          .in('pack_id', ids)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('quests')
          .select(QUEST_COLUMNS_NO_LOCATION)
          .in('pack_id', ids)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false }),
      ]);

      // Don't clobber cached data with empty lists from a failed request.
      const failure = active.error ?? completed.error;
      if (!failure) {
        const next = partitionQuests(
          (active.data as unknown as Quest[]) ?? [],
          (completed.data as unknown as Quest[]) ?? [],
          user.id
        );
        setLists(next);
        setLastFetchedAt(Date.now());
        setFetchState('fresh');
        cacheSet(`quests:${user.id}`, next);
        prefetchQuestPhotos(next);
      } else {
        setFetchState(isNetworkError(failure.message) ? 'offline' : 'error');
      }
    } catch (err) {
      // Offline — keep whatever we have (cache or previous state).
      setFetchState(isNetworkError(err) ? 'offline' : 'error');
    } finally {
      setLoading(false);
    }
  }, [user, packIds, hydrateFromCache]);

  // Also refetch when the queue drains (a flush just landed quests on the
  // server) and when connectivity changes.
  useEffect(() => {
    refresh();
  }, [refresh, pendingCount, isOnline]);

  const merged = useMemo(
    () => (user ? applyPendingMutations(lists, queue, user.id) : lists),
    [lists, queue, user]
  );

  return { ...merged, loading, refresh, fetchState, lastFetchedAt };
}
