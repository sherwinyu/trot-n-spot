import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { cacheGet, cacheSet } from '@/lib/offline';
import { Quest, QUEST_COLUMNS_NO_LOCATION } from '@/types/database';

export { QUEST_COLUMNS_NO_LOCATION };

type QuestLists = {
  activeQuestsForMe: Quest[];
  activeQuestsByMe: Quest[];
  completedQuests: Quest[];
};

export function useQuests() {
  const { user } = useAuth();
  const [lists, setLists] = useState<QuestLists>({
    activeQuestsForMe: [],
    activeQuestsByMe: [],
    completedQuests: [],
  });
  const [loading, setLoading] = useState(true);

  // Serve the last good fetch immediately so the feed is browsable
  // offline (e.g. reviewing quests mid-walk with no signal).
  useEffect(() => {
    if (!user) return;
    cacheGet<QuestLists>(`quests:${user.id}`).then((cached) => {
      if (cached) setLists((prev) => (prev.activeQuestsForMe.length || prev.activeQuestsByMe.length || prev.completedQuests.length ? prev : cached));
    });
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const [forMe, byMe, completed] = await Promise.all([
        supabase
          .from('quests')
          .select(QUEST_COLUMNS_NO_LOCATION)
          .eq('assignee_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('quests')
          .select('*')
          .eq('creator_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('quests')
          .select('*')
          .eq('status', 'completed')
          .or(`creator_id.eq.${user.id},assignee_id.eq.${user.id}`)
          .order('completed_at', { ascending: false }),
      ]);

      // Don't clobber cached data with empty lists from a failed request.
      if (!forMe.error && !byMe.error && !completed.error) {
        const next: QuestLists = {
          activeQuestsForMe: (forMe.data as unknown as Quest[]) ?? [],
          activeQuestsByMe: (byMe.data as Quest[]) ?? [],
          completedQuests: (completed.data as Quest[]) ?? [],
        };
        setLists(next);
        cacheSet(`quests:${user.id}`, next);
      }
    } catch {
      // Offline — keep whatever we have (cache or previous state).
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...lists, loading, refresh };
}
