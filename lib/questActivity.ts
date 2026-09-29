import { supabase } from '@/lib/supabase';
import { Quest, QuestComment, QuestReaction, ReactionKind } from '@/types/database';

// Per-quest social layer: comments, reactions, and the timeline that
// merges them with the quest's own lifecycle on the detail screen.

export const COMMENT_MAX_LENGTH = 500;

// Order is display order. Kinds must match the quest_reactions check.
export const REACTIONS: readonly { kind: ReactionKind; emoji: string }[] = [
  { kind: 'love', emoji: '❤️' },
  { kind: 'laugh', emoji: '😂' },
  { kind: 'wow', emoji: '😮' },
  { kind: 'paw', emoji: '🐾' },
  { kind: 'fire', emoji: '🔥' },
];

const EMOJI: Record<ReactionKind, string> = Object.fromEntries(
  REACTIONS.map((r) => [r.kind, r.emoji])
) as Record<ReactionKind, string>;

export function reactionEmoji(kind: ReactionKind): string {
  return EMOJI[kind];
}

// ---------- data ----------

export async function fetchQuestActivity(
  questId: string
): Promise<{ comments: QuestComment[]; reactions: QuestReaction[] }> {
  const [comments, reactions] = await Promise.all([
    supabase.from('quest_comments').select('*').eq('quest_id', questId).order('created_at'),
    supabase.from('quest_reactions').select('*').eq('quest_id', questId).order('created_at'),
  ]);
  if (comments.error) throw comments.error;
  if (reactions.error) throw reactions.error;
  return {
    comments: (comments.data ?? []) as QuestComment[],
    reactions: (reactions.data ?? []) as QuestReaction[],
  };
}

// pack_id is filled in server-side from the quest.
export async function insertComment(comment: {
  id: string;
  quest_id: string;
  author_id: string;
  body: string;
}): Promise<QuestComment> {
  const { data, error } = await supabase.from('quest_comments').insert(comment).select('*').single();
  if (error) throw error;
  return data as QuestComment;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from('quest_comments').delete().eq('id', id);
  if (error) throw error;
}

const UNIQUE_VIOLATION = '23505';

export async function insertReaction(questId: string, userId: string, kind: ReactionKind): Promise<void> {
  const { error } = await supabase.from('quest_reactions').insert({ quest_id: questId, user_id: userId, kind });
  // Already reacted (e.g. from another device) is the state we wanted.
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
}

export async function deleteReaction(questId: string, userId: string, kind: ReactionKind): Promise<void> {
  const { error } = await supabase
    .from('quest_reactions')
    .delete()
    .eq('quest_id', questId)
    .eq('user_id', userId)
    .eq('kind', kind);
  if (error) throw error;
}

// ---------- pure helpers ----------

export function normalizeCommentBody(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length === 0 || trimmed.length > COMMENT_MAX_LENGTH) return null;
  return trimmed;
}

export function hasReacted(reactions: QuestReaction[], userId: string, kind: ReactionKind): boolean {
  return reactions.some((r) => r.user_id === userId && r.kind === kind);
}

// The reaction list after the user taps `kind`: adds it, or removes it if
// they had already reacted with it.
export function toggleReaction(
  reactions: QuestReaction[],
  questId: string,
  userId: string,
  kind: ReactionKind,
  now: Date = new Date()
): QuestReaction[] {
  if (hasReacted(reactions, userId, kind)) {
    return reactions.filter((r) => !(r.user_id === userId && r.kind === kind));
  }
  return [...reactions, { quest_id: questId, user_id: userId, kind, created_at: now.toISOString() }];
}

export type ReactionSummary = { kind: ReactionKind; emoji: string; count: number; mine: boolean };

export function summarizeReactions(reactions: QuestReaction[], userId: string | undefined): ReactionSummary[] {
  return REACTIONS.map(({ kind, emoji }) => {
    const matching = reactions.filter((r) => r.kind === kind);
    return { kind, emoji, count: matching.length, mine: matching.some((r) => r.user_id === userId) };
  });
}

export type TimelineEntry =
  | { kind: 'created'; key: string; at: string; actorId: string }
  | { kind: 'completed'; key: string; at: string; actorId: string | null }
  | { kind: 'reaction'; key: string; at: string; actorId: string; reaction: ReactionKind }
  | { kind: 'comment'; key: string; at: string; actorId: string; comment: QuestComment };

// Oldest first, so the thread reads top-down into the comment box.
export function buildTimeline(
  quest: Pick<Quest, 'id' | 'creator_id' | 'finder_id' | 'assignee_id' | 'status' | 'created_at' | 'completed_at'>,
  comments: QuestComment[],
  reactions: QuestReaction[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { kind: 'created', key: `created:${quest.id}`, at: quest.created_at, actorId: quest.creator_id },
  ];
  if (quest.status === 'completed' && quest.completed_at) {
    entries.push({
      kind: 'completed',
      key: `completed:${quest.id}`,
      at: quest.completed_at,
      actorId: quest.finder_id ?? quest.assignee_id,
    });
  }
  for (const r of reactions) {
    entries.push({ kind: 'reaction', key: `reaction:${r.user_id}:${r.kind}`, at: r.created_at, actorId: r.user_id, reaction: r.kind });
  }
  for (const c of comments) {
    entries.push({ kind: 'comment', key: `comment:${c.id}`, at: c.created_at, actorId: c.author_id, comment: c });
  }
  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function displayName(
  userId: string | null,
  memberNames: Record<string, string>,
  viewerId: string | undefined
): string {
  if (!userId) return 'A packmate';
  if (userId === viewerId) return 'You';
  return memberNames[userId] ?? 'A packmate';
}

// One-line description for non-comment entries.
export function describeTimelineEntry(
  entry: Exclude<TimelineEntry, { kind: 'comment' }>,
  memberNames: Record<string, string>,
  viewerId: string | undefined
): string {
  const who = displayName(entry.actorId, memberNames, viewerId);
  switch (entry.kind) {
    case 'created':
      return `${who} spotted this`;
    case 'completed':
      return `${who} found it`;
    case 'reaction':
      return `${who} reacted ${reactionEmoji(entry.reaction)}`;
  }
}
