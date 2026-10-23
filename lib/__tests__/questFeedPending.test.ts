import { applyPendingMutations, findQuestInLists, partitionQuests } from '../questFeed';
import { PendingMutation } from '../offline';
import { Quest } from '@/types/database';

const ME = 'me';
const ALICE = 'alice';

function quest(overrides: Partial<Quest>): Quest {
  return {
    id: Math.random().toString(36).slice(2),
    pack_id: 'pack-1',
    creator_id: ALICE,
    assignee_id: ME,
    finder_id: null,
    mode: 'targeted',
    journey_id: null,
    status: 'active',
    description: null,
    photo_path: 'x/y/original.jpg',
    photo_full_path: null,
    photo_thumbnail_path: null,
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

const forMe = quest({ id: 'for-me', creator_id: ALICE, assignee_id: ME });
const mine = quest({ id: 'mine', creator_id: ME, assignee_id: ALICE });
const done = quest({ id: 'done', status: 'completed', finder_id: ME, completed_at: '2026-07-02T00:00:00Z' });
const lists = partitionQuests([forMe, mine], [done], ME);

const pendingCreate: PendingMutation = {
  id: 'new-quest',
  type: 'create_quest',
  payload: {
    questId: 'new-quest',
    packId: 'pack-1',
    creatorId: ME,
    assigneeId: ALICE,
    mode: 'targeted',
    journeyId: null,
    description: 'Red door',
    photoUri: 'file:///tmp/red-door.jpg',
    locationLat: 1,
    locationLng: 2,
    createdAt: '2026-07-03T00:00:00Z',
  },
};

const pendingComplete: PendingMutation = {
  id: 'for-me',
  type: 'complete_quest',
  payload: {
    questId: 'for-me',
    userId: ME,
    journeyId: 'walk-1',
    photoUri: 'file:///tmp/found.jpg',
    completedAt: '2026-07-04T00:00:00Z',
  },
};

describe('applyPendingMutations', () => {
  it('returns the same lists when the queue is empty', () => {
    expect(applyPendingMutations(lists, [], ME)).toBe(lists);
  });

  it('shows a queued create as a pending byMe row with its local photo', () => {
    const merged = applyPendingMutations(lists, [pendingCreate], ME);
    expect(merged.byMe.map((q) => q.id)).toEqual(['new-quest', 'mine']);
    expect(merged.byMe[0]).toMatchObject({
      pending: true,
      local_photo_uri: 'file:///tmp/red-door.jpg',
      description: 'Red door',
      assignee_id: ALICE,
      location_lat: null,
      location_lng: null,
    });
    expect(merged.forMe).toEqual(lists.forMe);
  });

  it('moves a queued completion out of the active sections into completed', () => {
    const merged = applyPendingMutations(lists, [pendingComplete], ME);
    expect(merged.forMe).toEqual([]);
    expect(merged.completedQuests.map((q) => q.id)).toEqual(['for-me', 'done']);
    expect(merged.completedQuests[0]).toMatchObject({
      pending: true,
      status: 'completed',
      finder_id: ME,
      completed_at: '2026-07-04T00:00:00Z',
      completion_journey_id: 'walk-1',
      local_completion_uri: 'file:///tmp/found.jpg',
    });
  });

  it('does not duplicate a create the server already returned', () => {
    const synced = quest({ id: 'new-quest', creator_id: ME });
    const withSynced = partitionQuests([synced], [], ME);
    const merged = applyPendingMutations(withSynced, [pendingCreate], ME);
    expect(merged.byMe).toEqual([synced]);
  });

  it('ignores queued creates from another account', () => {
    const merged = applyPendingMutations(lists, [pendingCreate], ALICE);
    expect(merged.byMe).toEqual(lists.byMe);
  });
});

describe('findQuestInLists', () => {
  it('finds quests in any section', () => {
    expect(findQuestInLists(lists, 'done')?.id).toBe('done');
    expect(findQuestInLists(lists, 'mine')?.id).toBe('mine');
    expect(findQuestInLists(lists, 'nope')).toBeNull();
  });
});
