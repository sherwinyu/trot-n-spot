import AsyncStorage from '@react-native-async-storage/async-storage';

// Minimal offline support: quest mutations that fail due to lack of
// connectivity are queued here (with their local photo URI and the
// location captured at creation time) and replayed when we're back
// online. Reads are served from a cached copy of the last good fetch.
// Deliberately not PowerSync — two users, simple conflict surface.

export type PendingMutation =
  | {
      id: string; // quest id (client-generated UUID)
      type: 'create_quest';
      payload: {
        questId: string;
        packId: string;
        creatorId: string;
        assigneeId: string | null; // null = open to the pack
        mode: 'targeted' | 'open';
        journeyId: string | null;
        description: string | null;
        photoUri: string; // local file URI, uploaded on flush
        locationLat: number | null;
        locationLng: number | null;
        createdAt: string;
      };
    }
  | {
      id: string;
      type: 'complete_quest';
      payload: {
        questId: string;
        userId: string;
        journeyId: string | null;
        photoUri: string;
        completedAt: string;
      };
    };

const QUEUE_KEY = 'offline:mutation-queue';
const CACHE_PREFIX = 'offline:cache:';

export async function getQueue(): Promise<PendingMutation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function enqueue(mutation: PendingMutation): Promise<void> {
  const queue = await getQueue();
  // Replace any earlier mutation for the same quest+type (e.g. retake
  // photo while still offline) instead of duplicating it.
  const filtered = queue.filter((m) => !(m.id === mutation.id && m.type === mutation.type));
  filtered.push(mutation);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

async function removeFromQueue(mutation: PendingMutation): Promise<void> {
  const queue = await getQueue();
  await AsyncStorage.setItem(
    QUEUE_KEY,
    JSON.stringify(queue.filter((m) => !(m.id === mutation.id && m.type === mutation.type)))
  );
}

export type FlushHandlers = {
  create_quest: (payload: Extract<PendingMutation, { type: 'create_quest' }>['payload']) => Promise<void>;
  complete_quest: (payload: Extract<PendingMutation, { type: 'complete_quest' }>['payload']) => Promise<void>;
};

// Replays queued mutations oldest-first. Stops at the first failure
// (probably still offline); the rest stay queued for the next flush.
// Returns how many mutations were successfully synced.
export async function flushQueue(handlers: FlushHandlers): Promise<number> {
  const queue = await getQueue();
  let synced = 0;

  for (const mutation of queue) {
    try {
      if (mutation.type === 'create_quest') {
        await handlers.create_quest(mutation.payload);
      } else {
        await handlers.complete_quest(mutation.payload);
      }
      await removeFromQueue(mutation);
      synced++;
    } catch (err) {
      if (isNetworkError(err)) break; // still offline, try again later
      // Permanent failure (RLS rejection, bad data): drop it so the
      // queue doesn't wedge. The quest simply won't exist.
      console.warn('Dropping unsyncable mutation', mutation.type, mutation.id, err);
      await removeFromQueue(mutation);
    }
  }

  return synced;
}

// Supabase-js surfaces connectivity failures as fetch TypeErrors with
// these messages (RN: "Network request failed", web: "Failed to fetch").
export function isNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /network request failed|failed to fetch|fetch failed|network error/i.test(message);
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
