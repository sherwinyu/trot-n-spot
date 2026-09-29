import { useState, useCallback, useEffect, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/hooks/useAuth';
import { isNetworkError } from '@/lib/offline';
import {
  deleteComment,
  deleteReaction,
  fetchQuestActivity,
  hasReacted,
  insertComment,
  insertReaction,
  normalizeCommentBody,
  toggleReaction as toggleReactionIn,
} from '@/lib/questActivity';
import { useNotifications } from '@/providers/NotificationProvider';
import { QuestComment, QuestReaction, ReactionKind } from '@/types/database';

// Comments and reactions for one quest. Online-only like quest edits: a
// comment is a message to packmates, so it should only show as sent once
// the server has it. Reactions update optimistically and roll back on
// failure. Refetches when a push arrives (e.g. a packmate's comment).
export function useQuestActivity(questId: string | undefined) {
  const { user } = useAuth();
  const { receivedCount } = useNotifications();
  const [comments, setComments] = useState<QuestComment[]>([]);
  const [reactions, setReactions] = useState<QuestReaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reactionsRef = useRef(reactions);
  reactionsRef.current = reactions;

  const fail = (err: unknown, fallback: string) => {
    setError(
      isNetworkError(err)
        ? "You're offline — connect to see and join the conversation."
        : err instanceof Error
          ? err.message
          : fallback
    );
  };

  const refresh = useCallback(async () => {
    if (!questId || !user) return;
    try {
      const activity = await fetchQuestActivity(questId);
      setComments(activity.comments);
      setReactions(activity.reactions);
      setError(null);
    } catch (err) {
      fail(err, 'Could not load activity');
    } finally {
      setLoading(false);
    }
  }, [questId, user]);

  useEffect(() => {
    refresh();
  }, [refresh, receivedCount]);

  const addComment = useCallback(
    async (body: string): Promise<boolean> => {
      const text = normalizeCommentBody(body);
      if (!questId || !user || !text) return false;
      setPosting(true);
      setError(null);
      try {
        const saved = await insertComment({ id: Crypto.randomUUID(), quest_id: questId, author_id: user.id, body: text });
        setComments((prev) => (prev.some((c) => c.id === saved.id) ? prev : [...prev, saved]));
        return true;
      } catch (err) {
        fail(err, 'Could not post comment');
        return false;
      } finally {
        setPosting(false);
      }
    },
    [questId, user]
  );

  const removeComment = useCallback(
    async (comment: QuestComment): Promise<boolean> => {
      if (!user || comment.author_id !== user.id) return false;
      setError(null);
      try {
        await deleteComment(comment.id);
        setComments((prev) => prev.filter((c) => c.id !== comment.id));
        return true;
      } catch (err) {
        fail(err, 'Could not delete comment');
        return false;
      }
    },
    [user]
  );

  const toggleReaction = useCallback(
    async (kind: ReactionKind) => {
      if (!questId || !user) return;
      const removing = hasReacted(reactionsRef.current, user.id, kind);
      setReactions((prev) => toggleReactionIn(prev, questId, user.id, kind));
      setError(null);
      try {
        if (removing) await deleteReaction(questId, user.id, kind);
        else await insertReaction(questId, user.id, kind);
      } catch (err) {
        // Undo just this tap; other taps may have landed meanwhile.
        setReactions((prev) =>
          hasReacted(prev, user.id, kind) === removing ? prev : toggleReactionIn(prev, questId, user.id, kind)
        );
        fail(err, 'Could not update reaction');
      }
    },
    [questId, user]
  );

  return { comments, reactions, loading, posting, error, refresh, addComment, removeComment, toggleReaction };
}
