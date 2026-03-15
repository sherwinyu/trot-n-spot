import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Quest } from '@/types/database';

export function useQuests() {
  const { user } = useAuth();
  const [activeQuestsForMe, setActiveQuestsForMe] = useState<Quest[]>([]);
  const [activeQuestsByMe, setActiveQuestsByMe] = useState<Quest[]>([]);
  const [completedQuests, setCompletedQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [forMe, byMe, completed] = await Promise.all([
      supabase
        .from('quests')
        .select('*')
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

    setActiveQuestsForMe((forMe.data as Quest[]) ?? []);
    setActiveQuestsByMe((byMe.data as Quest[]) ?? []);
    setCompletedQuests((completed.data as Quest[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { activeQuestsForMe, activeQuestsByMe, completedQuests, loading, refresh };
}
