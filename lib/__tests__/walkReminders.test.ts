import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Journey } from '@/types/database';
import {
  DEFAULT_WALK_REMINDERS, handleWalkReminderAction, planWalkReminders, readWalkReminders,
  setWalkReminderAccount, syncWalkReminders, updateWalkReminders, WALK_ACTIONS, validateReminderSettings,
} from '../walkReminders';

const mockPending = new Map<string, any>();
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 }, SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockPending.values()]),
  scheduleNotificationAsync: jest.fn(async (request) => { mockPending.set(request.identifier, request); return request.identifier; }),
  cancelScheduledNotificationAsync: jest.fn(async (id) => { mockPending.delete(id); }),
  setNotificationChannelAsync: jest.fn(), setNotificationCategoryAsync: jest.fn(),
  getPresentedNotificationsAsync: jest.fn(async () => []), dismissNotificationAsync: jest.fn(),
}));

const enabled = { ...DEFAULT_WALK_REMINDERS, isEnabled: true };
const journey = (started_at: string, ended_at: string | null = null) => ({ id: 'walk', user_id: 'me', started_at, ended_at } as Journey);
function response(action: string, id = 'delivered', overrides = {}) {
  return { actionIdentifier: action, notification: { request: {
    identifier: id, content: { data: { type: 'walk_reminder', userId: 'me', day: '2026-10-22', slot: 'morning', ...overrides } },
  } } } as unknown as Notifications.NotificationResponse;
}

beforeEach(async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 22, 6));
  jest.clearAllMocks();
  mockPending.clear();
  await AsyncStorage.clear();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true } as any);
  await setWalkReminderAccount('me');
});
afterEach(() => jest.useRealTimers());

it('is opt-in, then schedules one 7am/4pm reminder per local day for four weeks', async () => {
  await syncWalkReminders('me', []);
  expect(mockPending.size).toBe(0);
  await updateWalkReminders('me', enabled);
  const requests = [...mockPending.values()];
  expect(requests).toHaveLength(56);
  expect(requests[0].trigger.date).toEqual(new Date(2026, 9, 22, 7));
  expect(requests[1].trigger.date).toEqual(new Date(2026, 9, 22, 16));
  expect(requests[54].trigger.date).toEqual(new Date(2026, 10, 18, 7));
  expect(requests.every((r) => [7, 16].includes(r.trigger.date.getHours()))).toBe(true);
  expect(requests[0].content.data.userId).toBe('me');
  expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith('walkReminder', expect.arrayContaining([
    expect.objectContaining({ identifier: WALK_ACTIONS.start, options: { opensAppToForeground: true } }),
  ]));
});

it('edits times without duplicates and disables only walk notifications', async () => {
  mockPending.set('quest-push', { identifier: 'quest-push', content: { data: { questId: 'q' } } });
  await updateWalkReminders('me', enabled);
  await updateWalkReminders('me', { ...enabled, morning: 495 });
  expect(mockPending.size).toBe(57);
  expect([...mockPending.values()].filter((r) => r.content.data.slot === 'morning')[0].trigger.date)
    .toEqual(new Date(2026, 9, 22, 8, 15));
  await updateWalkReminders('me', { ...enabled, isEnabled: false });
  expect([...mockPending.keys()]).toEqual(['quest-push']);
});

it('snoozes exactly 30 minutes without rescheduling a past base reminder', async () => {
  jest.setSystemTime(new Date(2026, 9, 22, 7, 5));
  await updateWalkReminders('me', enabled);
  expect(await handleWalkReminderAction('me', response(WALK_ACTIONS.snooze))).toBe('snoozed');
  const today = [...mockPending.values()].filter((r) => r.content.data.day === '2026-10-22');
  expect(today).toHaveLength(2);
  expect(today[1].trigger.date).toEqual(new Date(2026, 9, 22, 7, 35));
  expect(await handleWalkReminderAction('me', response(WALK_ACTIONS.snooze))).toBeNull();
});

