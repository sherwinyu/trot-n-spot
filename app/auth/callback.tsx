import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { completeGoogleSignIn } from '@/lib/googleAuth';

export default function AuthCallbackScreen() {
  const { code, error: providerError, error_code } = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_code?: string | string[];
  }>();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    completeGoogleSignIn({ code, error: providerError, error_code }).then(
      () => { if (active) setDone(true); },
      (reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not finish sign-in. Please try again.');
      },
    );
    return () => { active = false; };
  }, [code, providerError, error_code]);

  // AuthGate sends signed-in users to their pack/feed once account loading completes.
  if (done) return <Redirect href="/(auth)/login" />;

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text accessibilityRole="alert" style={styles.message}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/(auth)/login')} style={styles.button}>
            <Text style={styles.buttonText}>Back to sign in</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator accessibilityLabel="Signing in" />
          <Text style={styles.message}>Finishing sign-in…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  message: { textAlign: 'center', fontSize: 16 },
  button: { padding: 16, borderRadius: 8, backgroundColor: '#4285F4' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
