import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { JourneyProvider, useJourney } from '@/providers/JourneyProvider';
import { AppState } from 'react-native';

const mockAuth: { user: { id: string } | null; loading: boolean } = { user: { id: 'me' }, loading: false };
const mockFetch = jest.fn();
const mockRecent = jest.fn();
const mockStart = jest.fn();
const mockEnd = jest.fn();
const mockSync = jest.fn();
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/lib/journeys', () => ({
  fetchActiveJourney: (...args: unknown[]) => mockFetch(...args),
  fetchRecentJourneys: (...args: unknown[]) => mockRecent(...args),
  startWalk: (...args: unknown[]) => mockStart(...args),
  endWalk: (...args: unknown[]) => mockEnd(...args),
}));
jest.mock('@/lib/walkReminders', () => ({
  setWalkReminderAccount: jest.fn(async () => {}),
  syncWalkReminders: (...args: unknown[]) => mockSync(...args),
}));

const active = { id: 'walk', user_id: 'me', started_at: new Date(Date.now() - 20 * 60_000).toISOString(), ended_at: null };
function wrapper({ children }: { children: React.ReactNode }) { return <JourneyProvider>{children}</JourneyProvider>; }

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  mockAuth.user = { id: 'me' };
  mockFetch.mockResolvedValue(null);
  mockRecent.mockResolvedValue([]);
  mockStart.mockResolvedValue(active);
  mockEnd.mockResolvedValue({ ...active, ended_at: new Date().toISOString() });
  mockSync.mockResolvedValue(undefined);
});

it('shares a backdated start and end between all consumers', async () => {
  const { result } = renderHook(() => ({ profile: useJourney(), create: useJourney() }), { wrapper });
  await waitFor(() => expect(result.current.profile.loading).toBe(false));
  await act(async () => { await result.current.profile.startJourney(20); });
  expect(mockStart).toHaveBeenCalledWith('me', 20);
  expect(result.current.create.activeJourney).toEqual(active);
  expect(result.current.profile.journeyDuration).toBeGreaterThanOrEqual(1200);
  await act(async () => { await result.current.profile.endJourney(); });
  expect(result.current.create.activeJourney).toBeNull();
});

it('serializes a notification start and a concurrent manual start', async () => {
  let finish!: (value: typeof active) => void;
  mockStart.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useJourney(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    const first = result.current.startJourney();
    await result.current.startJourney(10);
    finish(active);
    await first;
  });
  expect(mockStart).toHaveBeenCalledTimes(1);
});

it('keeps an active walk visible when ending fails', async () => {
  mockFetch.mockResolvedValue(active);
  mockEnd.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => useJourney(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await expect(result.current.endJourney()).rejects.toThrow('offline'); });
  expect(result.current.activeJourney).toEqual(active);
  expect(result.current.isBusy).toBe(false);
});

it('does not claim a walk failed just because notification cancellation failed', async () => {
  const { result } = renderHook(() => useJourney(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  mockSync.mockRejectedValue(new Error('OS failure'));
  await act(async () => { await result.current.startJourney(); });
  expect(result.current.activeJourney).toEqual(active);
  expect(result.current.reminderError).toMatch(/could not be refreshed/);
});

it('refreshes on foreground and ignores an old read that races with a start', async () => {
  const listener = jest.spyOn(AppState, 'addEventListener');
  const { result } = renderHook(() => useJourney(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let finish!: (value: null) => void;
  mockFetch.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  await act(async () => {
    listener.mock.calls.at(-1)![1]('active');
    await result.current.startJourney();
    finish(null);
  });
  expect(result.current.activeJourney).toEqual(active);
});

it('finishes loading a new account after an outgoing account mutation settles', async () => {
  let finish!: (value: typeof active) => void;
  mockStart.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { result, rerender } = renderHook(() => useJourney(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let pending!: Promise<void>;
  act(() => { pending = result.current.startJourney(); });
  mockAuth.user = { id: 'other' };
  rerender({});
  await act(async () => { finish(active); await pending; });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.activeJourney).toBeNull();
  expect(mockFetch).toHaveBeenCalledWith('other');
});
