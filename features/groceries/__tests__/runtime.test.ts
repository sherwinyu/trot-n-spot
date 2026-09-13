import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createReceiptClient } from '../api';
import { createReceiptOutbox } from '../outbox';

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
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
test('credentials and receipt queues stay isolated between Trot n Spot accounts', async () => {
  const alice = createReceiptClient('alice'),
    bob = createReceiptClient('bob');
  await alice.saveConnection({
    url: 'https://receipts.example',
    token: 'alice-private-token-123456789',
  });
  await bob.loadConnection();
  expect(bob.connection().token).toBe('');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'groceries.alice.token',
    'alice-private-token-123456789',
  );
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
    token: 'private-token-123456789012345',
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
    client.dispose();
    await expect(request).rejects.toThrow('aborted');
    expect(signal?.aborted).toBe(true);
  } finally {
    global.fetch = originalFetch;
  }
});
