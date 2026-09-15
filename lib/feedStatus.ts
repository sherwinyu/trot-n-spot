import { FetchState } from '@/hooks/useQuests';
import { getTimeAgo } from '@/lib/format';

// One line about where the quests on screen came from. Hidden once a
// fetch has succeeded this session.
export function feedStatusMessage(
  fetchState: FetchState,
  lastFetchedAt: number | null,
  isOnline: boolean | null,
  now: number = Date.now()
): string | null {
  const updated = lastFetchedAt ? `Updated ${getTimeAgo(new Date(lastFetchedAt).toISOString(), now)}` : null;
  switch (fetchState) {
    case 'fresh':
      return null;
    case 'fetching':
      return updated ? `${updated} · Refreshing…` : 'Loading quests…';
    case 'offline':
      return updated ? `Offline · ${updated}` : 'Offline · no saved quests yet';
    case 'error':
      return updated ? `Couldn’t refresh · ${updated}` : 'Couldn’t load quests';
    case 'idle':
      if (isOnline === false) return updated ? `Offline · ${updated}` : 'Offline · no saved quests yet';
      return updated;
  }
}