it('skips both windows today but retains tomorrow and later reminders', async () => {
  jest.setSystemTime(new Date(2026, 9, 22, 7, 5));
  await updateWalkReminders('me', enabled);
  await handleWalkReminderAction('me', response(WALK_ACTIONS.skip));
  expect(mockPending.size).toBe(54);
  expect([...mockPending.values()].some((r) => r.content.data.day === '2026-10-22')).toBe(false);
});

it('never snoozes past the window, and stale notifications cannot start a walk', async () => {
  jest.setSystemTime(new Date(2026, 9, 22, 9, 45));
  await updateWalkReminders('me', enabled);
  expect(await handleWalkReminderAction('me', response(WALK_ACTIONS.snooze))).toBe('expired');
  expect(await handleWalkReminderAction('me', response(WALK_ACTIONS.start, 'old', { day: '2026-10-21' }))).toBe('expired');
});

it('requires an explicit Start action, consumes it once, and rejects a different account', async () => {
  jest.setSystemTime(new Date(2026, 9, 22, 7, 5));
  await updateWalkReminders('me', enabled);
  expect(await handleWalkReminderAction('me', response('default'))).toBe('open');
  expect(await handleWalkReminderAction('me', response(WALK_ACTIONS.start, 'start'))).toBe('start');
  expect(await handleWalkReminderAction('me', response(WALK_ACTIONS.start, 'start'))).toBeNull();
  expect(await handleWalkReminderAction('me', response(WALK_ACTIONS.start, 'other', { userId: 'other' }))).toBeNull();
});

it('cancels on logout/account switch without opting the new account in', async () => {
  await updateWalkReminders('me', enabled);
  await setWalkReminderAccount(null);
  expect(mockPending.size).toBe(0);
  await setWalkReminderAccount('other');
  await syncWalkReminders('other', []);
  expect(mockPending.size).toBe(0);
  expect((await readWalkReminders('me')).isEnabled).toBe(true);
});

it('cancels while walking and suppresses the completed window, including a walk begun before it', async () => {
  jest.setSystemTime(new Date(2026, 9, 22, 7, 10));
  await updateWalkReminders('me', { ...enabled, morning: 450 });
  await syncWalkReminders('me', [journey(new Date(2026, 9, 22, 6, 55).toISOString())]);
  expect(mockPending.size).toBe(0);
  await syncWalkReminders('me', [journey(new Date(2026, 9, 22, 6, 55).toISOString(), new Date(2026, 9, 22, 7, 10).toISOString())]);
  const today = [...mockPending.values()].filter((r) => r.content.data.day === '2026-10-22');
  expect(today).toHaveLength(1);
  expect(today[0].content.data.slot).toBe('evening');
});

it('does not promise a snooze for an already completed walk window', async () => {
  jest.setSystemTime(new Date(2026, 9, 22, 7, 20));
  await updateWalkReminders('me', enabled);
  await syncWalkReminders('me', [journey(new Date(2026, 9, 22, 7).toISOString(), new Date(2026, 9, 22, 7, 15).toISOString())]);
  expect(await handleWalkReminderAction('me', response(WALK_ACTIONS.snooze))).not.toBe('snoozed');
});

it('removes pending reminders on revoked permission without losing preferences', async () => {
  await updateWalkReminders('me', enabled);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as any);
  await syncWalkReminders('me', []);
  expect(mockPending.size).toBe(0);
  expect((await readWalkReminders('me')).isEnabled).toBe(true);
});

it('rejects invalid times and never catches up with a notification outside the windows', async () => {
  expect(() => validateReminderSettings({ ...enabled, morning: 600 })).toThrow(/morning/);
  expect(() => validateReminderSettings({ ...enabled, evening: 1140 })).toThrow(/evening/);
  const state = { ...await readWalkReminders('me'), ...enabled };
  const plan = planWalkReminders('me', state, new Date(2026, 9, 22, 20));
  expect(plan).toHaveLength(54);
  expect(plan[0].date).toEqual(new Date(2026, 9, 23, 7));
});

it('recovers safely from corrupt settings without silently enabling notifications', async () => {
  await AsyncStorage.setItem('walk-reminder:me', '{broken');
  expect((await readWalkReminders('me')).isEnabled).toBe(false);
});
