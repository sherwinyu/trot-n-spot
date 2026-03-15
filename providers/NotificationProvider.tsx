import React, { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { registerForPushNotifications, handleNotificationReceived, handleNotificationResponse } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const responseListener = useRef<Notifications.EventSubscription>(null);
  const receivedListener = useRef<Notifications.EventSubscription>(null);

  useEffect(() => {
    if (!user) return;

    registerForPushNotifications().then(async (token) => {
      if (token && profile && token !== profile.push_token) {
        await supabase
          .from('profiles')
          .update({ push_token: token })
          .eq('id', user.id);
      }
    });

    receivedListener.current = Notifications.addNotificationReceivedListener(handleNotificationReceived);

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response);
      const questId = response.notification.request.content.data?.questId;
      if (questId) {
        router.push(`/quest/${questId}`);
      }
    });

    return () => {
      if (receivedListener.current) receivedListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, [user, profile, router]);

  return <>{children}</>;
}
