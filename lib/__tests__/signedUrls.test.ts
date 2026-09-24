const mockCreateSignedUrl = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({ createSignedUrl: mockCreateSignedUrl }),
    },
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearSignedPhotoUrlCache,
  getSignedPhotoUrl,
  hydrateSignedPhotoUrlCache,
  invalidateSignedPhotoUrl,
  peekSignedPhotoUrl,
  SIGNED_URL_LIFETIME_SECONDS,
  peekStaleSignedPhotoUrl,
} from '../signedUrls';
import { cacheGet, cacheSet } from '../offline';

type Persisted = Record<string, { url: string; expiresAt: number }>;

describe('signed photo URL cache', () => {
  beforeEach(async () => {
    jest.useRealTimers();
    clearSignedPhotoUrlCache();
    mockCreateSignedUrl.mockReset();
    await AsyncStorage.clear();
  });

  it('persists signed URLs so they survive a cold start', async () => {
    jest.useFakeTimers();
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.test/persisted' },
      error: null,
    });

    await getSignedPhotoUrl('user/quest/thumbnail.jpg');
    await jest.advanceTimersByTimeAsync(300);

    const stored = await cacheGet<Persisted>('signed-urls');
    expect(stored?.['user/quest/thumbnail.jpg'].url).toBe('https://example.test/persisted');
  });

  it('hydrates persisted URLs and exposes expired ones as stale', async () => {
    await cacheSet('signed-urls', {
      'user/quest/fresh.jpg': { url: 'https://example.test/fresh', expiresAt: Date.now() + 24 * 60 * 60 * 1000 },
      'user/quest/expired.jpg': { url: 'https://example.test/expired', expiresAt: Date.now() - 1000 },
    });

    await hydrateSignedPhotoUrlCache();

    expect(peekSignedPhotoUrl('user/quest/fresh.jpg')).toBe('https://example.test/fresh');
    expect(peekSignedPhotoUrl('user/quest/expired.jpg')).toBeNull();
    expect(peekStaleSignedPhotoUrl('user/quest/expired.jpg')).toBe('https://example.test/expired');
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('forgets hydrated URLs on clear', async () => {
    await cacheSet('signed-urls', {
      'user/quest/a.jpg': { url: 'https://example.test/a', expiresAt: Date.now() + 60 * 60 * 1000 },
    });
    await hydrateSignedPhotoUrlCache();
    clearSignedPhotoUrlCache();

    expect(peekStaleSignedPhotoUrl('user/quest/a.jpg')).toBeNull();
  });

  it('deduplicates concurrent signing and reuses the result', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.test/signed' },
      error: null,
    });

    const [first, second] = await Promise.all([
      getSignedPhotoUrl('user/quest/thumbnail.jpg'),
      getSignedPhotoUrl('user/quest/thumbnail.jpg'),
    ]);

    expect(first).toBe('https://example.test/signed');
    expect(second).toBe(first);
    expect(await getSignedPhotoUrl('user/quest/thumbnail.jpg')).toBe(first);
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('signs URLs for a week so a next-day cold start still has a valid one', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.test/week' },
      error: null,
    });

    await getSignedPhotoUrl('user/quest/thumbnail.jpg');

    expect(SIGNED_URL_LIFETIME_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('user/quest/thumbnail.jpg', SIGNED_URL_LIFETIME_SECONDS);
  });

  it('re-signs after a URL is invalidated, but ignores an already-replaced URL', async () => {
    mockCreateSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: 'https://example.test/one' }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://example.test/two' }, error: null });

    expect(await getSignedPhotoUrl('user/quest/a.jpg')).toBe('https://example.test/one');

    invalidateSignedPhotoUrl('user/quest/a.jpg', 'https://example.test/one');
    expect(peekStaleSignedPhotoUrl('user/quest/a.jpg')).toBeNull();
    expect(await getSignedPhotoUrl('user/quest/a.jpg')).toBe('https://example.test/two');

    invalidateSignedPhotoUrl('user/quest/a.jpg', 'https://example.test/one');
    expect(peekSignedPhotoUrl('user/quest/a.jpg')).toBe('https://example.test/two');
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('does not repopulate a cleared cache from an old request', async () => {
    let resolveRequest!: (value: unknown) => void;
    mockCreateSignedUrl.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const pending = getSignedPhotoUrl('user/quest/detail.jpg');
    clearSignedPhotoUrlCache();
    resolveRequest({ data: { signedUrl: 'https://example.test/old-user' }, error: null });
    await pending;

    expect(peekSignedPhotoUrl('user/quest/detail.jpg')).toBeNull();
  });
});
