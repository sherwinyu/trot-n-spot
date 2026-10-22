import { getExpoPushToken, removePushToken, syncPushToken } from '../notifications';

const mockGetToken = jest.fn();
const mockDeleteToken = jest.fn();
const mockRegisterToken = jest.fn();
jest.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 5 },
  setNotificationChannelAsync: async () => {},
  getPermissionsAsync: async () => ({ status: 'granted' }),
  getExpoPushTokenAsync: () => mockGetToken(),
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { eas: { projectId: 'test-project' } } } }));
jest.mock('@/lib/supabase', () => ({ supabase: {
  rpc: (...args: unknown[]) => mockRegisterToken(...args),
  from: () => ({ delete: () => ({ eq: (...args: unknown[]) => mockDeleteToken(...args) }) }),
} }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockGetToken.mockResolvedValue({ data: 'device-token' });
  mockDeleteToken.mockResolvedValue({ error: null });
  mockRegisterToken.mockResolvedValue({ error: null });
});
afterEach(() => jest.useRealTimers());

it('lets sign-out token cleanup finish when APNs never returns a token', async () => {
  mockGetToken.mockReturnValue(new Promise(() => {}));
  const finished = jest.fn();
  void removePushToken().then(finished);

  await jest.advanceTimersByTimeAsync(5_000);

  expect(finished).toHaveBeenCalledTimes(1);
  expect(mockDeleteToken).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it('does not delete a late token after cleanup has timed out', async () => {
  let resolve!: (value: { data: string }) => void;
  mockGetToken.mockReturnValue(new Promise((done) => { resolve = done; }));
  const finished = jest.fn();
  void removePushToken().then(finished);
  await jest.advanceTimersByTimeAsync(5_000);
  expect(finished).toHaveBeenCalledTimes(1);

  resolve({ data: 'late-token' });
  await jest.advanceTimersByTimeAsync(0);

  expect(mockDeleteToken).not.toHaveBeenCalled();
});

it('still deletes an available token before sign-out', async () => {
  await removePushToken();
  expect(mockDeleteToken).toHaveBeenCalledWith('token', 'device-token');
  expect(jest.getTimerCount()).toBe(0);
});

it('still registers an available token for pack activity', async () => {
  await expect(syncPushToken()).resolves.toBe('device-token');
  expect(mockRegisterToken).toHaveBeenCalledWith('register_push_token', {
    p_token: 'device-token', p_platform: expect.stringMatching(/^(ios|android)$/),
  });
  expect(jest.getTimerCount()).toBe(0);
});

it('treats token acquisition errors as unavailable and clears its timer', async () => {
  mockGetToken.mockRejectedValue(new Error('APNs unavailable'));
  await expect(getExpoPushToken()).resolves.toBeNull();
  expect(jest.getTimerCount()).toBe(0);
});
