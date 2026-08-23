import { memo, useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { QuestPhoto } from '@/components/QuestPhoto';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useQuests } from '@/hooks/useQuests';
import { getTimeAgo } from '@/lib/format';
import { useAuth, usePackLookups } from '@/providers/AuthProvider';
import { useSync } from '@/providers/SyncProvider';
import { Quest } from '@/types/database';

type FeedRow =
  | { type: 'sync'; key: string; pendingCount: number }
  | { type: 'section'; key: string; title: string }
  | { type: 'empty'; key: string; message: string }
  | { type: 'quest'; key: string; quest: Quest; subtitle?: string };

const QuestCard = memo(function QuestCard({
  quest,
  subtitle,
}: {
  quest: Quest;
  subtitle?: string;
}) {
  const router = useRouter();
  const c = Colors[useColorScheme() ?? 'light'];
  const thumbnailPath = quest.photo_thumbnail_path ?? quest.photo_path;
  const fallback = (
    <View style={[styles.cardImage, styles.imagePlaceholder, { backgroundColor: c.cardAlt }]}>
      <Text style={styles.placeholderIcon}>🔍</Text>
    </View>
  );

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.card }]}
      onPress={() => router.push(`/quest/${quest.id}`)}
      accessibilityRole="button"
      accessibilityLabel={quest.description || 'Open quest'}
    >
      <QuestPhoto
        storagePath={thumbnailPath}
        style={styles.cardImage}
        fallback={fallback}
        accessibilityLabel={quest.description || 'Quest photo'}
      />
      <View style={styles.cardContent}>
        <Text style={styles.cardDescription}>{quest.description || 'Find this!'}</Text>
        <Text style={styles.cardMeta}>
          {subtitle ? `${subtitle} · ${getTimeAgo(quest.created_at)}` : getTimeAgo(quest.created_at)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

function renderFeedRow({ item }: { item: FeedRow }) {
  if (item.type === 'sync') {
    return (
      <View style={styles.syncBanner}>
        <Text style={styles.syncBannerText}>
          {item.pendingCount} {item.pendingCount === 1 ? 'quest' : 'quests'} waiting to sync — will send when back online
        </Text>
      </View>
    );
  }
  if (item.type === 'section') return <Text style={styles.sectionTitle}>{item.title}</Text>;
  if (item.type === 'empty') return <Text style={styles.emptyText}>{item.message}</Text>;
  return <QuestCard quest={item.quest} subtitle={item.subtitle} />;
}

export default function FeedScreen() {
  const { forMe, openForPack, byMe, aroundMyPacks, loading, refresh } = useQuests();
  const { pendingCount } = useSync();
  const { packs } = useAuth();
  const { memberNames, packNames } = usePackLookups();

  const rows = useMemo<FeedRow[]>(() => {
    const next: FeedRow[] = [];
    const showPackLabels = packs.length > 1;
    const nameOf = (id: string | null) => (id ? memberNames[id] ?? 'a packmate' : '');
    const withPack = (base: string | undefined, quest: Quest) => {
      const label = showPackLabels ? packNames[quest.pack_id] : undefined;
      if (base && label) return `${base} · ${label}`;
      return base ?? label;
    };
    const addQuest = (section: string, quest: Quest, subtitle?: string) => {
      next.push({ type: 'quest', key: `${section}:${quest.id}`, quest, subtitle });
    };

    if (pendingCount > 0) next.push({ type: 'sync', key: 'sync', pendingCount });

    next.push({ type: 'section', key: 'for-me-heading', title: 'Quests for You' });
    if (forMe.length === 0) {
      next.push({
        type: 'empty',
        key: 'for-me-empty',
        message: 'Nothing yet — your packmates are still out spotting.',
      });
    } else {
      forMe.forEach((quest) => addQuest(
        'for-me',
        quest,
        withPack(`From ${nameOf(quest.creator_id)}`, quest)
      ));
    }

    if (openForPack.length > 0) {
      next.push({ type: 'section', key: 'open-heading', title: 'Open to the Pack' });
      openForPack.forEach((quest) => addQuest(
        'open',
        quest,
        withPack(`${nameOf(quest.creator_id)} spotted this — first to find it wins`, quest)
      ));
    }

    next.push({ type: 'section', key: 'by-me-heading', title: 'Quests by You' });
    if (byMe.length === 0) {
      next.push({ type: 'empty', key: 'by-me-empty', message: 'Create a quest for your pack!' });
    } else {
      byMe.forEach((quest) => addQuest(
        'by-me',
        quest,
        withPack(
          quest.mode === 'open' ? 'Open to the pack' : `For ${nameOf(quest.assignee_id)}`,
          quest
        )
      ));
    }

    if (aroundMyPacks.length > 0) {
      next.push({ type: 'section', key: 'around-heading', title: 'Around Your Packs' });
      aroundMyPacks.forEach((quest) => addQuest(
        'around',
        quest,
        withPack(
          `${nameOf(quest.creator_id)} left one for ${nameOf(quest.assignee_id)}`,
          quest
        )
      ));
    }

    return next;
  }, [aroundMyPacks, byMe, forMe, memberNames, openForPack, packNames, packs.length, pendingCount]);

  // Tab screens stay mounted, so refetch whenever the feed regains focus.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      data={rows}
      keyExtractor={(item) => item.key}
      renderItem={renderFeedRow}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={5}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 12,
  },
  emptyText: {
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardImage: {
    width: 80,
    height: 80,
  },
  cardContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
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
  imagePlaceholder: {
    backgroundColor: '#e8e8e8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 28,
  },
  syncBanner: {
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  syncBannerText: {
    color: '#856404',
    fontSize: 13,
  },
});
