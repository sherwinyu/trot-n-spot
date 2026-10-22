import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { NotificationProvider } from '@/providers/NotificationProvider';

const mockStart = jest.fn();
const mockHandle = jest.fn();
const mockPush = jest.fn();
const mockNotify = jest.fn();
const mockRouter = { push: mockPush };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/hooks/useJourney', () => ({ useJourney: () => ({ startJourney: mockStart, loading: false }) }));
jest.mock('@/lib/notify', () => ({ confirm: jest.fn(), notify: (...args: unknown[]) => mockNotify(...args) }));
jest.mock('@/lib/notifications', () => ({
  getPushPermission: async () => 'granted', syncPushToken: async () => {},
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
  mockStart.mockResolvedValue(undefined);
  mockHandle.mockResolvedValue('start');
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(null);
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
