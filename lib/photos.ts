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
  if (Platform.OS === 'web') {
    // On web the URI is a blob:/data: URL that fetch can read into a Blob.
    const response = await fetch(localUri);
    const blob = await response.blob();
    const { error } = await supabase.storage
      .from('quest-photos')
      .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    return;
  }

  // On native, React Native's fetch() can't read a local file:// URI on
  // Android (it throws "Network request failed"), so we can't turn the photo
  // into a Blob/ArrayBuffer in JS. Instead hand the file URI to a multipart
  // FormData and let the native networking layer stream it — supabase-js
  // sends a FormData body as-is.
  const formData = new FormData();
  formData.append('file', {
    uri: localUri,
    name: 'photo.jpg',
    type: 'image/jpeg',
  } as any);

  const { error } = await supabase.storage
    .from('quest-photos')
    .upload(storagePath, formData, { contentType: 'image/jpeg', upsert: true });

  if (error) throw error;
}
