const mockFetch = jest.fn();
const mockInsertComment = jest.fn();
const mockDeleteComment = jest.fn();
const mockInsertReaction = jest.fn();
const mockDeleteReaction = jest.fn();

jest.mock('@/lib/questActivity', () => ({
  ...jest.requireActual('@/lib/questActivity'),
  fetchQuestActivity: (...args: unknown[]) => mockFetch(...args),
  insertComment: (...args: unknown[]) => mockInsertComment(...args),
  deleteComment: (...args: unknown[]) => mockDeleteComment(...args),
  insertReaction: (...args: unknown[]) => mockInsertReaction(...args),
  deleteReaction: (...args: unknown[]) => mockDeleteReaction(...args),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
const mockAuth = { user: { id: 'me' } };
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => mockAuth }));
jest.mock('@/providers/NotificationProvider', () => ({ useNotifications: () => ({ receivedCount: 0 }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-comment' }));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useQuestActivity } from '../useQuestActivity';

const existing = { id: 'c1', quest_id: 'q1', pack_id: 'p1', author_id: 'other', body: 'hi', created_at: 't' };

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ comments: [existing], reactions: [] });
});

it('loads the quest\'s comments and reactions', async () => {
  const { result } = renderHook(() => useQuestActivity('q1'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(mockFetch).toHaveBeenCalledWith('q1');
  expect(result.current.comments).toEqual([existing]);
});

it('posts a trimmed comment with a client id and appends it', async () => {
  const saved = { ...existing, id: 'new-comment', author_id: 'me', body: 'on my way' };
  mockInsertComment.mockResolvedValue(saved);
  const { result } = renderHook(() => useQuestActivity('q1'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let ok = false;
  await act(async () => { ok = await result.current.addComment('  on my way '); });

  expect(ok).toBe(true);
  expect(mockInsertComment).toHaveBeenCalledWith({ id: 'new-comment', quest_id: 'q1', author_id: 'me', body: 'on my way' });
  expect(result.current.comments).toEqual([existing, saved]);
});

it('does not post blank comments', async () => {
  const { result } = renderHook(() => useQuestActivity('q1'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  let ok = true;
  await act(async () => { ok = await result.current.addComment('   '); });
  expect(ok).toBe(false);
  expect(mockInsertComment).not.toHaveBeenCalled();
});

it('shows an offline message when posting fails for lack of network', async () => {
  mockInsertComment.mockRejectedValue(new Error('Network request failed'));
  const { result } = renderHook(() => useQuestActivity('q1'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.addComment('hello'); });
  expect(result.current.error).toMatch(/offline/);
  expect(result.current.comments).toEqual([existing]);
});

it('only lets the author delete a comment', async () => {
  mockDeleteComment.mockResolvedValue(undefined);
  mockFetch.mockResolvedValue({ comments: [existing, { ...existing, id: 'mine', author_id: 'me' }], reactions: [] });
  const { result } = renderHook(() => useQuestActivity('q1'));
  await waitFor(() => expect(result.current.comments).toHaveLength(2));

  await act(async () => { await result.current.removeComment(existing); });
  expect(mockDeleteComment).not.toHaveBeenCalled();

  await act(async () => { await result.current.removeComment(result.current.comments[1]); });
  expect(mockDeleteComment).toHaveBeenCalledWith('mine');
  expect(result.current.comments).toEqual([existing]);
});

it('toggles reactions optimistically and rolls back a failed tap', async () => {
  mockInsertReaction.mockResolvedValue(undefined);
  const { result } = renderHook(() => useQuestActivity('q1'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => { await result.current.toggleReaction('love'); });
  expect(mockInsertReaction).toHaveBeenCalledWith('q1', 'me', 'love');
  expect(result.current.reactions.map((r) => r.kind)).toEqual(['love']);

  mockDeleteReaction.mockRejectedValue(new Error('boom'));
  await act(async () => { await result.current.toggleReaction('love'); });
  expect(mockDeleteReaction).toHaveBeenCalledWith('q1', 'me', 'love');
  expect(result.current.reactions.map((r) => r.kind)).toEqual(['love']);
  expect(result.current.error).toBe('boom');
});

it('sends a quick second tap on a reaction only after the first lands', async () => {
  let finish: () => void = () => {};
  mockInsertReaction.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  mockDeleteReaction.mockResolvedValue(undefined);
  const { result } = renderHook(() => useQuestActivity('q1'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let first: Promise<void> = Promise.resolve();
  let second: Promise<void> = Promise.resolve();
  act(() => { first = result.current.toggleReaction('love'); });
  act(() => { second = result.current.toggleReaction('love'); });
  expect(result.current.reactions).toEqual([]);
  await act(async () => { await Promise.resolve(); });
  expect(mockDeleteReaction).not.toHaveBeenCalled();

  await act(async () => { finish(); await first; await second; });
  expect(mockDeleteReaction).toHaveBeenCalledWith('q1', 'me', 'love');
  expect(result.current.reactions).toEqual([]);
});

it('drops a fetch that overlapped a write instead of reverting it', async () => {
  const { result } = renderHook(() => useQuestActivity('q1'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let respond: (v: unknown) => void = () => {};
  mockFetch.mockReturnValueOnce(new Promise((resolve) => { respond = resolve; }));
  let stale: Promise<void> = Promise.resolve();
  act(() => { stale = result.current.refresh(); });

  mockInsertComment.mockResolvedValue({ ...existing, id: 'new-comment', author_id: 'me', body: 'yo' });
  await act(async () => { await result.current.addComment('yo'); });
  await act(async () => { respond({ comments: [existing], reactions: [] }); await stale; });

  expect(result.current.comments.map((c) => c.id)).toEqual(['c1', 'new-comment']);
});
