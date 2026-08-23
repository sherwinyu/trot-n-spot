import { StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { QuestPhoto } from '@/components/QuestPhoto';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useQuests } from '@/hooks/useQuests';
import { Quest } from '@/types/database';
import { formatDuration } from '@/lib/format';

function HistoryCard({ quest }: { quest: Quest }) {
  const router = useRouter();
  const c = Colors[useColorScheme() ?? 'light'];
  const originalPath = quest.photo_thumbnail_path ?? quest.photo_path;
  const completionPath = quest.completion_thumbnail_path ?? quest.completion_photo_path;

  const timeToFind = quest.completed_at
    ? formatDuration(new Date(quest.completed_at).getTime() - new Date(quest.created_at).getTime())
    : '';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.card }]}
      onPress={() => router.push(`/quest/${quest.id}`)}
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
        <Text style={styles.cardMeta}>Found in {timeToFind}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const { completedQuests, loading, refresh } = useQuests();

  // Refetch when the tab regains focus so fresh completions show up.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={completedQuests}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <HistoryCard quest={item} />}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      numColumns={1}
      ListEmptyComponent={
        <Text style={styles.emptyText}>
          No completed quests yet. Get out there!
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
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
  emptyText: {
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 48,
  },
});
