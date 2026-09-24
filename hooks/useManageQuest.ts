import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline';
import { canManageQuest, canReassignQuest, ownedPhotoPaths } from '@/lib/questPermissions';
import { Quest, QUEST_COLUMNS_NO_LOCATION } from '@/types/database';

// Creator-only edit/delete for an existing quest. Unlike create/complete
// these are online-only: a delete is destructive and an edit races with
// packmates already hunting, so both confirm with the server rather than
// sitting in the offline queue.
export function useManageQuest() {
  const { user, packs } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown, fallback: string) => {
    setError(
      isNetworkError(err)
        ? "You're offline — connect to change this quest."
        : err instanceof Error
          ? err.message
          : fallback
    );
    return null;
  };

  const updateQuest = useCallback(
    async (
      quest: Quest,
      changes: {
        description: string | null;
        assigneeId: string | null; // a packmate for targeted, null for open-to-the-pack
      }
    ): Promise<Quest | null> => {
      if (!user || !canManageQuest(quest, user.id)) {
        setError('Only the creator can edit this quest');
        return null;
      }
      const reassigning = changes.assigneeId !== quest.assignee_id;
      if (reassigning && !canReassignQuest(quest, user.id)) {
        setError('Completed quests cannot be reassigned');
        return null;
      }
      const pack = packs.find((p) => p.id === quest.pack_id);
      if (
        reassigning &&
        changes.assigneeId &&
        pack &&
        !pack.members.some((m) => m.user_id === changes.assigneeId)
      ) {
        setError('That person is not in this pack');
        return null;
      }

      setLoading(true);
      setError(null);
      try {
        // Assignment only changes while the hunt is still on: a finder may
        // complete the quest between opening the form and saving, so the
        // status predicate is enforced server-side, not just from the copy
        // loaded on screen. Hint-only edits leave assignment untouched.
        let query = supabase
          .from('quests')
          .update(
            reassigning
              ? {
                  description: changes.description,
                  assignee_id: changes.assigneeId,
                  mode: changes.assigneeId ? 'targeted' : 'open',
                }
              : { description: changes.description }
          )
          .eq('id', quest.id);
        if (reassigning) query = query.eq('status', 'active');
        const { data, error: err } = await query.select(QUEST_COLUMNS_NO_LOCATION).maybeSingle();
        if (err) throw err;
        if (!data) {
          throw new Error(
            reassigning
              ? 'This quest was just completed — reload to see who found it'
              : 'Quest not found or already deleted'
          );
        }
        return data as Quest;
      } catch (err) {
        return fail(err, 'Failed to update quest');
      } finally {
        setLoading(false);
      }
    },
    [user, packs]
  );

  const deleteQuest = useCallback(
    async (quest: Quest): Promise<boolean> => {
      if (!user || !canManageQuest(quest, user.id)) {
        setError('Only the creator can delete this quest');
        return false;
      }
      setLoading(true);
      setError(null);
      try {
        const { error: err, count } = await supabase
          .from('quests')
          .delete({ count: 'exact' })
          .eq('id', quest.id);
        if (err) throw err;
        if (count === 0) throw new Error('Quest not found or already deleted');

        // Row is gone; photo cleanup is best-effort so an orphaned file
        // never blocks the user (storage RLS scopes deletes to own folder).
        const paths = ownedPhotoPaths(quest, user.id);
        if (paths.length > 0) {
          await supabase.storage.from('quest-photos').remove(paths);
        }
        return true;
      } catch (err) {
        fail(err, 'Failed to delete quest');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  return { updateQuest, deleteQuest, loading, error };
}
