import {
  buildTimeline,
  describeTimelineEntry,
  normalizeCommentBody,
  summarizeReactions,
  toggleReaction,
} from '@/lib/questActivity';
import { QuestComment, QuestReaction } from '@/types/database';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const SHERWIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NADIA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const names = { [SHERWIN]: 'Sherwin', [NADIA]: 'Nadia' };

const reaction = (user_id: string, kind: QuestReaction['kind'], created_at: string): QuestReaction => ({
  quest_id: 'q1',
  user_id,
  kind,
  created_at,
});

const comment = (id: string, author_id: string, created_at: string): QuestComment => ({
  id,
  quest_id: 'q1',
  pack_id: 'p1',
  author_id,
  body: `comment ${id}`,
  created_at,
});

const quest = {
  id: 'q1',
  creator_id: SHERWIN,
  assignee_id: NADIA,
  finder_id: NADIA,
  status: 'completed' as const,
  created_at: '2026-09-29T10:00:00Z',
  completed_at: '2026-09-29T12:00:00Z',
};

describe('normalizeCommentBody', () => {
  it('trims and rejects blank or oversized comments', () => {
    expect(normalizeCommentBody('  hi  ')).toBe('hi');
    expect(normalizeCommentBody('   ')).toBeNull();
    expect(normalizeCommentBody('x'.repeat(501))).toBeNull();
  });
});

describe('toggleReaction', () => {
  it('adds a missing reaction and removes an existing one', () => {
    const now = new Date('2026-09-29T11:00:00Z');
    const added = toggleReaction([], 'q1', NADIA, 'love', now);
    expect(added).toEqual([reaction(NADIA, 'love', now.toISOString())]);
    const withOther = [...added, reaction(SHERWIN, 'love', now.toISOString())];
    expect(toggleReaction(withOther, 'q1', NADIA, 'love')).toEqual([reaction(SHERWIN, 'love', now.toISOString())]);
  });
});

describe('summarizeReactions', () => {
  it('counts every kind in display order and flags the viewer\'s own', () => {
    const summary = summarizeReactions(
      [reaction(NADIA, 'love', 't'), reaction(SHERWIN, 'love', 't'), reaction(NADIA, 'fire', 't')],
      SHERWIN
    );
    expect(summary.map((s) => [s.kind, s.count, s.mine])).toEqual([
      ['love', 2, true],
      ['laugh', 0, false],
      ['wow', 0, false],
      ['paw', 0, false],
      ['fire', 1, false],
    ]);
  });
});

describe('buildTimeline', () => {
  it('merges lifecycle, reactions, and comments oldest first', () => {
    const timeline = buildTimeline(
      quest,
      [comment('c2', SHERWIN, '2026-09-29T12:30:00Z'), comment('c1', NADIA, '2026-09-29T11:00:00Z')],
      [reaction(NADIA, 'love', '2026-09-29T10:30:00Z')]
    );
    expect(timeline.map((e) => e.key)).toEqual([
      'created:q1',
      'reaction:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:love',
      'comment:c1',
      'completed:q1',
      'comment:c2',
    ]);
  });

  it('omits the find for an active quest', () => {
    const timeline = buildTimeline({ ...quest, status: 'active', finder_id: null, completed_at: null }, [], []);
    expect(timeline.map((e) => e.kind)).toEqual(['created']);
  });
});

describe('describeTimelineEntry', () => {
  it('names the actor, or "You" for the viewer', () => {
    const [created, completed] = buildTimeline(quest, [], []);
    if (created.kind === 'comment' || completed.kind === 'comment') throw new Error('unexpected comment');
    expect(describeTimelineEntry(created, names, SHERWIN)).toBe('You spotted this');
    expect(describeTimelineEntry(completed, names, SHERWIN)).toBe('Nadia found it');
    expect(
      describeTimelineEntry({ kind: 'reaction', key: 'r', at: 't', actorId: 'zzz', reaction: 'paw' }, names, SHERWIN)
    ).toBe('A packmate reacted 🐾');
  });
});
