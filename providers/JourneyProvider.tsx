import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { Journey } from '@/types/database';
import { endWalk, fetchActiveJourney, fetchRecentJourneys, startWalk, WalkStartOffset } from '@/lib/journeys';
import { setWalkReminderAccount, syncWalkReminders } from '@/lib/walkReminders';

type JourneyContextType = {
  activeJourney: Journey | null;
  loading: boolean;
  isBusy: boolean;
  error: string | null;
  reminderError: string | null;
  journeyDuration: number;
  startJourney: (minutesAgo?: WalkStartOffset) => Promise<void>;
  endJourney: () => Promise<void>;
  refreshJourney: () => Promise<void>;
};
const JourneyContext = createContext<JourneyContextType | null>(null);

export function JourneyProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const owner = useRef(userId);
  owner.current = userId;
  const version = useRef(0);
  const operation = useRef(false);
  const [activeJourney, setActiveJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [journeyDuration, setJourneyDuration] = useState(0);

  const syncReminders = useCallback(async (journeys: Journey[]) => {
    if (!userId || owner.current !== userId) return;
    try {
      await syncWalkReminders(userId, journeys);
      if (owner.current === userId) setReminderError(null);
    } catch {
      if (owner.current === userId) setReminderError('Walk reminders could not be refreshed. Open the app to retry.');
    }
  }, [userId]);

  const refreshJourney = useCallback(async () => {
    if (!userId || operation.current) return;
    const request = ++version.current;
    try {
      const [active, recent] = await Promise.all([fetchActiveJourney(userId), fetchRecentJourneys(userId)]);
      if (owner.current !== userId || version.current !== request) return;
      setActiveJourney(active);
      setError(null);
      await syncReminders(active ? [...recent, active] : recent);
    } catch {
      if (owner.current === userId && version.current === request) setError('Could not load your walk. Check your connection and retry.');
    } finally {
      if (owner.current === userId && version.current === request) setLoading(false);
    }
  }, [userId, syncReminders]);
  const refreshRef = useRef(refreshJourney);
  refreshRef.current = refreshJourney;

  useEffect(() => {
    if (authLoading) return;
    version.current++;
    setActiveJourney(null);
    setJourneyDuration(0);
    setLoading(!!userId);
    setError(null);
    setWalkReminderAccount(userId).then(refreshJourney).catch(() => {
      setReminderError('Walk reminders could not be refreshed. Open the app to retry.');
      refreshJourney();
    });
  }, [userId, authLoading, refreshJourney]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshJourney();
    });
    return () => sub.remove();
  }, [refreshJourney]);

  useEffect(() => {
    if (!activeJourney) { setJourneyDuration(0); return; }
    const update = () => setJourneyDuration(Math.max(0, Math.floor((Date.now() - Date.parse(activeJourney.started_at)) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [activeJourney]);

  const mutate = useCallback(async (kind: 'start' | 'end', minutesAgo: WalkStartOffset = 0) => {
    if (!userId) throw new Error('Sign in to log a walk.');
    if (operation.current) return;
    operation.current = true;
    version.current++;
    setIsBusy(true);
    try {
      const journey = kind === 'start' ? await startWalk(userId, minutesAgo)
        : activeJourney ? await endWalk(activeJourney.id, userId) : null;
      if (owner.current !== userId || !journey) return;
      setActiveJourney(journey.ended_at ? null : journey);
      setError(null);
      setLoading(false);
      await syncReminders([journey]);
    } finally {
      operation.current = false;
      setIsBusy(false);
      if (owner.current !== userId) void refreshRef.current();
    }
  }, [userId, activeJourney, syncReminders]);

  const startJourney = useCallback((minutesAgo: WalkStartOffset = 0) => mutate('start', minutesAgo), [mutate]);
  const endJourney = useCallback(() => mutate('end'), [mutate]);
  return <JourneyContext.Provider value={{ activeJourney, loading, isBusy, error, reminderError, journeyDuration, startJourney, endJourney, refreshJourney }}>{children}</JourneyContext.Provider>;
}

export function useJourney() {
  const value = useContext(JourneyContext);
  if (!value) throw new Error('useJourney requires JourneyProvider');
  return value;
}
