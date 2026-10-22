import React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { NotificationProvider, useNotifications } from '@/providers/NotificationProvider';

const mockStart = jest.fn();
const mockHandle = jest.fn();
const mockPush = jest.fn();
const mockNotify = jest.fn();
const mockGetPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockSyncPushToken = jest.fn();
const mockRouter = { push: mockPush };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/hooks/useJourney', () => ({ useJourney: () => ({ startJourney: mockStart, loading: false }) }));
jest.mock('@/lib/notify', () => ({ confirm: jest.fn(), notify: (...args: unknown[]) => mockNotify(...args) }));
jest.mock('@/lib/notifications', () => ({
  getPushPermission: () => mockGetPermission(),
  requestPushPermission: () => mockRequestPermission(),
  syncPushToken: () => mockSyncPushToken(),
  routeForNotification: () => '/quest/old-push', isFeedFocused: () => true,
}));
jest.mock('@/lib/activity', () => ({ fetchActivity: async () => [], unseenCount: () => 0 }));
jest.mock('@/lib/walkReminders', () => ({
  isWalkReminder: (data: any) => data?.type === 'walk_reminder',
  handleWalkReminderAction: (...args: unknown[]) => mockHandle(...args),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => {}),
}));

const response = { actionIdentifier: 'walkStart', notification: { request: {
  identifier: 'walk', content: { data: { type: 'walk_reminder', userId: 'me' } },
} } } as unknown as Notifications.NotificationResponse;
const handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0][0]!;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPermission.mockResolvedValue('granted');
  mockRequestPermission.mockResolvedValue('granted');
  mockSyncPushToken.mockResolvedValue(undefined);
  mockStart.mockResolvedValue(undefined);
  mockHandle.mockResolvedValue('start');
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(null);
});

it('returns permission without waiting for remote push registration', async () => {
  mockGetPermission.mockResolvedValue('undetermined');
  mockSyncPushToken.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useNotifications(), { wrapper: NotificationProvider });
  await waitFor(() => expect(result.current.permission).toBe('undetermined'));
  const granted = jest.fn();

  act(() => { void result.current.requestPermission().then(granted); });

  await waitFor(() => expect(granted).toHaveBeenCalledWith('granted'));
  expect(result.current.permission).toBe('granted');
  expect(mockSyncPushToken).toHaveBeenCalledTimes(1);
});

it('logs remote registration failures without rejecting granted permission', async () => {
  mockGetPermission.mockResolvedValue('undetermined');
  const error = new Error('APNs unavailable');
  mockSyncPushToken.mockRejectedValue(error);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const { result } = renderHook(() => useNotifications(), { wrapper: NotificationProvider });
    await waitFor(() => expect(result.current.permission).toBe('undetermined'));

    await act(async () => { await expect(result.current.requestPermission()).resolves.toBe('granted'); });

    expect(warn).toHaveBeenCalledWith('push token sync failed', error);
    expect(mockSyncPushToken).toHaveBeenCalledTimes(1);
  } finally { warn.mockRestore(); }
});

it('does not register for remote pushes when permission is denied', async () => {
  mockGetPermission.mockResolvedValue('undetermined');
  mockRequestPermission.mockResolvedValue('denied');
  const { result } = renderHook(() => useNotifications(), { wrapper: NotificationProvider });
  await waitFor(() => expect(result.current.permission).toBe('undetermined'));

  await act(async () => { await expect(result.current.requestPermission()).resolves.toBe('denied'); });

  expect(result.current.permission).toBe('denied');
  expect(mockSyncPushToken).not.toHaveBeenCalled();
});

it('shows a walk reminder even when the feed is focused', async () => {
  const behavior = await handler.handleNotification(response.notification);
  expect(behavior.shouldShowBanner).toBe(true);
  expect(behavior.shouldPlaySound).toBe(true);
});

it('processes a cold-start Start action once and navigates to the shared walk screen', async () => {
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(response);
  render(<NotificationProvider>{null}</NotificationProvider>);
  await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
  expect(mockPush).toHaveBeenCalledWith('/(tabs)/profile');
  expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
});

it.each(['open', 'snoozed', 'skipped', 'expired', null])('does not start a walk for result %s', async (result) => {
  mockHandle.mockResolvedValue(result);
  render(<NotificationProvider>{null}</NotificationProvider>);
  await waitFor(() => expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled());
  await act(async () => { await jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls.at(-1)![0](response); });
  expect(mockStart).not.toHaveBeenCalled();
});

it('shows a failed start rather than claiming success', async () => {
  mockStart.mockRejectedValue(new Error('offline'));
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(response);
  render(<NotificationProvider>{null}</NotificationProvider>);
  await waitFor(() => expect(mockNotify).toHaveBeenCalledWith('Could not complete that action', 'offline'));
});

it('preserves the existing quest notification routing', async () => {
  render(<NotificationProvider>{null}</NotificationProvider>);
  await waitFor(() => expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled());
  await act(async () => { await jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls.at(-1)![0]({
    ...response, notification: { ...response.notification, request: { ...response.notification.request, content: { data: { questId: 'q' } } } },
  } as unknown as Notifications.NotificationResponse); });
  expect(mockPush).toHaveBeenCalledWith('/quest/old-push');
  expect(mockHandle).not.toHaveBeenCalled();
});
