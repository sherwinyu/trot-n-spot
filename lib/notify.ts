import { Alert, Platform } from 'react-native';

// Alert.alert is a no-op on react-native-web, so route through
// window.alert/confirm there. Keeps success/confirm feedback working
// (and testable) on all three platforms.

export function notify(title: string, message?: string, onDismiss?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    onDismiss?.();
  } else {
    Alert.alert(title, message, [{ text: 'OK', onPress: onDismiss }]);
  }
}

export function confirm(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText = 'OK',
  confirmStyle: 'default' | 'destructive' = 'destructive',
  onCancel?: () => void
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    else onCancel?.();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: onCancel },
      { text: confirmText, style: confirmStyle, onPress: onConfirm },
    ]);
  }
}
