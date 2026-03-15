import { useState, useCallback } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export function useCompleteQuest() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeQuest = useCallback(async ({
    questId,
    photoUri,
    journeyId,
  }: {
    questId: string;
    photoUri: string;
    journeyId?: string;
  }) => {
    if (!user) {
      setError('Must be signed in');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Compress photo
      const manipulated = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Upload completion photo
      const photoPath = `${user.id}/${questId}/completion.jpg`;
      const response = await fetch(manipulated.uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('quest-photos')
        .upload(photoPath, arrayBuffer, {
          contentType: 'image/jpeg',
        });

      if (uploadError) throw uploadError;

      // Complete quest via RPC
      const { data, error: rpcError } = await supabase.rpc('complete_quest', {
        p_quest_id: questId,
        p_photo_path: photoPath,
        p_journey_id: journeyId ?? null,
      });

      if (rpcError) throw rpcError;
      if (data?.error) throw new Error(data.error);

      return data;
    } catch (err: any) {
      setError(err.message ?? 'Failed to complete quest');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  return { completeQuest, loading, error };
}
