import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Expo push tokens require a native runtime (and really a physical
// device); on web this whole module is a no-op.

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

// iOS grants one system prompt per install, so we only ever show it
// behind our own explainer, at most this many times.
export const MAX_SOFT_PROMPTS = 2;
const SOFT_PROMPT_KEY = 'push:soft-prompts';

// expo-notifications inherits the permission response type from
// expo-modules-core; keep the narrow local shape so consumers do not need
// that internal package just to resolve the declaration.
type PermissionResponse = { status: 'granted' | 'denied' | 'undetermined' };

export async function getPushPermission(): Promise<PushPermission> {
  if (Platform.OS === 'web') return 'unavailable';
  const { status } = (await Notifications.getPermissionsAsync()) as unknown as PermissionResponse;
  return status;
}

export async function requestPushPermission(): Promise<PushPermission> {
  if (Platform.OS === 'web') return 'unavailable';
  const { status } = (await Notifications.requestPermissionsAsync()) as unknown as PermissionResponse;
  return status;
}

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    // Simulator, or push not configured — app works fine without it.
    return null;
  }
}

// Registers this device for the signed-in user. Safe to call on every
// launch; the RPC re-homes the token if a different account signed in
// on this device. Throws on a failed write so callers can log it.
export async function syncPushToken(): Promise<string | null> {
  if ((await getPushPermission()) !== 'granted') return null;
  const token = await getExpoPushToken();
  if (!token) return null;
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  if (error) throw error;
  return token;
}

export async function removePushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  const token = await getExpoPushToken();
  if (token) await supabase.from('push_tokens').delete().eq('token', token);
}

export async function softPromptCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(SOFT_PROMPT_KEY);
  return raw ? Number(raw) || 0 : 0;
}

export async function recordSoftPrompt(): Promise<void> {
  const count = await softPromptCount();
  await AsyncStorage.setItem(SOFT_PROMPT_KEY, String(count + 1));
}

// Where a tapped notification should take the user, or null when the
// payload isn't one we know how to route. Payload shape is
// { type, questId?, packId? } (see the edge function's policy.ts); older
// pushes carried only questId.
export function routeForPushData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<Record<string, unknown>>;
  if (typeof d.questId === 'string') return `/quest/${d.questId}`;
  if (d.type === 'pack_joined') return '/(auth)/packs';
  return null;
}

export function routeForNotification(response: Notifications.NotificationResponse): string | null {
  return routeForPushData(response.notification.request.content.data);
}

// Set by the feed screen while it is focused so foreground pushes about
// activity the user is already looking at don't also pop a banner.
let feedFocused = false;
export function setFeedFocused(focused: boolean) {
  feedFocused = focused;
}
export function isFeedFocused() {
  return feedFocused;
}
