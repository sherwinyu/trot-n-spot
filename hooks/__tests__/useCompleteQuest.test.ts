const mockSync = jest.fn();
const mockPromote = jest.fn();
const mockEnqueue = jest.fn();
const mockRefresh = jest.fn();
const user = { id: 'me' };
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user }) }));
jest.mock('@/providers/SyncProvider', () => ({ useSync: () => ({ refreshPendingCount: mockRefresh }) }));
jest.mock('@/lib/sync', () => ({ syncCompleteQuest: (...args: unknown[]) => mockSync(...args) }));
jest.mock('@/lib/questPhotoComments', () => ({ promotePhotoComment: (...args: unknown[]) => mockPromote(...args) }));
jest.mock('@/lib/offline', () => ({ ...jest.requireActual('@/lib/offline'), enqueue: (...args: unknown[]) => mockEnqueue(...args) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'generated-id' }));
import { act, renderHook } from '@testing-library/react-native';
import { useCompleteQuest } from '../useCompleteQuest';

beforeEach(() => jest.resetAllMocks());

it('queues new completion photos with their caption and stable comment id', async () => {
  mockSync.mockRejectedValue(new Error('Network request failed'));
  const { result } = renderHook(() => useCompleteQuest());
  let outcome;
  await act(async () => {
    outcome = await result.current.completeQuest({ questId: 'q1', photoUri: 'file://photo', commentId: 'draft', body: 'Found it' });
  });
  expect(outcome).toEqual({ queued: true });
  expect(mockEnqueue).toHaveBeenCalledWith({ id: 'q1', type: 'complete_quest', payload: expect.objectContaining({ commentId: 'draft', body: 'Found it', userId: 'me' }) });
  expect(mockRefresh).toHaveBeenCalled();
});

it('does not claim an offline promotion has completed or queue another photo upload', async () => {
  mockPromote.mockRejectedValue(new Error('Network request failed'));
  const { result } = renderHook(() => useCompleteQuest());
  let outcome;
  await act(async () => { outcome = await result.current.completeFromComment('q1', 'c1'); });
  expect(outcome).toBeNull();
  expect(result.current.error).toMatch(/reconnect/);
  expect(mockEnqueue).not.toHaveBeenCalled();
});
