import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
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
// failure. Refetches on foreground and when a push arrives (e.g. a
// packmate's comment).
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
  const reactionQueues = useRef(new Map<ReactionKind, Promise<void>>());
  // Bumped around every write so a fetch that overlapped one can't
  // overwrite the newer local state with its older snapshot.
  const writes = useRef(0);

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
    const startedAt = writes.current;
    try {
      const activity = await fetchQuestActivity(questId);
      if (writes.current !== startedAt) return;
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
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh, receivedCount]);

  const addComment = useCallback(
    async (body: string): Promise<boolean> => {
      const text = normalizeCommentBody(body);
      if (!questId || !user || !text) return false;
      setPosting(true);
      setError(null);
      writes.current++;
      try {
        const saved = await insertComment({ id: Crypto.randomUUID(), quest_id: questId, author_id: user.id, body: text });
        setComments((prev) => (prev.some((c) => c.id === saved.id) ? prev : [...prev, saved]));
        return true;
      } catch (err) {
        fail(err, 'Could not post comment');
        return false;
      } finally {
        writes.current++;
        setPosting(false);
      }
    },
    [questId, user]
  );

  const removeComment = useCallback(
    async (comment: QuestComment): Promise<boolean> => {
      if (!user || comment.author_id !== user.id) return false;
      setError(null);
      writes.current++;
      try {
        await deleteComment(comment.id);
        setComments((prev) => prev.filter((c) => c.id !== comment.id));
        return true;
      } catch (err) {
        fail(err, 'Could not delete comment');
        return false;
      } finally {
        writes.current++;
      }
    },
    [user]
  );

  const toggleReaction = useCallback(
    async (kind: ReactionKind) => {
      if (!questId || !user) return;
      writes.current++;
      const removing = hasReacted(reactionsRef.current, user.id, kind);
      setReactions((prev) => toggleReactionIn(prev, questId, user.id, kind));
      setError(null);
      // Requests for one kind run in tap order, so a quick double tap
      // can't land its insert after its delete.
      const request = (reactionQueues.current.get(kind) ?? Promise.resolve()).then(() =>
        removing ? deleteReaction(questId, user.id, kind) : insertReaction(questId, user.id, kind)
      );
      reactionQueues.current.set(kind, request.catch(() => {}));
      try {
        await request;
      } catch (err) {
        // Undo just this tap; other taps may have landed meanwhile.
        setReactions((prev) =>
          hasReacted(prev, user.id, kind) === removing ? prev : toggleReactionIn(prev, questId, user.id, kind)
        );
        fail(err, 'Could not update reaction');
      } finally {
        writes.current++;
      }
    },
    [questId, user]
  );

  return { comments, reactions, loading, posting, error, refresh, addComment, removeComment, toggleReaction };
}
