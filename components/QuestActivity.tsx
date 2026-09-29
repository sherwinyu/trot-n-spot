import { StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useMemo, useRef, useState } from 'react';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { useQuestActivity } from '@/hooks/useQuestActivity';
import { getTimeAgo } from '@/lib/format';
import { confirm } from '@/lib/notify';
import {
  buildTimeline,
  COMMENT_MAX_LENGTH,
  describeTimelineEntry,
  displayName,
  summarizeReactions,
  type TimelineEntry,
} from '@/lib/questActivity';
import { usePackLookups } from '@/providers/AuthProvider';
import { Quest, QuestComment } from '@/types/database';

const ENTRY_ICON: Record<Exclude<TimelineEntry['kind'], 'comment'>, string> = {
  created: '🔍',
  completed: '✅',
  reaction: '✨',
};

// Reactions, the quest's activity timeline, and a comment box, shown at the
// bottom of the quest detail screen.
export function QuestActivity({ quest }: { quest: Quest }) {
  const c = Colors[useColorScheme() ?? 'light'];
  const { user } = useAuth();
  const { memberNames } = usePackLookups();
  const { comments, reactions, loading, posting, error, addComment, removeComment, toggleReaction } =
    useQuestActivity(quest.id);
  const [draft, setDraft] = useState('');
  const input = useRef<TextInput>(null);

  const summary = useMemo(() => summarizeReactions(reactions, user?.id), [reactions, user?.id]);
  const timeline = useMemo(() => buildTimeline(quest, comments, reactions), [quest, comments, reactions]);

  const handlePost = async () => {
    if (await addComment(draft)) setDraft('');
  };

  const handleReply = (comment: QuestComment) => {
    const name = memberNames[comment.author_id];
    if (name) setDraft((prev) => (prev.startsWith(`@${name} `) ? prev : `@${name} ${prev}`));
    input.current?.focus();
  };

  const handleDelete = (comment: QuestComment) => {
    confirm('Delete comment?', 'Your packmates will no longer see it.', () => removeComment(comment), 'Delete');
  };

  return (
    <View style={styles.container} testID="quest-activity">
      <View style={styles.reactionRow}>
        {summary.map((r) => (
          <TouchableOpacity
            key={r.kind}
            style={[
              styles.reactionChip,
              { borderColor: r.mine ? c.tint : c.border, backgroundColor: r.mine ? c.cardAlt : c.card },
            ]}
            onPress={() => toggleReaction(r.kind)}
            accessibilityRole="button"
            accessibilityLabel={`React ${r.emoji}`}
            accessibilityState={{ selected: r.mine }}
          >
            <Text style={styles.reactionEmoji}>{r.emoji}</Text>
            {r.count > 0 && <Text style={styles.reactionCount}>{r.count}</Text>}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Activity</Text>
      {timeline.map((entry) =>
        entry.kind === 'comment' ? (
          <View key={entry.key} style={[styles.comment, { backgroundColor: c.card }]} testID="quest-comment">
            <View style={styles.entryHeader}>
              <Text style={styles.author}>{displayName(entry.actorId, memberNames, user?.id)}</Text>
              <Text style={[styles.time, { color: c.muted }]}>{getTimeAgo(entry.at)}</Text>
            </View>
            <Text style={styles.body}>{entry.comment.body}</Text>
            <View style={styles.commentActions}>
              {entry.actorId !== user?.id && (
                <TouchableOpacity onPress={() => handleReply(entry.comment)} accessibilityRole="button">
                  <Text style={[styles.action, { color: c.muted }]}>Reply</Text>
                </TouchableOpacity>
              )}
              {entry.actorId === user?.id && (
                <TouchableOpacity
                  onPress={() => handleDelete(entry.comment)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete comment"
                >
                  <Text style={[styles.action, { color: c.muted }]}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View key={entry.key} style={styles.event}>
            <Text style={styles.eventIcon}>{ENTRY_ICON[entry.kind]}</Text>
            <Text style={[styles.eventText, { color: c.muted }]}>
              {describeTimelineEntry(entry, memberNames, user?.id)}
            </Text>
            <Text style={[styles.time, { color: c.muted }]}>{getTimeAgo(entry.at)}</Text>
          </View>
        )
      )}
      {loading && <ActivityIndicator style={styles.loading} />}

      <View style={styles.composer}>
        <TextInput
          ref={input}
          style={[styles.input, { backgroundColor: c.inputBackground, color: c.inputText, borderColor: c.border }]}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a comment…"
          placeholderTextColor={c.placeholder}
          multiline
          maxLength={COMMENT_MAX_LENGTH}
          accessibilityLabel="Comment"
        />
        <TouchableOpacity
          style={[styles.postButton, { backgroundColor: c.tint }, (!draft.trim() || posting) && styles.postDisabled]}
          onPress={handlePost}
          disabled={!draft.trim() || posting}
          accessibilityRole="button"
          accessibilityLabel="Post comment"
        >
          {posting ? (
            <ActivityIndicator color={c.background} />
          ) : (
            <Text style={[styles.postText, { color: c.background }]}>Post</Text>
          )}
        </TouchableOpacity>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 24, backgroundColor: 'transparent' },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: 'transparent' },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, backgroundColor: 'transparent' },
  eventIcon: { fontSize: 14 },
  eventText: { flex: 1, fontSize: 13 },
  comment: { borderRadius: 10, padding: 10, marginVertical: 4 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'transparent' },
  author: { fontSize: 13, fontWeight: '600' },
  time: { fontSize: 12 },
  body: { fontSize: 15, marginTop: 4, lineHeight: 20 },
  commentActions: { flexDirection: 'row', gap: 16, marginTop: 6, backgroundColor: 'transparent' },
  action: { fontSize: 12, fontWeight: '600' },
  loading: { marginVertical: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12, backgroundColor: 'transparent' },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, maxHeight: 120 },
  postButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  postDisabled: { opacity: 0.5 },
  postText: { fontSize: 15, fontWeight: '600' },
  error: { color: 'red', marginTop: 8 },
});
