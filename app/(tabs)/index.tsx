import { StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useQuests } from '@/hooks/useQuests';
import { Quest } from '@/types/database';
import { supabase } from '@/lib/supabase';
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
      {photoUrl && <Image source={{ uri: photoUrl }} style={styles.cardImage} />}
      <View style={styles.cardContent}>
        <Text style={styles.cardDescription}>
          {quest.description || 'Find this!'}
        </Text>
        <Text style={styles.cardMeta}>{timeAgo}</Text>
      </View>
    </TouchableOpacity>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function FeedScreen() {
  const { activeQuestsForMe, activeQuestsByMe, loading, refresh } = useQuests();

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      data={[]}
      renderItem={null}
      ListHeaderComponent={
        <>
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
});
