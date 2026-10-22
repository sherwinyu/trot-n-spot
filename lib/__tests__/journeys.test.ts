const mockQuery: Record<string, jest.Mock> = {};
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(() => mockQuery) } }));
import { endWalk, startWalk } from '../journeys';

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-22T08:30:00Z'));
  for (const method of ['select', 'eq', 'is', 'order', 'limit', 'insert', 'update', 'gt']) {
    mockQuery[method] = jest.fn(() => mockQuery);
  }
  mockQuery.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
  mockQuery.single = jest.fn(async () => ({ data: { id: 'new-walk' }, error: null }));
});
afterEach(() => jest.useRealTimers());

it.each([0, 10, 20, 30] as const)('starts a walk %i minutes ago using the existing journey table', async (minutes) => {
  const expected = ['08:30', '08:20', '08:10', '08:00'][minutes / 10];
  await startWalk('me', minutes);
  expect(mockQuery.insert).toHaveBeenCalledWith({ user_id: 'me', started_at: `2026-10-22T${expected}:00.000Z` });
});

it('reuses the active journey instead of inserting a duplicate', async () => {
  mockQuery.maybeSingle.mockResolvedValue({ data: { id: 'existing' }, error: null });
  expect(await startWalk('me')).toEqual({ id: 'existing' });
  expect(mockQuery.insert).not.toHaveBeenCalled();
});

it('rejects overlapping backdates and leaves the previous walk untouched', async () => {
  mockQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: { id: 'completed' }, error: null });
  await expect(startWalk('me', 20)).rejects.toThrow(/overlaps/);
  expect(mockQuery.insert).not.toHaveBeenCalled();
});

it('does not start when the active-walk check fails offline', async () => {
  mockQuery.maybeSingle.mockResolvedValue({ data: null, error: new Error('offline') });
  await expect(startWalk('me')).rejects.toThrow('offline');
  expect(mockQuery.insert).not.toHaveBeenCalled();
});

it('surfaces insert and end errors instead of pretending a walk was saved', async () => {
  mockQuery.single.mockResolvedValue({ data: null, error: new Error('offline') });
  await expect(startWalk('me')).rejects.toThrow('offline');
  await expect(endWalk('walk', 'me')).rejects.toThrow('offline');
});
