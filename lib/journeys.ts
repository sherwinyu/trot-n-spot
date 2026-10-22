import { supabase } from '@/lib/supabase';
import { Journey } from '@/types/database';

export const WALK_START_OFFSETS = [0, 10, 20, 30] as const;
export type WalkStartOffset = typeof WALK_START_OFFSETS[number];

export async function fetchActiveJourney(userId: string): Promise<Journey | null> {
  const { data, error } = await supabase.from('journeys').select('*').eq('user_id', userId)
    .is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchRecentJourneys(userId: string): Promise<Journey[]> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 1);
  const { data, error } = await supabase.from('journeys').select('*').eq('user_id', userId)
    .gte('started_at', since.toISOString()).order('started_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function startWalk(userId: string, minutesAgo: WalkStartOffset = 0): Promise<Journey> {
  if (!WALK_START_OFFSETS.includes(minutesAgo)) throw new Error('Choose now, 10, 20, or 30 minutes ago.');
  const active = await fetchActiveJourney(userId);
  if (active) return active;
  const startedAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  if (minutesAgo > 0) {
    const { data, error } = await supabase.from('journeys').select('id').eq('user_id', userId)
      .gt('ended_at', startedAt).limit(1).maybeSingle();
    if (error) throw error;
    if (data) throw new Error('That overlaps another walk. Choose a later start time.');
  }
  const { data, error } = await supabase.from('journeys')
    .insert({ user_id: userId, started_at: startedAt }).select().single();
  if (error) throw error;
  if (!data) throw new Error('Could not start your walk. Please try again.');
  return data;
}

export async function endWalk(journeyId: string, userId: string): Promise<Journey> {
  const { data, error } = await supabase.from('journeys').update({ ended_at: new Date().toISOString() })
    .eq('id', journeyId).eq('user_id', userId).select().single();
  if (error) throw error;
  if (!data) throw new Error('Could not end your walk. Please try again.');
  return data;
}
