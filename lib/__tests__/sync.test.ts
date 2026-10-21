const mockSave = jest.fn();
const mockPromote = jest.fn();
const mockRpc = jest.fn();
const mockUpload = jest.fn();
jest.mock('@/lib/questPhotoComments', () => ({ savePhotoComment: (...args: unknown[]) => mockSave(...args), promotePhotoComment: (...args: unknown[]) => mockPromote(...args) }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock('@/lib/photos', () => ({
  createPhotoVariants: async () => ({ fullUri: 'full', detailUri: 'detail', thumbnailUri: 'thumb' }),
  uploadPhoto: (...args: unknown[]) => mockUpload(...args),
}));
import { syncCompleteQuest } from '../sync';

const payload = { questId: 'q1', userId: 'u1', photoUri: 'file://photo.jpg', journeyId: 'j1' };
beforeEach(() => { jest.resetAllMocks(); mockRpc.mockResolvedValue({ data: { success: true } }); });

it('atomically saves and promotes a queued photo, retaining its client id and caption', async () => {
  await syncCompleteQuest({ ...payload, commentId: 'c1', body: 'Found it' });
  expect(mockSave).toHaveBeenCalledWith({ ...payload, commentId: 'c1', body: 'Found it' }, { journeyId: 'j1' });
  expect(mockPromote).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

it('does not promote after a failed photo save', async () => {
  mockSave.mockRejectedValue(new Error('Network request failed'));
  await expect(syncCompleteQuest({ ...payload, commentId: 'c1' })).rejects.toThrow('Network request failed');
  expect(mockPromote).not.toHaveBeenCalled();
});

it('replays pre-upgrade completion payloads using the compatible RPC', async () => {
  await syncCompleteQuest(payload);
  expect(mockRpc).toHaveBeenCalledWith('complete_quest', {
    p_quest_id: 'q1', p_journey_id: 'j1', p_photo_path: 'u1/q1/completion-detail.jpg',
    p_photo_full_path: 'u1/q1/completion-full.jpg', p_photo_thumbnail_path: 'u1/q1/completion-thumbnail.jpg',
  });
  expect(mockSave).not.toHaveBeenCalled();
});
