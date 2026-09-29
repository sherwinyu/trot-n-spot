import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import {
  MAX_SOFT_PROMPTS,
  PushPermission,
  getPushPermission,
  isFeedFocused,
  recordSoftPrompt,
  requestPushPermission,
  routeForNotification,
  softPromptCount,
  syncPushToken,
} from '@/lib/notifications';
import { confirm } from '@/lib/notify';
import { fetchActivity, markAllActivityRead, unseenCount } from '@/lib/activity';
import { ActivityNotification } from '@/types/database';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      // The feed refetches on receipt, so a banner on top of it is noise.
      const quiet = isFeedFocused();
      return {
        shouldShowAlert: !quiet,
        shouldPlaySound: !quiet,
        shouldSetBadge: false,
        shouldShowBanner: !quiet,
        shouldShowList: true,
      };
    },
  });
}

type NotificationContextType = {
  permission: PushPermission;
  // Bumps every time a push arrives while the app is running; screens
  // showing pack activity refetch on change.
  receivedCount: number;
  // Shows the system prompt (after our own explainer). Resolves to the
  // resulting permission.
  requestPermission: () => Promise<PushPermission>;
  // Soft-ask at a moment where the value is obvious (first pack, first
  // quest). No-op once the user has decided or been asked MAX_SOFT_PROMPTS
  // times.
  maybeAskForPush: () => Promise<void>;
  openSystemSettings: () => void;
  // Persisted activity feed (newest first) for the signed-in user.
  activity: ActivityNotification[];
  unreadActivity: number;
  refreshActivity: () => Promise<void>;
  markActivityRead: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextType>({
  permission: 'unavailable',
  receivedCount: 0,
  requestPermission: async () => 'unavailable',
  maybeAskForPush: async () => {},
  openSystemSettings: () => {},
  activity: [],
  unreadActivity: 0,
  refreshActivity: async () => {},
  markActivityRead: async () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [permission, setPermission] = useState<PushPermission>('unavailable');
  const [receivedCount, setReceivedCount] = useState(0);
  const [activity, setActivity] = useState<ActivityNotification[]>([]);
  // Unread rows already marked read server-side but still shown bold
  // until the next fetch, so opening the tab doesn't un-highlight them.
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const activityRef = useRef(activity);
  const handledColdStart = useRef(false);
  const userId = user?.id ?? null;

  const refreshActivity = useCallback(async () => {
    if (!userId) return;
    try {
      const items = await fetchActivity();
      activityRef.current = items;
      setActivity(items);
    } catch (e) {
      console.warn('activity fetch failed', e);
    }
  }, [userId]);

  // Load on sign-in, whenever a push arrives, and on foreground (pushes
  // delivered while backgrounded don't fire the received listener).
  useEffect(() => {
    if (!userId) {
      activityRef.current = [];
      setActivity([]);
      setSeenIds(new Set());
      return;
    }
    refreshActivity();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshActivity();
    });
    return () => sub.remove();
  }, [userId, receivedCount, refreshActivity]);

  const markActivityRead = useCallback(async () => {
    if (!userId) return;
    const unread = activityRef.current.filter((n) => n.read_at === null).map((n) => n.id);
    if (unread.length === 0) return;
    setSeenIds((prev) => new Set([...prev, ...unread]));
    await markAllActivityRead().catch((e) => console.warn('mark read failed', e));
  }, [userId]);

  // Re-read on foreground too: the user may have flipped the switch in
  // system Settings and come straight back.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    getPushPermission().then(setPermission);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') getPushPermission().then(setPermission);
    });
    return () => sub.remove();
  }, []);

  // Keep this device registered whenever a user is signed in and has
  // already granted permission. Never prompts.
  useEffect(() => {
    if (!userId || Platform.OS === 'web' || permission !== 'granted') return;
    syncPushToken().catch((e) => console.warn('push token sync failed', e));
  }, [userId, permission]);

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;

    const navigate = (response: Notifications.NotificationResponse) => {
      const route = routeForNotification(response);
      if (route) router.push(route as never);
    };

    const received = Notifications.addNotificationReceivedListener(() => {
      setReceivedCount((n) => n + 1);
    });
    // Notification tapped while the app was running.
    const tapped = Notifications.addNotificationResponseReceivedListener(navigate);

    // Notification tap launched the app cold — the listener above never
    // fires for that, so check once after auth has settled.
    if (!handledColdStart.current) {
      handledColdStart.current = true;
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) navigate(response);
      });
    }

    return () => {
      received.remove();
      tapped.remove();
    };
  }, [userId, router]);

  const requestPermission = useCallback(async () => {
    const status = await requestPushPermission();
    setPermission(status);
    if (status === 'granted' && userId) {
      await syncPushToken().catch((e) => console.warn('push token sync failed', e));
    }
    return status;
  }, [userId]);

  const maybeAskForPush = useCallback(async () => {
    if (Platform.OS === 'web' || permission !== 'undetermined') return;
    if ((await softPromptCount()) >= MAX_SOFT_PROMPTS) return;
    await recordSoftPrompt();
    confirm(
      'Stay in the loop?',
      'Get a ping when a packmate spots something for you or finds your quest.',
      () => {
        requestPermission();
      },
      'Enable',
      'default'
    );
  }, [permission, requestPermission]);

  const openSystemSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        permission,
        receivedCount,
        requestPermission,
        maybeAskForPush,
        openSystemSettings,
        activity,
        unreadActivity: unseenCount(activity, seenIds),
        refreshActivity,
        markActivityRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
