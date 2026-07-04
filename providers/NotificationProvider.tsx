import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { registerForPushNotifications, questIdFromNotification } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const responseListener = useRef<Notifications.EventSubscription>(null);
  const handledColdStart = useRef(false);

  useEffect(() => {
    if (!user || Platform.OS === 'web') return;

    registerForPushNotifications().then(async (token) => {
      if (token && profile && token !== profile.push_token) {
        await supabase
          .from('profiles')
          .update({ push_token: token })
          .eq('id', user.id);
      }
    });

    const navigateToQuest = (response: Notifications.NotificationResponse) => {
      const questId = questIdFromNotification(response);
      if (questId) router.push(`/quest/${questId}`);
    };

    // Notification tapped while the app was running.
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(navigateToQuest);

    // Notification tap launched the app cold — the listener above never
    // fires for that, so check once after auth has settled.
    if (!handledColdStart.current) {
      handledColdStart.current = true;
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) navigateToQuest(response);
      });
    }

    return () => {
      if (responseListener.current) responseListener.current.remove();
    };
  }, [user, profile, router]);

  return <>{children}</>;
}
