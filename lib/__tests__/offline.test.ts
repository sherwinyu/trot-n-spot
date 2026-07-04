import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueue,
  getQueue,
  flushQueue,
  isNetworkError,
  cacheGet,
  cacheSet,
  PendingMutation,
} from '../offline';

const createMutation = (id: string): PendingMutation => ({
  id,
  type: 'create_quest',
  payload: {
    questId: id,
    packId: 'pack-1',
    creatorId: 'user-a',
    assigneeId: 'user-b',
    mode: 'targeted',
    journeyId: null,
    description: 'test quest',
    photoUri: 'file:///photo.jpg',
    locationLat: 38.9,
    locationLng: -77.0,
    createdAt: '2026-07-03T12:00:00Z',
  },
});

const completeMutation = (id: string): PendingMutation => ({
  id,
  type: 'complete_quest',
  payload: {
    questId: id,
    userId: 'user-b',
    journeyId: null,
    photoUri: 'file:///found.jpg',
    completedAt: '2026-07-03T13:00:00Z',
  },
});

beforeEach(() => AsyncStorage.clear());

describe('queue', () => {
  it('enqueues and reads back mutations', async () => {
    await enqueue(createMutation('q1'));
    await enqueue(completeMutation('q2'));
    const queue = await getQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].id).toBe('q1');
  });

  it('replaces a mutation with the same id+type instead of duplicating', async () => {
    await enqueue(createMutation('q1'));
    const retake = createMutation('q1');
    (retake.payload as any).photoUri = 'file:///retaken.jpg';
    await enqueue(retake);

    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect((queue[0].payload as any).photoUri).toBe('file:///retaken.jpg');
  });

  it('keeps create and complete for the same quest as separate entries', async () => {
    await enqueue(createMutation('q1'));
    await enqueue(completeMutation('q1'));
    expect(await getQueue()).toHaveLength(2);
  });
});

describe('flushQueue', () => {
  it('replays mutations in order and clears them on success', async () => {
    await enqueue(createMutation('q1'));
    await enqueue(completeMutation('q2'));
    const calls: string[] = [];

    const synced = await flushQueue({
      create_quest: async (p) => {
        calls.push(`create:${p.questId}`);
      },
      complete_quest: async (p) => {
        calls.push(`complete:${p.questId}`);
      },
    });

    expect(synced).toBe(2);
    expect(calls).toEqual(['create:q1', 'complete:q2']);
    expect(await getQueue()).toHaveLength(0);
  });

  it('stops at a network error and keeps remaining mutations queued', async () => {
    await enqueue(createMutation('q1'));
    await enqueue(createMutation('q2'));

    const synced = await flushQueue({
      create_quest: async (p) => {
        if (p.questId === 'q1') throw new TypeError('Network request failed');
      },
      complete_quest: async () => {},
    });

    expect(synced).toBe(0);
    expect(await getQueue()).toHaveLength(2);
  });

  it('drops permanently failing mutations so the queue does not wedge', async () => {
    await enqueue(createMutation('q1'));
    await enqueue(createMutation('q2'));

    const synced = await flushQueue({
      create_quest: async (p) => {
        if (p.questId === 'q1') throw new Error('row-level security violation');
      },
      complete_quest: async () => {},
    });

    expect(synced).toBe(1); // q2 synced, q1 dropped
    expect(await getQueue()).toHaveLength(0);
  });
});

describe('isNetworkError', () => {
  it.each([
    'Network request failed',
    'Failed to fetch',
    'fetch failed',
    'TypeError: Network error',
  ])('recognizes "%s"', (message) => {
    expect(isNetworkError(new Error(message))).toBe(true);
  });

  it('rejects application errors', () => {
    expect(isNetworkError(new Error('duplicate key value'))).toBe(false);
    expect(isNetworkError(new Error('row-level security violation'))).toBe(false);
  });
});

describe('cache', () => {
  it('round-trips values', async () => {
    await cacheSet('feed', { quests: [1, 2, 3] });
    expect(await cacheGet('feed')).toEqual({ quests: [1, 2, 3] });
  });

  it('returns null for missing keys', async () => {
    expect(await cacheGet('nope')).toBeNull();
  });
});
