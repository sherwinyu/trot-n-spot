import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';

const CALLBACK_PATH = '/auth/callback';
const SIGN_IN_FAILED = 'Could not finish Google sign-in. Please try again.';

export function getGoogleRedirectUrl(): string {
  if (Platform.OS === 'web') {
    return `${window.location.origin}${CALLBACK_PATH}`;
  }
  return `quest:/${CALLBACK_PATH}`;
}

type CallbackParams = {
  code?: string | string[];
  error?: string | string[];
  error_code?: string | string[];
};

// Both the system browser and Expo Router can deliver the same native callback.
// Codes are single-use: share the most recent exchange, including its result.
let lastExchange: { code: string; promise: Promise<void> } | undefined;

export async function completeGoogleSignIn(params: CallbackParams): Promise<void> {
  if (params.error || params.error_code) {
    throw new Error(params.error === 'access_denied'
      ? 'Google sign-in was cancelled. Please try again.'
      : SIGN_IN_FAILED);
  }
  if (typeof params.code !== 'string' || !params.code.trim()) {
    throw new Error('This sign-in link is incomplete. Please start Google sign-in again.');
  }
  const code = params.code;
  if (lastExchange?.code === code) return lastExchange.promise;

  const promise = (async () => {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session) throw new Error(SIGN_IN_FAILED);
  })();
  lastExchange = { code, promise };
  return promise;
}

async function performGoogleSignIn(): Promise<void> {
  const redirectTo = getGoogleRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      scopes: 'openid email profile',
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error || !data.url) throw new Error('Could not start Google sign-in. Please try again.');

  // Fail closed if the runtime cannot hash the PKCE challenge (e.g. insecure web origin).
  if (new URL(data.url).searchParams.get('code_challenge_method') !== 's256') {
    throw new Error('Secure Google sign-in is unavailable. Please update the app or use HTTPS.');
  }

  if (Platform.OS === 'web') {
    // Full-page redirect avoids popup blockers and resumes through /auth/callback.
    window.location.assign(data.url);
    return;
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'cancel' || result.type === 'dismiss') return;
  if (result.type !== 'success') throw new Error(SIGN_IN_FAILED);

  const callback = new URL(result.url);
  const expected = new URL(redirectTo);
  if (callback.protocol !== expected.protocol || callback.host !== expected.host ||
      callback.pathname !== expected.pathname || callback.username || callback.password) {
    throw new Error('Unexpected sign-in redirect. Please try again.');
  }
  const fragment = new URLSearchParams(callback.hash.slice(1));
  await completeGoogleSignIn({
    code: callback.searchParams.get('code') ?? undefined,
    error: callback.searchParams.get('error') ?? fragment.get('error') ?? undefined,
    error_code: callback.searchParams.get('error_code') ?? fragment.get('error_code') ?? undefined,
  });
}

let pendingSignIn: Promise<void> | undefined;

export function signInWithGoogle(): Promise<void> {
  // A second click must not replace the persisted PKCE verifier mid-flow.
  pendingSignIn ??= performGoogleSignIn().finally(() => { pendingSignIn = undefined; });
  return pendingSignIn;
}
