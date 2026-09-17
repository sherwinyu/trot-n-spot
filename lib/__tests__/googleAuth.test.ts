jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithOAuth: jest.fn(), exchangeCodeForSession: jest.fn() } },
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn(), WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss' } }));

import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { completeGoogleSignIn, getGoogleRedirectUrl, signInWithGoogle } from '../googleAuth';

const authorize = jest.mocked(supabase.auth.signInWithOAuth);
const exchange = jest.mocked(supabase.auth.exchangeCodeForSession);
const browser = jest.mocked(WebBrowser.openAuthSessionAsync);
const authorizeUrl = 'https://project.supabase.co/auth/v1/authorize?provider=google&code_challenge_method=s256&code_challenge=hashed';
const session = { user: { id: 'existing-user' } };
let counter = 0;
const freshCode = () => `single-use-${++counter}`;

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  authorize.mockResolvedValue({ data: { provider: 'google', url: authorizeUrl }, error: null });
  exchange.mockResolvedValue({ data: { session, user: session.user }, error: null } as any);
});

it.each(['ios', 'android'])('completes %s sign-in using the Supabase session exchange', async (platform) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
  const code = freshCode();
  browser.mockResolvedValue({ type: 'success', url: `quest://auth/callback?code=${code}` });
  await signInWithGoogle();
  expect(authorize).toHaveBeenCalledWith({ provider: 'google', options: {
    redirectTo: 'quest://auth/callback', skipBrowserRedirect: true,
    scopes: 'openid email profile', queryParams: { prompt: 'select_account' },
  } });
  expect(browser).toHaveBeenCalledWith(authorizeUrl, 'quest://auth/callback');
  expect(exchange).toHaveBeenCalledWith(code);
});

it.each([WebBrowser.WebBrowserResultType.CANCEL, WebBrowser.WebBrowserResultType.DISMISS])('returns to login quietly on browser %s', async (type) => {
  browser.mockResolvedValue({ type });
  await expect(signInWithGoogle()).resolves.toBeUndefined();
  expect(exchange).not.toHaveBeenCalled();
});

it('does not overwrite the verifier when sign-in is tapped twice', async () => {
  let finish!: (value: WebBrowser.WebBrowserAuthSessionResult) => void;
  browser.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const first = signInWithGoogle();
  const second = signInWithGoogle();
  await Promise.resolve();
  expect(first).toBe(second);
  expect(authorize).toHaveBeenCalledTimes(1);
  finish({ type: WebBrowser.WebBrowserResultType.CANCEL });
  await first;
});

it('exchanges a callback only once when both router and browser deliver it', async () => {
  const code = freshCode();
  await Promise.all([completeGoogleSignIn({ code }), completeGoogleSignIn({ code })]);
  await completeGoogleSignIn({ code });
  expect(exchange).toHaveBeenCalledTimes(1);
});

it('can finish a cold-start callback without an in-memory sign-in attempt', async () => {
  const code = freshCode();
  await completeGoogleSignIn({ code });
  expect(authorize).not.toHaveBeenCalled();
  expect(exchange).toHaveBeenCalledWith(code);
});

it.each([
  'https://attacker.example/auth/callback?code=stolen',
  'quest://auth/other?code=stolen',
  'quest://user@auth/callback?code=stolen',
])('rejects an unexpected redirect: %s', async (url) => {
  browser.mockResolvedValue({ type: 'success', url });
  await expect(signInWithGoogle()).rejects.toThrow('Unexpected sign-in redirect');
  expect(exchange).not.toHaveBeenCalled();
});

it.each([{}, { code: '' }, { code: ['one', 'two'] }, { error: 'access_denied', code: 'ignored' }])(
  'rejects incomplete or denied callbacks without attempting a session exchange', async (params) => {
    await expect(completeGoogleSignIn(params)).rejects.toThrow();
    expect(exchange).not.toHaveBeenCalled();
  },
);

it('handles a provider denial returned in the URL fragment', async () => {
  browser.mockResolvedValue({ type: 'success', url: 'quest://auth/callback#error=access_denied' });
  await expect(signInWithGoogle()).rejects.toThrow('cancelled');
  expect(exchange).not.toHaveBeenCalled();
});

it('reports an expired exchange without leaking the response details', async () => {
  exchange.mockResolvedValue({ data: { session: null, user: null }, error: { message: 'sensitive provider detail' } } as any);
  await expect(completeGoogleSignIn({ code: freshCode() })).rejects.toThrow('Could not finish Google sign-in. Please try again.');
});

it('does not launch the browser when provider setup fails', async () => {
  authorize.mockResolvedValue({ data: { provider: 'google', url: null }, error: { message: 'disabled' } } as any);
  await expect(signInWithGoogle()).rejects.toThrow('Could not start Google sign-in');
  expect(browser).not.toHaveBeenCalled();
});

it('refuses a plain PKCE challenge instead of opening an insecure flow', async () => {
  authorize.mockResolvedValue({ data: { provider: 'google', url: authorizeUrl.replace('s256', 'plain') }, error: null });
  await expect(signInWithGoogle()).rejects.toThrow('Secure Google sign-in is unavailable');
  expect(browser).not.toHaveBeenCalled();
});

it('uses a full-page web redirect and finishes on the current origin', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const original = Object.getOwnPropertyDescriptor(window, 'location');
  const assign = jest.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { origin: 'https://trot.example', assign } });
  try {
    expect(getGoogleRedirectUrl()).toBe('https://trot.example/auth/callback');
    await signInWithGoogle();
    expect(assign).toHaveBeenCalledWith(authorizeUrl);
    expect(browser).not.toHaveBeenCalled();
    expect(exchange).not.toHaveBeenCalled();
  } finally {
    if (original) Object.defineProperty(window, 'location', original);
    else Reflect.deleteProperty(window, 'location');
  }
});
