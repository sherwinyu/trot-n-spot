import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export async function registerForPushNotifications(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export function handleNotificationReceived(notification: Notifications.Notification) {
  // Handle foreground notification display
  console.log('Notification received:', notification.request.content);
}

export function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const questId = response.notification.request.content.data?.questId;
  if (questId) {
    // TODO: Navigate to /quest/{questId} using expo-router
    console.log('Navigate to quest:', questId);
  }
}
