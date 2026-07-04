import { StyleSheet, TouchableOpacity, TextInput, Image, ActivityIndicator, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { useCreateQuest } from '@/hooks/useCreateQuest';
import { useJourney } from '@/hooks/useJourney';
import { capturePhoto } from '@/lib/photos';
import { notify } from '@/lib/notify';

export default function CreateScreen() {
  const { user, packs } = useAuth();
  const { createQuest, loading, error } = useCreateQuest();
  const { activeJourney } = useJourney();
  const c = Colors[useColorScheme() ?? 'light'];
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [packId, setPackId] = useState<string | null>(null);
  // null = open to the whole pack; otherwise a packmate's user id
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  const selectedPack = packs.find((p) => p.id === packId) ?? packs[0] ?? null;
  const packmates = selectedPack
    ? selectedPack.members.filter((m) => m.user_id !== user?.id)
    : [];

  // Default the recipient: a two-person pack keeps today's "for your
  // person" feel; bigger packs default to open-to-the-pack.
  useEffect(() => {
    if (!selectedPack) return;
    setAssigneeId(packmates.length === 1 ? packmates[0].user_id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPack?.id]);

  const pickPhoto = async () => {
    const uri = await capturePhoto();
    if (uri) setPhotoUri(uri);
  };

  const handleSend = async () => {
    if (!photoUri) {
      notify('Photo required', 'Take a photo of something for your pack to find!');
      return;
    }
    if (!selectedPack) {
      notify('No pack', 'Join or create a pack first.');
      return;
    }

    const result = await createQuest({
      photoUri,
      description: description.trim() || undefined,
      journeyId: activeJourney?.id,
      packId: selectedPack.id,
      assigneeId,
    });

    if (result) {
      const recipientName = assigneeId
        ? packmates.find((m) => m.user_id === assigneeId)?.profile?.display_name ?? 'them'
        : null;
      notify(
        'Quest sent!',
        result.queued
          ? "You're offline — it will send when you're back online."
          : recipientName
            ? `${recipientName} has a new quest to find.`
            : `Your pack has a new open quest — first to find it wins.`
      );
      setPhotoUri(null);
      setDescription('');
    }
  };

  return (
    <View style={styles.container}>
      {!photoUri ? (
        <TouchableOpacity style={styles.cameraButton} onPress={pickPhoto}>
          <Text style={styles.cameraIcon}>📷</Text>
          <Text style={styles.cameraText}>Take a Photo</Text>
          <Text style={styles.cameraSubtext}>
            Photograph something for your pack to find
          </Text>
        </TouchableOpacity>
      ) : (
        <ScrollView style={styles.previewContainer} contentContainerStyle={styles.previewContent}>
          <Image source={{ uri: photoUri }} style={styles.preview} />

          <TextInput
            style={[
              styles.descriptionInput,
              { backgroundColor: c.inputBackground, color: c.inputText, borderColor: c.border },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Add a hint or description (optional)"
            placeholderTextColor={c.placeholder}
            multiline
            maxLength={200}
          />

          {packs.length > 1 && (
            <>
              <Text style={styles.pickerLabel}>Pack</Text>
              <View style={styles.chipRow}>
                {packs.map((pack) => (
                  <TouchableOpacity
                    key={pack.id}
                    style={[styles.chip, selectedPack?.id === pack.id && styles.chipSelected]}
                    onPress={() => setPackId(pack.id)}
                  >
                    <Text
                      style={[styles.chipText, selectedPack?.id === pack.id && styles.chipTextSelected]}
                    >
                      {pack.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.pickerLabel}>For</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, assigneeId === null && styles.chipSelected]}
              onPress={() => setAssigneeId(null)}
            >
              <Text style={[styles.chipText, assigneeId === null && styles.chipTextSelected]}>
                Whole pack
              </Text>
            </TouchableOpacity>
            {packmates.map((m) => (
              <TouchableOpacity
                key={m.user_id}
                style={[styles.chip, assigneeId === m.user_id && styles.chipSelected]}
                onPress={() => setAssigneeId(m.user_id)}
              >
                <Text style={[styles.chipText, assigneeId === m.user_id && styles.chipTextSelected]}>
                  {m.profile?.display_name ?? '?'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={pickPhoto}
              disabled={loading}
            >
              <Text style={styles.retakeText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendText}>Send Quest</Text>
              )}
            </TouchableOpacity>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  cameraButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 16,
    margin: 16,
  },
  cameraIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  cameraText: {
    fontSize: 20,
    fontWeight: '600',
  },
  cameraSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  previewContainer: {
    flex: 1,
  },
  previewContent: {
    paddingBottom: 24,
  },
  preview: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: 16,
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  chipSelected: {
    backgroundColor: '#4285F4',
    borderColor: '#4285F4',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#fff',
  },
  actions: {
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
  sendButton: {
    flex: 2,
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendText: {
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
