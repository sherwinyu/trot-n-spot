import { StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Text, View } from '@/components/Themed';
import { useQuests } from '@/hooks/useQuests';
import { useSync } from '@/providers/SyncProvider';
import { Quest } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { getTimeAgo } from '@/lib/format';
import { useState, useEffect } from 'react';

function QuestCard({ quest }: { quest: Quest }) {
  const router = useRouter();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.storage
      .from('quest-photos')
      .createSignedUrl(quest.photo_path, 3600)
      .then(({ data }) => {
        if (data) setPhotoUrl(data.signedUrl);
      });
  }, [quest.photo_path]);

  const timeAgo = getTimeAgo(quest.created_at);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/quest/${quest.id}`)}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.imagePlaceholder]}>
          <Text style={styles.placeholderIcon}>🔍</Text>
        </View>
      )}
      <View style={styles.cardContent}>
        <Text style={styles.cardDescription}>
          {quest.description || 'Find this!'}
        </Text>
        <Text style={styles.cardMeta}>{timeAgo}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function FeedScreen() {
  const { activeQuestsForMe, activeQuestsByMe, loading, refresh } = useQuests();
  const { pendingCount } = useSync();

  // Tab screens stay mounted, so refetch whenever the feed regains
  // focus (e.g. right after creating a quest on the Create tab).
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
      data={[]}
      renderItem={null}
      ListHeaderComponent={
        <>
          {pendingCount > 0 && (
            <View style={styles.syncBanner}>
              <Text style={styles.syncBannerText}>
                {pendingCount} {pendingCount === 1 ? 'quest' : 'quests'} waiting to sync — will send when back online
              </Text>
            </View>
          )}
          <Text style={styles.sectionTitle}>Quests for You</Text>
          {activeQuestsForMe.length === 0 ? (
            <Text style={styles.emptyText}>
              No quests yet! Ask your partner to create one.
            </Text>
          ) : (
            activeQuestsForMe.map((q) => <QuestCard key={q.id} quest={q} />)
          )}

          <Text style={styles.sectionTitle}>Quests by You</Text>
          {activeQuestsByMe.length === 0 ? (
            <Text style={styles.emptyText}>
              Create a quest for your partner!
            </Text>
          ) : (
            activeQuestsByMe.map((q) => <QuestCard key={q.id} quest={q} />)
          )}
        </>
      }
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
