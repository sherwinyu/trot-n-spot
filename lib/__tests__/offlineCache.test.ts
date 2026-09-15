import AsyncStorage from '@react-native-async-storage/async-storage';
import { cacheClearAll, cacheGet, cacheGetEntry, cacheSet, enqueue, getQueue } from '../offline';

describe('read cache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('records when an entry was written', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    await cacheSet('quests:u1', { forMe: [] });

    expect(await cacheGet('quests:u1')).toEqual({ forMe: [] });
    expect(await cacheGetEntry('quests:u1')).toEqual({
      value: { forMe: [] },
      updatedAt: 1_700_000_000_000,
    });
  });

  it('reads entries written before timestamps existed', async () => {
    await AsyncStorage.setItem('offline:cache:quests:u1', JSON.stringify({ forMe: [1] }));

    expect(await cacheGet('quests:u1')).toEqual({ forMe: [1] });
    expect(await cacheGetEntry('quests:u1')).toEqual({ value: { forMe: [1] }, updatedAt: null });
  });

  it('clears every cached read but leaves the mutation queue alone', async () => {
    await cacheSet('quests:u1', [1]);
    await cacheSet('account:u1', { profile: {} });
    await cacheSet('signed-urls', { 'a/b.jpg': { url: 'x', expiresAt: 1 } });
    await enqueue({
      id: 'q1',
      type: 'complete_quest',
      payload: { questId: 'q1', userId: 'u1', journeyId: null, photoUri: 'file:///p', completedAt: 'now' },
    });

    await cacheClearAll();

    expect(await cacheGet('quests:u1')).toBeNull();
    expect(await cacheGet('account:u1')).toBeNull();
    expect(await cacheGet('signed-urls')).toBeNull();
    expect(await getQueue()).toHaveLength(1);
  });
});
