import { StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { DudleyRefresh } from '@/components/dudley/DudleyRefresh';
import { QuestPhoto } from '@/components/QuestPhoto';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useQuests } from '@/hooks/useQuests';
import { FeedQuest } from '@/lib/questFeed';
import { formatDuration, getTimeAgo } from '@/lib/format';
import { routeForActivity } from '@/lib/activity';
import { useNotifications } from '@/providers/NotificationProvider';
import { ActivityNotification } from '@/types/database';

const ACTIVITY_ICON: Record<ActivityNotification['type'], string> = {
  quest_created: '🔍',
  quest_completed: '✅',
  pack_joined: '🐾',
};

function ActivityRow({ item }: { item: ActivityNotification }) {
  const router = useRouter();
  const c = Colors[useColorScheme() ?? 'light'];
  const route = routeForActivity(item);
  return (
    <TouchableOpacity
      style={[styles.activityRow, { backgroundColor: c.card }]}
      onPress={() => route && router.push(route as never)}
      disabled={!route}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}`}
    >
      <Text style={styles.activityIcon}>{ACTIVITY_ICON[item.type]}</Text>
      <View style={styles.activityText}>
        <Text style={[styles.activityTitle, item.read_at === null && styles.activityUnread]}>
          {item.title}
        </Text>
        <Text style={styles.activityBody} numberOfLines={2}>{item.body}</Text>
      </View>
      <Text style={styles.cardMeta}>{getTimeAgo(item.created_at)}</Text>
      {item.read_at === null && <View style={[styles.unreadDot, { backgroundColor: c.tint }]} />}
    </TouchableOpacity>
  );
}

function ActivityFeed({ items }: { items: ActivityNotification[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Activity</Text>
      {items.map((item) => <ActivityRow key={item.id} item={item} />)}
      <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Found</Text>
    </View>
  );
}

function HistoryCard({ quest }: { quest: FeedQuest }) {
  const router = useRouter();
  const c = Colors[useColorScheme() ?? 'light'];
  const originalPath = quest.photo_thumbnail_path ?? quest.photo_path;
  const completionPath = quest.completion_thumbnail_path ?? quest.completion_photo_path;

  const timeToFind = quest.completed_at
    ? formatDuration(new Date(quest.completed_at).getTime() - new Date(quest.created_at).getTime())
    : '';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.card }, quest.pending && styles.cardPending]}
      onPress={() => router.push(`/quest/${quest.id}`)}
      disabled={quest.pending}
      accessibilityRole="button"
      accessibilityLabel={quest.description || 'Open completed quest'}
    >
      <View style={styles.photos}>
        <QuestPhoto
          storagePath={originalPath}
          style={styles.photo}
          accessibilityLabel="Original quest photo"
          fallback={
            <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: c.cardAlt }]}>
              <Text style={styles.placeholderIcon}>🔍</Text>
            </View>
          }
        />
        <QuestPhoto
          storagePath={completionPath}
          localUri={quest.local_completion_uri}
          style={styles.photo}
          accessibilityLabel="Completed quest photo"
          fallback={
            <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: c.cardAlt }]}>
              <Text style={styles.placeholderIcon}>✅</Text>
            </View>
          }
        />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardDescription}>
          {quest.description || 'Quest'}
        </Text>
        <Text style={styles.cardMeta}>
          {quest.pending ? `Waiting to sync · Found in ${timeToFind}` : `Found in ${timeToFind}`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const { completedQuests, loading, refresh } = useQuests();
  const { activity, refreshActivity, markActivityRead } = useNotifications();

  // Refetch when the tab regains focus so fresh completions show up, and
  // treat opening the tab as having seen the activity.
  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshActivity().then(markActivityRead);
    }, [refresh, refreshActivity, markActivityRead])
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), refreshActivity()]);
  }, [refresh, refreshActivity]);

  return (
    <DudleyRefresh onRefresh={refreshAll} disabled={loading}>
      {scrollProps => <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={completedQuests}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <HistoryCard quest={item} />}
      {...scrollProps}
      numColumns={1}
      ListHeaderComponent={<ActivityFeed items={activity} />}
      ListEmptyComponent={
        <Text style={styles.emptyText}>
          No completed quests yet. Get out there!
        </Text>
      }
    />}
    </DudleyRefresh>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  cardPending: {
    opacity: 0.7,
  },
  card: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  photos: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  photo: {
    flex: 1,
    height: 120,
  },
  photoPlaceholder: {
    backgroundColor: '#e8e8e8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 28,
  },
  cardInfo: {
    padding: 12,
    backgroundColor: 'transparent',
  },
  cardDescription: {
    fontSize: 16,
    fontWeight: '500',
  },
  cardMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  section: { backgroundColor: 'transparent' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionTitleSpaced: { marginTop: 16 },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  activityIcon: { fontSize: 22, marginRight: 12 },
  activityText: { flex: 1, backgroundColor: 'transparent' },
  activityTitle: { fontSize: 15 },
  activityUnread: { fontWeight: '600' },
  activityBody: { fontSize: 13, color: '#999', marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  emptyText: {
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 48,
  },
});
