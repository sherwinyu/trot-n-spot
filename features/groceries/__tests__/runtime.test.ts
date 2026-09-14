import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { createReceiptClient } from '../api';
import { createReceiptOutbox } from '../outbox';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
const session = (id: string, token = 'session-token') => ({
  data: { session: { user: { id }, access_token: token } },
  error: null,
});
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));
jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: () => `receipt-${++counter}` };
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});
test('server settings and receipt queues stay isolated between Trot n Spot accounts', async () => {
  const alice = createReceiptClient('alice'),
    bob = createReceiptClient('bob');
  await alice.saveConnection({
    url: 'https://receipts.example',
  });
  await bob.loadConnection();
  expect(bob.connection().url).toBe('');
  const a = createReceiptOutbox(alice, 'alice'),
    b = createReceiptOutbox(bob, 'bob');
  await a.initOutbox();
  await b.initOutbox();
  await a.enqueue([{ uri: 'file:///camera/receipt.jpg' }]);
  expect(a.snapshot()).toHaveLength(1);
  expect(b.snapshot()).toHaveLength(0);
  expect(a.snapshot()[0].uri).toContain('/receipts/alice/');
  const restored = createReceiptOutbox(alice, 'alice');
  await restored.initOutbox();
  expect(restored.snapshot()[0].id).toBe(a.snapshot()[0].id);
  expect(restored.snapshot()[0].targetURL).toBe('https://receipts.example');
});
test('disposing a feature session stops requests and preserves its queued originals', async () => {
  const client = createReceiptClient('logout-user');
  await client.saveConnection({
    url: 'https://receipts.example',
  });
  const queue = createReceiptOutbox(client, 'logout-user');
  await queue.initOutbox();
  await queue.enqueue([{ uri: 'file:///receipt.jpg' }]);
  client.dispose();
  await queue.drain();
  expect(queue.snapshot()).toHaveLength(1);
  await expect(client.api('/receipts')).rejects.toThrow('session ended');
});
test('sign-out aborts an in-flight receipt request', async () => {
  const client = createReceiptClient('inflight-user');
  await client.saveConnection({ url: 'https://receipts.example' });
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue(session('inflight-user') as any);
  const originalFetch = global.fetch;
  let signal: AbortSignal | undefined;
  global.fetch = jest.fn(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        signal = init?.signal as AbortSignal;
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );
  try {
    const request = client.api('/receipts');
    await Promise.resolve();
    client.dispose();
    await expect(request).rejects.toThrow('aborted');
    expect(signal?.aborted).toBe(true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('requests use refreshed Trot n Spot tokens and reject an account switch before upload', async () => {
  const client = createReceiptClient('alice');
  await client.saveConnection({ url: 'https://receipts.example' });
  const originalFetch = global.fetch;
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({ receipts: [] }),
  })) as jest.Mock;
  global.fetch = fetchMock;
  try {
    jest
      .mocked(supabase.auth.getSession)
      .mockResolvedValue(session('alice', 'first') as any);
    await client.api('/receipts');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer first',
    );
    jest
      .mocked(supabase.auth.getSession)
      .mockResolvedValue(session('alice', 'refreshed') as any);
    await client.api('/receipts');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      'Bearer refreshed',
    );
    jest
      .mocked(supabase.auth.getSession)
      .mockResolvedValue(session('bob') as any);
    await expect(client.api('/receipts', { method: 'POST' })).rejects.toThrow(
      'Sign in',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    global.fetch = originalFetch;
    client.dispose();
  }
});
