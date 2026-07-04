import { StyleSheet, TouchableOpacity, TextInput, Image, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useCreateQuest } from '@/hooks/useCreateQuest';
import { useJourney } from '@/hooks/useJourney';
import { capturePhoto } from '@/lib/photos';
import { notify } from '@/lib/notify';

export default function CreateScreen() {
  const { createQuest, loading, error } = useCreateQuest();
  const { activeJourney } = useJourney();
  const c = Colors[useColorScheme() ?? 'light'];
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  const pickPhoto = async () => {
    const uri = await capturePhoto();
    if (uri) setPhotoUri(uri);
  };

  const handleSend = async () => {
    if (!photoUri) {
      notify('Photo required', 'Take a photo of something for your partner to find!');
      return;
    }

    const result = await createQuest({
      photoUri,
      description: description.trim() || undefined,
      journeyId: activeJourney?.id,
    });

    if (result) {
      notify(
        'Quest sent!',
        result.queued
          ? "You're offline — it will send when you're back online."
          : 'Your partner has a new quest to find.'
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
            Photograph something for your partner to find
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.previewContainer}>
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
        </View>
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
