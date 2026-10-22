import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Journey } from '@/types/database';

export const WALK_REMINDER_TYPE = 'walk_reminder';
export const WALK_REMINDER_CATEGORY = 'walkReminder';
export const WALK_ACTIONS = { start: 'walkStart', snooze: 'walkSnooze', skip: 'walkSkip' } as const;
export const WALK_WINDOWS = {
  morning: { start: 7 * 60, end: 10 * 60 },
  evening: { start: 16 * 60, end: 19 * 60 },
};
export type WalkSlot = keyof typeof WALK_WINDOWS;
export type WalkReminderSettings = { isEnabled: boolean; morning: number; evening: number };
type ReminderState = WalkReminderSettings & {
  skippedDays: string[];
  completedSlots: string[];
  snoozes: Record<string, number>;
  handled: string[];
};
export const DEFAULT_WALK_REMINDERS: WalkReminderSettings = { isEnabled: false, morning: 420, evening: 960 };
const PREFIX = 'walk-reminder:';
const HORIZON_DAYS = 28; // 56 requests leaves room under iOS's 64-pending-notification limit.

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function atMinute(date: Date, minute: number): Date {
  const result = new Date(date);
  result.setHours(0, minute, 0, 0);
  return result;
}

export function validateReminderSettings(settings: WalkReminderSettings): void {
  for (const slot of ['morning', 'evening'] as const) {
    const minute = settings[slot];
    if (!Number.isInteger(minute) || minute < WALK_WINDOWS[slot].start || minute >= WALK_WINDOWS[slot].end) {
      throw new Error(`Choose a ${slot} time within ${slot === 'morning' ? '7–10 a.m.' : '4–7 p.m.'}`);
    }
  }
}

export async function readWalkReminders(userId: string): Promise<ReminderState> {
  const raw = await AsyncStorage.getItem(`${PREFIX}${userId}`);
  const empty: ReminderState = { ...DEFAULT_WALK_REMINDERS, skippedDays: [], completedSlots: [], snoozes: {}, handled: [] };
  if (!raw) return empty;
  try {
    const state = { ...empty, ...JSON.parse(raw) } as ReminderState;
    validateReminderSettings(state);
    if (typeof state.isEnabled !== 'boolean' || !Array.isArray(state.skippedDays) ||
      !Array.isArray(state.completedSlots) || !Array.isArray(state.handled) ||
      !state.snoozes || typeof state.snoozes !== 'object') return empty;
    return state;
  } catch { return empty; }
}

export function planWalkReminders(userId: string, state: ReminderState, now = new Date()) {
  const plan: { identifier: string; date: Date; slot: WalkSlot; day: string }[] = [];
  if (!state.isEnabled) return plan;
  for (let offset = 0; offset < HORIZON_DAYS; offset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const day = localDay(date);
    if (state.skippedDays.includes(day)) continue;
    for (const slot of ['morning', 'evening'] as const) {
      const key = `${day}:${slot}`;
      if (state.completedSlots.includes(key)) continue;
      const fireAt = state.snoozes[key] ? new Date(state.snoozes[key]) : atMinute(date, state[slot]);
      if (fireAt <= now || fireAt >= atMinute(date, WALK_WINDOWS[slot].end)) continue;
      plan.push({ identifier: `${PREFIX}${userId}:${key}:${fireAt.getTime()}`, date: fireAt, slot, day });
    }
  }
  return plan;
}

let account: string | null = null;
let hasActiveJourney = false;
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}

