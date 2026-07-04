import { partitionQuests } from '../questFeed';
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
    location_lat: null,
    location_lng: null,
    completion_photo_path: null,
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
