import { routeForActivity, unseenCount } from '@/lib/activity';
import { ActivityNotification } from '@/types/database';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

function item(overrides: Partial<ActivityNotification>): ActivityNotification {
  return {
    id: 'n1',
    user_id: 'u1',
    actor_id: 'u2',
    type: 'quest_created',
    quest_id: 'q1',
    pack_id: 'p1',
    title: 'Nadia spotted something',
    body: 'red mailbox',
    read_at: null,
    created_at: '2026-09-29T00:00:00Z',
    ...overrides,
  };
}

describe('unseenCount', () => {
  it('counts unread rows not yet acknowledged this session', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c', read_at: '2026-09-29T01:00:00Z' })];
    expect(unseenCount(items, new Set())).toBe(2);
    expect(unseenCount(items, new Set(['a']))).toBe(1);
    expect(unseenCount(items, new Set(['a', 'b']))).toBe(0);
  });
});

describe('routeForActivity', () => {
  it('matches the push tap destinations', () => {
    expect(routeForActivity(item({}))).toBe('/quest/q1');
    expect(routeForActivity(item({ type: 'quest_completed', quest_id: 'q9' }))).toBe('/quest/q9');
    expect(routeForActivity(item({ type: 'pack_joined', quest_id: null }))).toBe('/(auth)/packs');
  });
});
