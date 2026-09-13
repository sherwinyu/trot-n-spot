import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
export type Connection = { url: string; token: string };
const DEFAULT_URL =
  process.env.EXPO_PUBLIC_RECEIPTS_API_URL ?? 'http://localhost:3001';
export function createReceiptClient(userId: string) {
  const scope = `groceries.${userId}`;
  let active = true;
  const controllers = new Set<AbortController>();
  let current: Connection = { url: DEFAULT_URL, token: '' };
  function connection() {
    return current;
  }
  async function loadConnection() {
    const url = (await AsyncStorage.getItem(`${scope}.apiURL`)) ?? DEFAULT_URL;
    const token =
      Platform.OS === 'web'
        ? sessionStorage.getItem(`${scope}.token`)
        : await SecureStore.getItemAsync(`${scope}.token`);
    current = { url, token: token ?? '' };
    return current;
  }
  async function saveConnection(value: Connection) {
    const url = new URL(value.url.trim());
    if (!['https:', 'http:'].includes(url.protocol))
      throw new Error('Enter an http or https API address.');
    const local =
      ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname) ||
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
    if (url.protocol !== 'https:' && !local)
      throw new Error('Use HTTPS for a remote server.');
    if (value.token.trim().length < 24)
      throw new Error(
        'Enter the app access token from your server configuration.',
      );
    current = {
      url: value.url.trim().replace(/\/$/, ''),
      token: value.token.trim(),
    };
    await AsyncStorage.setItem(`${scope}.apiURL`, current.url);
    if (Platform.OS === 'web')
      sessionStorage.setItem(`${scope}.token`, current.token);
    else await SecureStore.setItemAsync(`${scope}.token`, current.token);
  }
  async function api<T>(
    path: string,
    init: RequestInit = {},
    target: Connection = current,
    timeoutMs = 30_000,
  ): Promise<T> {
    // React Native's AbortSignal polyfill does not expose AbortSignal.timeout.
    if (!active)
      throw new Error('Receipt session ended. Sign in again to continue.');
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(target.url + path, {
        ...init,
        signal: init.signal ?? controller.signal,
        headers: {
          Authorization: `Bearer ${target.token}`,
          ...(typeof init.body === 'string'
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...init.headers,
        },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${response.status})`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }
  async function imageUri(id: string): Promise<string> {
    if (Platform.OS !== 'web')
      return `${current.url}/receipts/${id}/image?preview=1`;
    const response = await fetch(
      `${current.url}/receipts/${id}/image?preview=1`,
      { headers: { Authorization: `Bearer ${current.token}` } },
    );
    if (!response.ok) throw new Error('Could not load original receipt.');
    return URL.createObjectURL(await response.blob());
  }

  return {
    api,
    connection,
    loadConnection,
    saveConnection,
    imageUri,
    isActive: () => active,
    activate: () => {
      active = true;
    },
    dispose: () => {
      active = false;
      for (const c of controllers) c.abort();
      controllers.clear();
    },
  };
}
export type ReceiptClient = ReturnType<typeof createReceiptClient>;
