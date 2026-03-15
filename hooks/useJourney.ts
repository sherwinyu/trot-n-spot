import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Journey } from '@/types/database';

export function useJourney() {
  const { user } = useAuth();
  const [activeJourney, setActiveJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);
  const [journeyDuration, setJourneyDuration] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  const fetchActiveJourney = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('journeys')
      .select('*')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setActiveJourney(data as Journey | null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchActiveJourney();
  }, [fetchActiveJourney]);

  // Update duration every second when journey is active
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (activeJourney && !activeJourney.ended_at) {
      const updateDuration = () => {
        const start = new Date(activeJourney.started_at).getTime();
        setJourneyDuration(Math.floor((Date.now() - start) / 1000));
      };
      updateDuration();
      intervalRef.current = setInterval(updateDuration, 1000);
    } else {
      setJourneyDuration(0);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeJourney]);

  const startJourney = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('journeys')
      .insert({ user_id: user.id })
      .select()
      .single();

    if (!error && data) setActiveJourney(data as Journey);
  }, [user]);

  const endJourney = useCallback(async () => {
    if (!activeJourney) return;
    const { data, error } = await supabase
      .from('journeys')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', activeJourney.id)
      .select()
      .single();

    if (!error) {
      setActiveJourney(null);
      setJourneyDuration(0);
    }
  }, [activeJourney]);

  return { activeJourney, startJourney, endJourney, journeyDuration, loading };
}
