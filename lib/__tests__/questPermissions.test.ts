import { canManageQuest, canReassignQuest, ownedPhotoPaths } from '@/lib/questPermissions';
import { Quest } from '@/types/database';

const CREATOR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSIGNEE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'q1',
    pack_id: 'p1',
    creator_id: CREATOR,
    assignee_id: ASSIGNEE,
    finder_id: null,
    mode: 'targeted',
    journey_id: null,
    status: 'active',
    description: 'The blue bench',
    photo_path: `${CREATOR}/q1/detail.jpg`,
    photo_full_path: `${CREATOR}/q1/full.jpg`,
    photo_thumbnail_path: `${CREATOR}/q1/thumbnail.jpg`,
    location_lat: null,
    location_lng: null,
    completion_photo_path: null,
    completion_full_path: null,
    completion_thumbnail_path: null,
    completion_journey_id: null,
    completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Quest;
}

describe('canManageQuest', () => {
  it('allows only the creator', () => {
    const quest = makeQuest();
    expect(canManageQuest(quest, CREATOR)).toBe(true);
    expect(canManageQuest(quest, ASSIGNEE)).toBe(false);
    expect(canManageQuest(quest, undefined)).toBe(false);
  });

  it('still allows the creator on completed quests (delete)', () => {
    expect(canManageQuest(makeQuest({ status: 'completed' }), CREATOR)).toBe(true);
  });
});

describe('canReassignQuest', () => {
  it('is creator-only and active-only', () => {
    expect(canReassignQuest(makeQuest(), CREATOR)).toBe(true);
    expect(canReassignQuest(makeQuest(), ASSIGNEE)).toBe(false);
    expect(canReassignQuest(makeQuest({ status: 'completed' }), CREATOR)).toBe(false);
  });
});

describe('ownedPhotoPaths', () => {
  it("returns the creator's quest photo variants", () => {
    expect(ownedPhotoPaths(makeQuest(), CREATOR)).toEqual([
      `${CREATOR}/q1/detail.jpg`,
      `${CREATOR}/q1/full.jpg`,
      `${CREATOR}/q1/thumbnail.jpg`,
    ]);
  });

  it('skips nulls and paths outside the user folder', () => {
    const quest = makeQuest({
      photo_full_path: null,
      photo_thumbnail_path: `${ASSIGNEE}/q1/thumbnail.jpg`,
    });
    expect(ownedPhotoPaths(quest, CREATOR)).toEqual([`${CREATOR}/q1/detail.jpg`]);
  });
});
