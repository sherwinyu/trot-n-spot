import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

const serviceURL = 'https://receipts.example';

test('a configured release ignores saved server overrides and cannot change destinations', async () => {
  await AsyncStorage.setItem('groceries.alice.apiURL', 'https://old-server.example');
  const previous = process.env.EXPO_PUBLIC_RECEIPTS_API_URL;
  process.env.EXPO_PUBLIC_RECEIPTS_API_URL = serviceURL;
  try {
    let client!: ReturnType<typeof import('../api').createReceiptClient>;
    jest.isolateModules(() => {
      client = require('../api').createReceiptClient('alice');
    });
    expect(await client.loadConnection()).toEqual({ url: serviceURL });
    await expect(client.saveConnection({ url: 'https://another-server.example' }))
      .rejects.toThrow('managed by Trot n Spot');
    expect(client.connection()).toEqual({ url: serviceURL });
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_RECEIPTS_API_URL;
    else process.env.EXPO_PUBLIC_RECEIPTS_API_URL = previous;
    await AsyncStorage.clear();
  }
});
