import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';

// Camera capture isn't available on desktop web, so fall back to the
// file picker there. Native always uses the camera per the spec.
export async function capturePhoto(): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
  };

  const result =
    Platform.OS === 'web'
      ? await ImagePicker.launchImageLibraryAsync(options)
      : await ImagePicker.launchCameraAsync(options);

  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

export async function compressPhoto(photoUri: string): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    photoUri,
    [{ resize: { width: 1200 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  return manipulated.uri;
}

export async function uploadPhoto(localUri: string, storagePath: string): Promise<void> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();

  const { error } = await supabase.storage
    .from('quest-photos')
    .upload(storagePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

  if (error) throw error;
}
