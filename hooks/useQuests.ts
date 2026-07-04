import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { cacheGet, cacheSet } from '@/lib/offline';
import { partitionQuests, QuestLists, EMPTY_QUEST_LISTS } from '@/lib/questFeed';
import { Quest, QUEST_COLUMNS_NO_LOCATION } from '@/types/database';

export { QUEST_COLUMNS_NO_LOCATION };
export type { QuestLists };

function hasAny(lists: QuestLists): boolean {
  return Object.values(lists).some((l) => l.length > 0);
}

export function useQuests() {
  const { user, packs } = useAuth();
  const [lists, setLists] = useState<QuestLists>(EMPTY_QUEST_LISTS);
  const [loading, setLoading] = useState(true);

  const packIds = packs.map((p) => p.id).join(',');

  // Serve the last good fetch immediately so the feed is browsable
  // offline (e.g. reviewing quests mid-walk with no signal).
  useEffect(() => {
    if (!user) return;
    cacheGet<QuestLists>(`quests:${user.id}`).then((cached) => {
      if (cached) setLists((prev) => (hasAny(prev) ? prev : { ...EMPTY_QUEST_LISTS, ...cached }));
    });
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) return;
    if (!packIds) {
      setLoading(false);
      return;
    }
    setLoading(true);

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
      if (!active.error && !completed.error) {
        const next = partitionQuests(
          (active.data as unknown as Quest[]) ?? [],
          (completed.data as unknown as Quest[]) ?? [],
          user.id
        );
        setLists(next);
        cacheSet(`quests:${user.id}`, next);
      }
    } catch {
      // Offline — keep whatever we have (cache or previous state).
    } finally {
      setLoading(false);
    }
  }, [user, packIds]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...lists, loading, refresh };
}
