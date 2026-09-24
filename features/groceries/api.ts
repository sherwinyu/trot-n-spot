import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
export type Connection = { url: string };
const DEFAULT_URL = process.env.EXPO_PUBLIC_RECEIPTS_API_URL ?? '';
export const RECEIPTS_SERVICE_CONFIGURED = Boolean(DEFAULT_URL);
export function createReceiptClient(userId: string) {
  const scope = `groceries.${userId}`;
  let active = true;
  const controllers = new Set<AbortController>();
  let current: Connection = { url: DEFAULT_URL };
  function connection() {
    return current;
  }
  async function loadConnection() {
    // A released app owns its destination; old development settings must not
    // redirect receipt photos or the user's Supabase token to another server.
    const url = DEFAULT_URL || (await AsyncStorage.getItem(`${scope}.apiURL`)) || '';
    current = { url };
    return current;
  }
  async function saveConnection(value: Connection) {
    if (RECEIPTS_SERVICE_CONFIGURED)
      throw new Error('The receipt connection is managed by Trot n Spot.');
    const url = new URL(value.url.trim());
    if (!['https:', 'http:'].includes(url.protocol))
      throw new Error('Enter an http or https API address.');
    const local =
      ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname) ||
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
    if (url.protocol !== 'https:' && !local)
      throw new Error('Use HTTPS for a remote server.');
    current = { url: value.url.trim().replace(/\/$/, '') };
    await AsyncStorage.setItem(`${scope}.apiURL`, current.url);
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
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (!active)
        throw new Error('Receipt session ended. Sign in again to continue.');
      if (error || !session || session.user.id !== userId)
        throw new Error(
          'Sign in to Trot n Spot again to access your receipts.',
        );
      if (!target.url)
        throw new Error('The receipt service has not been configured yet.');
      const response = await fetch(target.url + path, {
        ...init,
        signal: init.signal ?? controller.signal,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
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
    const { url } = await api<{ url: string }>(`/receipts/${id}/image-url`);
    return url;
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