export async function prepareWalkReminderNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('walk-reminders', {
      name: 'Walk reminders', importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  // Foreground actions work after a cold start without a background JS task.
  await Notifications.setNotificationCategoryAsync(WALK_REMINDER_CATEGORY, [
    { identifier: WALK_ACTIONS.start, buttonTitle: 'Start Walk', options: { opensAppToForeground: true } },
    { identifier: WALK_ACTIONS.snooze, buttonTitle: 'Remind in 30 min', options: { opensAppToForeground: true } },
    { identifier: WALK_ACTIONS.skip, buttonTitle: 'Skip today', options: { opensAppToForeground: true } },
  ]);
}

async function reconcile(owner: string): Promise<void> {
  if (Platform.OS === 'web') return;
  if (owner !== account) return;
  const state = await readWalkReminders(owner);
  const permission = await Notifications.getPermissionsAsync();
  if (owner !== account) return;
  const plan = owner && state && !hasActiveJourney && permission.granted
    ? planWalkReminders(owner, state) : [];
  const wanted = new Set(plan.map((item) => item.identifier));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of scheduled) {
    if (item.identifier.startsWith(PREFIX) && !wanted.has(item.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }
  if (owner !== account) return;
  const existing = new Set(scheduled.map((item) => item.identifier));
  for (const item of plan) {
    if (owner !== account) return;
    if (existing.has(item.identifier)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: item.identifier,
      content: {
        title: 'Heading out with Dudley?',
        body: 'Start logging your walk, or remind yourself in 30 minutes.',
        sound: 'default', categoryIdentifier: WALK_REMINDER_CATEGORY,
        data: { type: WALK_REMINDER_TYPE, userId: owner, day: item.day, slot: item.slot },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.date, channelId: 'walk-reminders' },
    });
  }
}

export function setWalkReminderAccount(userId: string | null): Promise<void> {
  account = userId;
  hasActiveJourney = false;
  return serial(async () => {
    await prepareWalkReminderNotifications();
    // Only cancel on account change; the journey refresh schedules after checking active walks.
    if (Platform.OS === 'web') return;
    for (const item of await Notifications.getAllScheduledNotificationsAsync()) {
      if (item.identifier.startsWith(PREFIX) && item.content.data?.userId !== account) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
    for (const item of await Notifications.getPresentedNotificationsAsync()) {
      if (item.request.identifier.startsWith(PREFIX) && item.request.content.data?.userId !== account) {
        await Notifications.dismissNotificationAsync(item.request.identifier);
      }
    }
  });
}

async function save(userId: string, state: ReminderState): Promise<void> {
  const today = localDay(new Date());
  state.skippedDays = state.skippedDays.filter((day) => day >= today);
  state.completedSlots = state.completedSlots.filter((key) => key.slice(0, 10) >= today);
  state.snoozes = Object.fromEntries(Object.entries(state.snoozes).filter(([key]) => key.slice(0, 10) >= today));
  state.handled = state.handled.slice(-100);
  await AsyncStorage.setItem(`${PREFIX}${userId}`, JSON.stringify(state));
}

export function updateWalkReminders(userId: string, settings: WalkReminderSettings): Promise<void> {
  validateReminderSettings(settings);
  return serial(async () => {
    if (account !== userId) throw new Error('Please sign in again.');
    const state = await readWalkReminders(userId);
    await save(userId, { ...state, ...settings, snoozes: {} });
    await reconcile(userId);
  });
}

export function syncWalkReminders(userId: string, journeys: Journey[]): Promise<void> {
  return serial(async () => {
    if (account !== userId) return;
    hasActiveJourney = journeys.some((journey) => !journey.ended_at);
    const state = await readWalkReminders(userId);
    const now = new Date();
    const day = localDay(now);
    for (const slot of ['morning', 'evening'] as const) {
      const start = atMinute(now, WALK_WINDOWS[slot].start).getTime();
      const end = atMinute(now, WALK_WINDOWS[slot].end).getTime();
      if (journeys.some((journey) => Date.parse(journey.started_at) < end &&
        (journey.ended_at ? Date.parse(journey.ended_at) : now.getTime()) >= start)) {
        state.completedSlots = [...new Set([...state.completedSlots, `${day}:${slot}`])];
      }
    }
    await save(userId, state);
    await reconcile(userId);
  });
}

export function isWalkReminder(data: unknown): data is { type: string; userId: string; day: string; slot: WalkSlot } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.type === WALK_REMINDER_TYPE && typeof d.userId === 'string' &&
    typeof d.day === 'string' && (d.slot === 'morning' || d.slot === 'evening');
}

export function handleWalkReminderAction(
  userId: string,
  response: Notifications.NotificationResponse,
): Promise<'start' | 'open' | 'snoozed' | 'skipped' | 'expired' | null> {
  return serial(async () => {
    const request = response.notification.request;
    const data = request.content.data;
    if (account !== userId || !isWalkReminder(data) || data.userId !== userId) return null;
    const state = await readWalkReminders(userId);
    const action = response.actionIdentifier;
    if (state.handled.includes(request.identifier)) return null;
    state.handled.push(request.identifier);
    const now = new Date();
    const isToday = state.isEnabled && data.day === localDay(now);
    const isCurrent = isToday &&
      now >= atMinute(now, WALK_WINDOWS[data.slot].start) && now < atMinute(now, WALK_WINDOWS[data.slot].end);
    let result: 'start' | 'open' | 'snoozed' | 'skipped' | 'expired' = 'open';
    if (isToday && action === WALK_ACTIONS.skip) {
      state.skippedDays.push(data.day);
      result = 'skipped';
    } else if (!isCurrent) result = 'expired';
    else if (action === WALK_ACTIONS.snooze) {
      const date = new Date(now.getTime() + 30 * 60_000);
      if (!hasActiveJourney && !state.skippedDays.includes(data.day) &&
        !state.completedSlots.includes(`${data.day}:${data.slot}`) && date < atMinute(now, WALK_WINDOWS[data.slot].end)) {
        state.snoozes[`${data.day}:${data.slot}`] = date.getTime();
        result = 'snoozed';
      } else result = 'expired';
    } else if (action === WALK_ACTIONS.start) result = 'start';
    await save(userId, state);
    await reconcile(userId);
    await Notifications.dismissNotificationAsync(request.identifier);
    return result;
  });
}
