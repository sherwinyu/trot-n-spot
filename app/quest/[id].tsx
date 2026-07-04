import { StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useState, useEffect } from 'react';
import { Text, View } from '@/components/Themed';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useCompleteQuest } from '@/hooks/useCompleteQuest';
import { useJourney } from '@/hooks/useJourney';
import { QUEST_COLUMNS_NO_LOCATION } from '@/hooks/useQuests';
import { capturePhoto } from '@/lib/photos';
import { notify } from '@/lib/notify';
import { Quest } from '@/types/database';

export default function QuestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { completeQuest, loading: completing, error } = useCompleteQuest();
  const { activeJourney } = useJourney();

  const [quest, setQuest] = useState<Quest | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [completionPhotoUrl, setCompletionPhotoUrl] = useState<string | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  useEffect(() => {
    async function fetchQuest() {
      // Never pull location with the quest itself — the assignee's
      // device shouldn't receive coordinates for an active hunt.
      const { data } = await supabase
        .from('quests')
        .select(QUEST_COLUMNS_NO_LOCATION)
        .eq('id', id)
        .single();

      if (data) {
        const q = data as unknown as Quest;
        setQuest(q);

        // Location is only for the creator, or for both after
        // completion (the fun reveal of where it was spotted).
        if (user && (q.creator_id === user.id || q.status === 'completed')) {
          const { data: loc } = await supabase
            .from('quests')
            .select('location_lat, location_lng')
            .eq('id', id)
            .single();
          if (loc?.location_lat != null && loc?.location_lng != null) {
            setLocation({ lat: loc.location_lat, lng: loc.location_lng });
          }
        }

        const { data: signed } = await supabase.storage
          .from('quest-photos')
          .createSignedUrl(q.photo_path, 3600);
        if (signed) setPhotoUrl(signed.signedUrl);

        if (q.completion_photo_path) {
          const { data: compSigned } = await supabase.storage
            .from('quest-photos')
            .createSignedUrl(q.completion_photo_path, 3600);
          if (compSigned) setCompletionPhotoUrl(compSigned.signedUrl);
        }
      }
      setLoading(false);
    }
    fetchQuest();
  }, [id, user]);

  const isAssignee = quest?.assignee_id === user?.id;
  const isActive = quest?.status === 'active';

  const handleFoundIt = async () => {
    const uri = await capturePhoto();
    if (uri) setCapturedUri(uri);
  };

  const handleConfirmCompletion = async () => {
    if (!capturedUri || !quest) return;

    const result = await completeQuest({
      questId: quest.id,
      photoUri: capturedUri,
      journeyId: activeJourney?.id,
    });

    if (result) {
      notify(
        'Quest Complete!',
        result.queued ? "Nice find! It will sync when you're back online." : 'Nice find!',
        () => router.back()
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!quest) {
    return (
      <View style={styles.centered}>
        <Text>Quest not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: quest.description || 'Quest' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {photoUrl && (
          <Image source={{ uri: photoUrl }} style={styles.mainPhoto} />
        )}

        {quest.description && (
          <Text style={styles.description}>{quest.description}</Text>
        )}

        <Text style={styles.meta}>
          Created {new Date(quest.created_at).toLocaleDateString()}
        </Text>

        {location && (
          <Text style={styles.meta}>
            📍 Spotted at {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </Text>
        )}

        {quest.status === 'completed' && completionPhotoUrl && (
          <>
            <Text style={styles.sectionLabel}>Found!</Text>
            <Image source={{ uri: completionPhotoUrl }} style={styles.mainPhoto} />
            {quest.completed_at && (
              <Text style={styles.meta}>
                Completed {new Date(quest.completed_at).toLocaleDateString()}
              </Text>
            )}
          </>
        )}

        {/* Completion flow for assignee */}
        {isAssignee && isActive && !capturedUri && (
          <TouchableOpacity style={styles.foundButton} onPress={handleFoundIt}>
            <Text style={styles.foundButtonText}>I Found It!</Text>
          </TouchableOpacity>
        )}

        {/* Side-by-side comparison before confirming */}
        {capturedUri && (
          <>
            <Text style={styles.sectionLabel}>Compare</Text>
            <View style={styles.comparison}>
              {photoUrl && (
                <Image source={{ uri: photoUrl }} style={styles.comparisonPhoto} />
              )}
              <Image source={{ uri: capturedUri }} style={styles.comparisonPhoto} />
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={handleFoundIt}
                disabled={completing}
              >
                <Text style={styles.retakeText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirmCompletion}
                disabled={completing}
              >
                {completing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmText}>Complete Quest</Text>
                )}
              </TouchableOpacity>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainPhoto: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: 16,
  },
  description: {
    fontSize: 18,
    marginBottom: 8,
  },
  meta: {
    fontSize: 12,
    color: '#999',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
  },
  foundButton: {
    backgroundColor: '#34A853',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  foundButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  comparison: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  comparisonPhoto: {
    flex: 1,
    height: 200,
    borderRadius: 8,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'transparent',
  },
  retakeButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  retakeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
    backgroundColor: '#34A853',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginTop: 12,
  },
});
