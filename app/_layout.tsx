import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { LogBox } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { SyncProvider } from '@/providers/SyncProvider';
import { NotificationProvider } from '@/providers/NotificationProvider';

export { ErrorBoundary } from 'expo-router';

// expo-router's initial deep-link resolver can call setState on a component
// that unmounted during the first navigation, emitting a benign dev-only
// warning. Suppress just that message so it doesn't clutter the LogBox or
// intercept taps during on-device UI automation.
LogBox.ignoreLogs([
  "Can't perform a React state update on a component that hasn't mounted yet",
]);

SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const { session, loading, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const firstSegment = segments[0];
    const inAuthGroup = firstSegment === '(auth)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
    } else if (!profile?.partner_id) {
      const secondSegment = (segments as string[])[1] as string | undefined;
      if (secondSegment !== 'pair') router.replace('/(auth)/pair');
    } else {
      if (inAuthGroup) router.replace('/(tabs)');
    }
  }, [session, loading, profile, segments]);

  return <Slot />;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <SyncProvider>
          <NotificationProvider>
            <AuthGate />
          </NotificationProvider>
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
