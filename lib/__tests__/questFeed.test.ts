import { partitionQuests, removeQuestFromLists, replaceQuestInLists } from '../questFeed';
import { Quest } from '@/types/database';

const ME = 'me';
const ALICE = 'alice';
const BOB = 'bob';

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

describe('partitionQuests', () => {
  const targetedAtMe = quest({ creator_id: ALICE, assignee_id: ME });
  const openByAlice = quest({ creator_id: ALICE, assignee_id: null, mode: 'open' });
  const openByMe = quest({ creator_id: ME, assignee_id: null, mode: 'open' });
  const targetedByMe = quest({ creator_id: ME, assignee_id: ALICE });
  const betweenOthers = quest({ creator_id: ALICE, assignee_id: BOB });
  const completed = quest({ status: 'completed', finder_id: ME });

  const lists = partitionQuests(
    [targetedAtMe, openByAlice, openByMe, targetedByMe, betweenOthers],
    [completed],
    ME
  );

  it('puts quests targeted at me in forMe only', () => {
    expect(lists.forMe).toEqual([targetedAtMe]);
  });

  it('shows open quests from others as claimable, never my own', () => {
    expect(lists.openForPack).toEqual([openByAlice]);
  });

  it('groups everything I created under byMe, both modes', () => {
    expect(lists.byMe).toEqual([openByMe, targetedByMe]);
  });

  it('surfaces packmate-to-packmate quests as teasers', () => {
    expect(lists.aroundMyPacks).toEqual([betweenOthers]);
  });

  it('passes completed quests through', () => {
    expect(lists.completedQuests).toEqual([completed]);
  });
});

describe('removeQuestFromLists / replaceQuestInLists', () => {
  const byMe = quest({ id: 'mine', creator_id: ME, assignee_id: ALICE, created_at: '2026-07-02T00:00:00Z' });
  const other = quest({ id: 'other', creator_id: ALICE, assignee_id: ME });
  const lists = partitionQuests([byMe, other], [], ME);

  it('removes a quest from whichever section holds it', () => {
    const next = removeQuestFromLists(lists, 'mine');
    expect(next.byMe).toEqual([]);
    expect(next.forMe).toEqual([other]);
  });

  it('returns the same lists when the id is unknown', () => {
    expect(removeQuestFromLists(lists, 'nope')).toBe(lists);
  });

  it('re-partitions an edited quest (targeted -> open stays in byMe, newest first)', () => {
    const edited = { ...byMe, assignee_id: null, mode: 'open' as const, description: 'new hint' };
    const next = replaceQuestInLists(lists, edited, ME);
    expect(next.byMe).toEqual([edited]);
    expect(next.forMe).toEqual([other]);
    expect(next.openForPack).toEqual([]);
  });

  it('places a completed edit in completedQuests', () => {
    const done = { ...byMe, status: 'completed' as const, completed_at: '2026-07-03T00:00:00Z' };
    const next = replaceQuestInLists(lists, done, ME);
    expect(next.byMe).toEqual([]);
    expect(next.completedQuests).toEqual([done]);
  });
});
