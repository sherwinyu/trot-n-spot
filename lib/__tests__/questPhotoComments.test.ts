const mockMaybeSingle = jest.fn();
const mockRpc = jest.fn();
const mockInsert = jest.fn();
const mockUpload = jest.fn();
const mockVariants = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }) }) }),
  rpc: (...args: unknown[]) => mockRpc(...args),
} }));
jest.mock('@/lib/photos', () => ({
  createPhotoVariants: (...args: unknown[]) => mockVariants(...args),
  uploadPhoto: (...args: unknown[]) => mockUpload(...args),
}));
jest.mock('@/lib/questActivity', () => ({ COMMENT_MAX_LENGTH: 500, insertComment: (...args: unknown[]) => mockInsert(...args) }));

import { savePhotoComment, promotePhotoComment } from '../questPhotoComments';

const input = { commentId: 'c1', questId: 'q1', userId: 'u1', photoUri: 'file://photo.jpg', body: '  A clue  ' };
const saved = { id: 'c1', photo_path: 'u1/q1/comments/c1/detail.jpg' };

beforeEach(() => {
  jest.resetAllMocks();
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockVariants.mockResolvedValue({ fullUri: 'full', detailUri: 'detail', thumbnailUri: 'thumb' });
  mockInsert.mockResolvedValue(saved);
  mockRpc.mockResolvedValue({ data: { success: true }, error: null });
});

it('uploads immutable variants and stores a trimmed photo comment without completing', async () => {
  expect(await savePhotoComment(input)).toEqual(saved);
  expect(mockUpload.mock.calls).toEqual([
    ['full', 'u1/q1/comments/c1/full.jpg'], ['detail', 'u1/q1/comments/c1/detail.jpg'], ['thumb', 'u1/q1/comments/c1/thumbnail.jpg'],
  ]);
  expect(mockInsert).toHaveBeenCalledWith({
    id: 'c1', quest_id: 'q1', author_id: 'u1', body: 'A clue',
    photo_path: 'u1/q1/comments/c1/detail.jpg', photo_full_path: 'u1/q1/comments/c1/full.jpg', photo_thumbnail_path: 'u1/q1/comments/c1/thumbnail.jpg',
  });
  expect(mockRpc).not.toHaveBeenCalled();
});

it('does not insert or promote if an upload fails', async () => {
  mockUpload.mockRejectedValue(new Error('Network request failed'));
  await expect(savePhotoComment(input)).rejects.toThrow('Network request failed');
  expect(mockInsert).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

it('reuses an existing photo after a lost response without reading the local file', async () => {
  mockMaybeSingle.mockResolvedValue({ data: saved, error: null });
  expect(await savePhotoComment(input)).toEqual(saved);
  expect(mockVariants).not.toHaveBeenCalled();
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockInsert).not.toHaveBeenCalled();
});

it('handles simultaneous retries of the same comment', async () => {
  mockMaybeSingle.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: saved });
  mockInsert.mockRejectedValue({ code: '23505' });
  expect(await savePhotoComment(input)).toEqual(saved);
});

it('rejects a long caption before any upload', async () => {
  await expect(savePhotoComment({ ...input, body: 'x'.repeat(501) })).rejects.toThrow('500');
  expect(mockVariants).not.toHaveBeenCalled();
});

it('promotes only the selected comment, including journey attribution', async () => {
  await promotePhotoComment('q1', 'c1', 'j1');
  expect(mockRpc).toHaveBeenCalledWith('complete_quest_from_comment', { p_quest_id: 'q1', p_comment_id: 'c1', p_journey_id: 'j1' });
  expect(mockUpload).not.toHaveBeenCalled();
});

it('surfaces lost-race errors rather than claiming success', async () => {
  mockRpc.mockResolvedValue({ data: { error: 'Already found by Nadia' }, error: null });
  await expect(promotePhotoComment('q1', 'c1')).rejects.toThrow('Already found by Nadia');
});
