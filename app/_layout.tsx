import 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
  const { session, loading, packs, packsReady } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const firstSegment = segments[0];
    const secondSegment = (segments as string[])[1] as string | undefined;
    const inAuthGroup = firstSegment === '(auth)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
    } else if (!packsReady) {
      // Hold position until the packs fetch answers — routing on the
      // empty initial state would flash the onboarding screen.
    } else if (packs.length === 0) {
      if (secondSegment !== 'packs') router.replace('/(auth)/packs');
    } else {
      // The packs screen stays reachable (create/join/manage) even
      // once you have packs; everything else in (auth) bounces home.
      if (inAuthGroup && secondSegment !== 'packs') router.replace('/(tabs)');
    }
  }, [session, loading, packs, packsReady, segments]);

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <SyncProvider>
            <NotificationProvider>
              <AuthGate />
            </NotificationProvider>
          </SyncProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
