import { supabase } from '@/lib/supabase';

// TODO: Install and configure @react-native-google-signin/google-signin
// import { GoogleSignin } from '@react-native-google-signin/google-signin';
//
// GoogleSignin.configure({
//   webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
// });

export async function signInWithGoogle() {
  // TODO: Implement native Google Sign-In
  // const { idToken } = await GoogleSignin.signIn();
  // const { data, error } = await supabase.auth.signInWithIdToken({
  //   provider: 'google',
  //   token: idToken!,
  // });
  // if (error) throw error;
  // return data;
  throw new Error('Google Sign-In not yet configured. Set up @react-native-google-signin/google-signin.');
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}
