import { StyleSheet, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';
import { signInWithEmail, signUpWithEmail } from '@/lib/auth';

// Email/password auth is the only working sign-in until Google is configured,
// so keep it available in dev and in preview/test builds (where __DEV__ is
// false). Set EXPO_PUBLIC_ENABLE_EMAIL_LOGIN=true at build time to expose it;
// a real production build without the flag stays Google-only.
const EMAIL_LOGIN_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_EMAIL_LOGIN === 'true';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Prefill test creds in dev only; preview/test builds start blank.
  const [email, setEmail] = useState(__DEV__ ? 'test-sherwin@quest.dev' : '');
  const [password, setPassword] = useState(__DEV__ ? 'testpass123' : '');

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signIn();
    } catch (err: any) {
      setError(err.message ?? 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    if (!email || !password) {
      setError('Email and password required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      // If user doesn't exist, sign up instead
      if (err.message?.includes('Invalid login credentials')) {
        try {
          await signUpWithEmail(email, password);
        } catch (signUpErr: any) {
          setError(signUpErr.message ?? 'Sign up failed');
        }
      } else {
        setError(err.message ?? 'Sign in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Quest</Text>
        <Text style={styles.subtitle}>Scavenger hunts for couples</Text>
      </View>

      {EMAIL_LOGIN_ENABLED && (
        <View style={styles.devSection}>
          <Text style={styles.devLabel}>Email Login</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <View style={styles.passwordWrapper}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#999"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((v) => !v)}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color="#666"
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.devButton}
            onPress={handleEmailSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In / Sign Up</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, EMAIL_LOGIN_ENABLED && styles.googleButtonDev]}
        onPress={handleSignIn}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign in with Google</Text>
        )}
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    marginTop: 8,
  },
  devSection: {
    width: '100%',
    marginBottom: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    backgroundColor: '#fafafa',
  },
  devLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
    // Explicit dark text so it stays visible on the white field in dark mode
    // (otherwise the themed default renders white-on-white).
    color: '#111',
  },
  passwordWrapper: {
    position: 'relative',
    justifyContent: 'center',
    // Themed View defaults to an opaque themed background; keep it transparent
    // so the card colour shows through around the input (no dark bar in dark mode).
    backgroundColor: 'transparent',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  devButton: {
    backgroundColor: '#34A853',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  googleButtonDev: {
    backgroundColor: '#999',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: 'red',
    marginTop: 16,
    textAlign: 'center',
  },
});
