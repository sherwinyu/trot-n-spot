import { useState, useCallback } from 'react';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { getCurrentLocation } from '@/lib/location';
import { Quest } from '@/types/database';

export function useCreateQuest() {
  const { user, partner } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createQuest = useCallback(async ({
    photoUri,
    description,
    journeyId,
  }: {
    photoUri: string;
    description?: string;
    journeyId?: string;
  }): Promise<Quest | null> => {
    if (!user || !partner) {
      setError('Must be signed in and paired');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const questId = Crypto.randomUUID();

      // Get location
      const location = await getCurrentLocation();

      // Compress photo
      const manipulated = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Upload photo
      const photoPath = `${user.id}/${questId}/original.jpg`;
      const response = await fetch(manipulated.uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('quest-photos')
        .upload(photoPath, arrayBuffer, {
          contentType: 'image/jpeg',
        });

      if (uploadError) throw uploadError;

      // Create quest row
      const { data, error: insertError } = await supabase
        .from('quests')
        .insert({
          id: questId,
          creator_id: user.id,
          assignee_id: partner.id,
          journey_id: journeyId ?? null,
          description: description ?? null,
          photo_path: photoPath,
          location_lat: location?.lat ?? null,
          location_lng: location?.lng ?? null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return data as Quest;
    } catch (err: any) {
      setError(err.message ?? 'Failed to create quest');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, partner]);

  return { createQuest, loading, error };
}
