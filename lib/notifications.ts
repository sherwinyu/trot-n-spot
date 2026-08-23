import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Expo push tokens require a native runtime (and really a physical
// device); on web this whole module is a no-op.
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  // expo-notifications inherits this field from expo-modules-core. Keep the
  // narrow local shape so consumers do not need to install that internal Expo
  // package directly just to resolve the inherited TypeScript declaration.
  const { status: existingStatus } = await Notifications.getPermissionsAsync() as unknown as {
    status: 'granted' | 'denied' | 'undetermined';
  };
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync() as unknown as {
      status: 'granted' | 'denied' | 'undetermined';
    };
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

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

export function questIdFromNotification(
  response: Notifications.NotificationResponse
): string | null {
  const questId = response.notification.request.content.data?.questId;
  return typeof questId === 'string' ? questId : null;
}
