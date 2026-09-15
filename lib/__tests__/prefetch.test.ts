jest.mock('expo-image', () => ({ Image: { loadAsync: jest.fn() } }));
jest.mock('@/lib/signedUrls', () => ({ getSignedPhotoUrl: jest.fn() }));

import { photoPathsToPrefetch, prefetchQuestPhotos, resetPrefetchMemory } from '../prefetch';
import { EMPTY_QUEST_LISTS, FeedQuest, QuestLists } from '../questFeed';

function quest(id: string, overrides: Partial<FeedQuest> = {}): FeedQuest {
  return {
    id,
    pack_id: 'p',
    creator_id: 'a',
    assignee_id: 'me',
    finder_id: null,
    mode: 'targeted',
    journey_id: null,
    status: 'active',
    description: null,
    photo_path: `${id}/original.jpg`,
    photo_full_path: null,
    photo_thumbnail_path: `${id}/thumb.jpg`,
    location_lat: null,
    location_lng: null,
    completion_photo_path: null,
    completion_full_path: null,
    completion_thumbnail_path: null,
    completion_journey_id: null,
    completed_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

const lists: QuestLists = {
  ...EMPTY_QUEST_LISTS,
  forMe: [quest('for-me')],
  openForPack: [quest('open')],
  byMe: [quest('mine'), quest('queued', { pending: true, photo_path: '', photo_thumbnail_path: null })],
  aroundMyPacks: [quest('theirs', { photo_thumbnail_path: null })],
  completedQuests: [quest('done', { status: 'completed' })],
};

describe('photoPathsToPrefetch', () => {
  it('warms active thumbnails plus the detail image for quests targeted at me', () => {
    expect(photoPathsToPrefetch(lists).sort()).toEqual(
      ['for-me/thumb.jpg', 'for-me/original.jpg', 'open/thumb.jpg', 'mine/thumb.jpg', 'theirs/original.jpg'].sort()
    );
  });
});

describe('prefetchQuestPhotos', () => {
  beforeEach(resetPrefetchMemory);

  it('attempts every path once, keeps going past failures, and retries them next time', async () => {
    const load = jest.fn(async (path: string) => {
      if (path === 'open/thumb.jpg') throw new Error('offline');
    });

    await prefetchQuestPhotos(lists, load);
    expect(load).toHaveBeenCalledTimes(5);

    load.mockClear();
    await prefetchQuestPhotos(lists, load);
    expect(load.mock.calls.map(([p]) => p)).toEqual(['open/thumb.jpg']);
  });
});
