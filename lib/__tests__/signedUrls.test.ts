const mockCreateSignedUrl = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({ createSignedUrl: mockCreateSignedUrl }),
    },
  },
}));

import {
  clearSignedPhotoUrlCache,
  getSignedPhotoUrl,
  peekSignedPhotoUrl,
} from '../signedUrls';

describe('signed photo URL cache', () => {
  beforeEach(() => {
    clearSignedPhotoUrlCache();
    mockCreateSignedUrl.mockReset();
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
