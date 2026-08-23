import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';

const IMMUTABLE_CACHE_SECONDS = '31536000';

export type PhotoVariants = {
  fullUri: string;
  detailUri: string;
  thumbnailUri: string;
};

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

export async function createPhotoVariants(photoUri: string): Promise<PhotoVariants> {
  // Keep the captured pixel dimensions for archival/download use, while
  // normalizing the file to a maximum-quality JPEG. Generate the smaller
  // variants sequentially to avoid decoding a multi-megapixel photo several
  // times concurrently on memory-constrained phones.
  const full = await ImageManipulator.manipulateAsync(
    photoUri,
    [],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
  );
  const detail = await ImageManipulator.manipulateAsync(
    photoUri,
    [{ resize: { width: 1200 } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
  );
  // 480 px covers an 80-point feed image at 3x density and remains sharp in
  // the wider side-by-side history cards without serving the detail image.
  const thumbnail = await ImageManipulator.manipulateAsync(
    photoUri,
    [{ resize: { width: 480 } }],
    { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG }
  );

  return {
    fullUri: full.uri,
    detailUri: detail.uri,
    thumbnailUri: thumbnail.uri,
  };
}

function isDuplicateUpload(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { statusCode?: string | number; error?: string; message?: string };
  return (
    String(candidate.statusCode) === '409' ||
    candidate.error === 'Duplicate' ||
    /already exists|duplicate/i.test(candidate.message ?? '')
  );
}

export async function uploadPhoto(localUri: string, storagePath: string): Promise<void> {
  if (Platform.OS === 'web') {
    // On web the URI is a blob:/data: URL that fetch can read into a Blob.
    const response = await fetch(localUri);
    const blob = await response.blob();
    const { error } = await supabase.storage
      .from('quest-photos')
      .upload(storagePath, blob, {
        contentType: 'image/jpeg',
        cacheControl: IMMUTABLE_CACHE_SECONDS,
        upsert: false,
      });
    // Offline replay may retry after the upload succeeded but its response was
    // lost. Immutable paths make an existing object equivalent to success.
    if (error && !isDuplicateUpload(error)) throw error;
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
    .upload(storagePath, formData, {
      contentType: 'image/jpeg',
      cacheControl: IMMUTABLE_CACHE_SECONDS,
      upsert: false,
    });

  if (error && !isDuplicateUpload(error)) throw error;
}
