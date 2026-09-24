const mockCreateSignedUrl = jest.fn();
let mockIsOnline: boolean | null = true;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({ createSignedUrl: mockCreateSignedUrl }),
    },
  },
}));
jest.mock('@/providers/SyncProvider', () => ({
  useSync: () => ({ isOnline: mockIsOnline }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { cacheSet } from '@/lib/offline';
import { clearSignedPhotoUrlCache } from '@/lib/signedUrls';
import { useSignedPhotoUrl } from '../useSignedPhotoUrl';

const PATH = 'user/quest/thumbnail.jpg';

beforeEach(async () => {
  clearSignedPhotoUrlCache();
  mockCreateSignedUrl.mockReset();
  mockIsOnline = true;
  await AsyncStorage.clear();
});

it('shows the expired URL immediately, then swaps in a fresh one', async () => {
  await cacheSet('signed-urls', {
    [PATH]: { url: 'https://example.test/expired', expiresAt: Date.now() - 1000 },
  });
  mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://example.test/fresh' }, error: null });

  const { result } = renderHook(() => useSignedPhotoUrl(PATH));

  await waitFor(() => expect(result.current.url).toBe('https://example.test/fresh'));
  expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
});

it('keeps the expired URL offline so expo-image can serve from disk', async () => {
  mockIsOnline = false;
  await cacheSet('signed-urls', {
    [PATH]: { url: 'https://example.test/expired', expiresAt: Date.now() - 1000 },
  });

  const { result } = renderHook(() => useSignedPhotoUrl(PATH));

  await waitFor(() => expect(result.current.url).toBe('https://example.test/expired'));
  expect(mockCreateSignedUrl).not.toHaveBeenCalled();
});

it('re-signs once when the current URL fails to load', async () => {
  mockCreateSignedUrl
    .mockResolvedValueOnce({ data: { signedUrl: 'https://example.test/bad' }, error: null })
    .mockResolvedValueOnce({ data: { signedUrl: 'https://example.test/good' }, error: null })
    .mockResolvedValueOnce({ data: { signedUrl: 'https://example.test/never' }, error: null });

  const { result } = renderHook(() => useSignedPhotoUrl(PATH));
  await waitFor(() => expect(result.current.url).toBe('https://example.test/bad'));

  act(() => result.current.reportLoadFailure('https://example.test/bad'));
  await waitFor(() => expect(result.current.url).toBe('https://example.test/good'));

  act(() => result.current.reportLoadFailure('https://example.test/good'));
  await act(async () => {});
  expect(result.current.url).toBe('https://example.test/good');
  expect(mockCreateSignedUrl).toHaveBeenCalledTimes(2);
});

it('does not re-sign a failed URL while offline', async () => {
  mockIsOnline = false;
  await cacheSet('signed-urls', {
    [PATH]: { url: 'https://example.test/expired', expiresAt: Date.now() - 1000 },
  });
  const { result } = renderHook(() => useSignedPhotoUrl(PATH));
  await waitFor(() => expect(result.current.url).toBe('https://example.test/expired'));

  act(() => result.current.reportLoadFailure('https://example.test/expired'));

  expect(mockCreateSignedUrl).not.toHaveBeenCalled();
});
