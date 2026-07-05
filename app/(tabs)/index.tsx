import { StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useQuests } from '@/hooks/useQuests';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { useSync } from '@/providers/SyncProvider';
import { useAuth, usePackLookups } from '@/providers/AuthProvider';
import { Quest } from '@/types/database';
import { getTimeAgo } from '@/lib/format';
import { ImageViewerModal } from '@/components/ImageViewerModal';

function QuestCard({
  quest,
  subtitle,
  onPreviewPhoto,
}: {
  quest: Quest;
  subtitle?: string;
  onPreviewPhoto: (url: string) => void;
}) {
  const router = useRouter();
  const c = Colors[useColorScheme() ?? 'light'];
  const photoUrl = useSignedPhotoUrl(quest.photo_path);

  const timeAgo = getTimeAgo(quest.created_at);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.card }]}
      onPress={() => router.push(`/quest/${quest.id}`)}
    >
      {photoUrl ? (
        <TouchableOpacity onPress={() => onPreviewPhoto(photoUrl)}>
          <Image
            source={{ uri: photoUrl }}
            style={styles.cardImage}
            cachePolicy="memory-disk"
            transition={150}
          />
        </TouchableOpacity>
      ) : (
        <View style={[styles.cardImage, styles.imagePlaceholder, { backgroundColor: c.cardAlt }]}>
          <Text style={styles.placeholderIcon}>🔍</Text>
        </View>
      )}
      <View style={styles.cardContent}>
        <Text style={styles.cardDescription}>
          {quest.description || 'Find this!'}
        </Text>
        <Text style={styles.cardMeta}>
          {subtitle ? `${subtitle} · ${timeAgo}` : timeAgo}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function FeedScreen() {
  const { forMe, openForPack, byMe, aroundMyPacks, loading, refresh } = useQuests();
  const { pendingCount } = useSync();
  const { packs } = useAuth();
  const { memberNames, packNames } = usePackLookups();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const showPackLabels = packs.length > 1;
  const packLabel = (q: Quest) => (showPackLabels ? packNames[q.pack_id] : undefined);
  const nameOf = (id: string | null) => (id ? memberNames[id] ?? 'a packmate' : '');

  const withPack = (base: string | undefined, q: Quest) => {
    const label = packLabel(q);
    if (base && label) return `${base} · ${label}`;
    return base ?? label;
  };

  // Tab screens stay mounted, so refetch whenever the feed regains
  // focus (e.g. right after creating a quest on the Create tab).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return (
    <>
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
          {forMe.length === 0 ? (
            <Text style={styles.emptyText}>
              Nothing yet — your packmates are still out spotting.
            </Text>
          ) : (
            forMe.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                subtitle={withPack(`From ${nameOf(q.creator_id)}`, q)}
                onPreviewPhoto={setPreviewUrl}
              />
            ))
          )}

          {openForPack.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Open to the Pack</Text>
              {openForPack.map((q) => (
                <QuestCard
                  key={q.id}
                  quest={q}
                  subtitle={withPack(`${nameOf(q.creator_id)} spotted this — first to find it wins`, q)}
                  onPreviewPhoto={setPreviewUrl}
                />
              ))}
            </>
          )}

          <Text style={styles.sectionTitle}>Quests by You</Text>
          {byMe.length === 0 ? (
            <Text style={styles.emptyText}>
              Create a quest for your pack!
            </Text>
          ) : (
            byMe.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                subtitle={withPack(q.mode === 'open' ? 'Open to the pack' : `For ${nameOf(q.assignee_id)}`, q)}
                onPreviewPhoto={setPreviewUrl}
              />
            ))
          )}

          {aroundMyPacks.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Around Your Packs</Text>
              {aroundMyPacks.map((q) => (
                <QuestCard
                  key={q.id}
                  quest={q}
                  subtitle={withPack(`${nameOf(q.creator_id)} left one for ${nameOf(q.assignee_id)}`, q)}
                  onPreviewPhoto={setPreviewUrl}
                />
              ))}
            </>
          )}
        </>
        }
      />
      <ImageViewerModal uri={previewUrl} onClose={() => setPreviewUrl(null)} />
    </>
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
