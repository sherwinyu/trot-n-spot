import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QuestActivity } from '@/components/QuestActivity';
import { Quest, QuestComment } from '@/types/database';

const mockAdd = jest.fn();
const mockCapture = jest.fn();
const mockActivity = {
  comments: [] as QuestComment[], reactions: [], loading: false, posting: false, error: null,
  addComment: mockAdd, removeComment: jest.fn(), toggleReaction: jest.fn(),
};
jest.mock('@/hooks/useQuestActivity', () => ({ useQuestActivity: () => mockActivity }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/providers/AuthProvider', () => ({ usePackLookups: () => ({ memberNames: { me: 'Me', creator: 'Creator' } }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/photos', () => ({ capturePhoto: () => mockCapture() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'draft-photo' }));
jest.mock('@/components/QuestPhoto', () => ({ QuestPhoto: (props: object) => require('react').createElement(require('react-native').Image, props) }));
jest.mock('@/lib/notify', () => ({ confirm: (_title: string, _body: string, action: () => void) => action() }));

const quest = { id: 'q1', creator_id: 'creator', assignee_id: 'me', mode: 'targeted', status: 'active', created_at: '2026-10-21T10:00:00Z' } as Quest;
const photo: QuestComment = {
  id: 'c1', quest_id: 'q1', pack_id: 'p1', author_id: 'me', kind: 'reply', body: '',
  photo_path: 'me/q1/detail.jpg', photo_full_path: null, photo_thumbnail_path: null, created_at: '2026-10-21T12:00:00Z',
};
beforeEach(() => {
  jest.clearAllMocks();
  mockActivity.comments = [];
  mockAdd.mockResolvedValue(true);
  mockCapture.mockResolvedValue('file://capture.jpg');
});

it('posts a photo without a caption or completion, then clears the preview', async () => {
  const onComplete = jest.fn();
  const ui = render(<QuestActivity quest={quest} onComplete={onComplete} />);
  fireEvent.press(ui.getByText('Add photo'));
  await waitFor(() => expect(ui.getByLabelText('Photo comment preview')).toBeTruthy());
  fireEvent.press(ui.getByLabelText('Post photo'));
  await waitFor(() => expect(mockAdd).toHaveBeenCalledWith('', { id: 'draft-photo', uri: 'file://capture.jpg' }));
  await waitFor(() => expect(ui.queryByLabelText('Photo comment preview')).toBeNull());
  expect(onComplete).not.toHaveBeenCalled();
});

it('keeps the caption and same photo id when posting fails', async () => {
  mockAdd.mockResolvedValue(false);
  const ui = render(<QuestActivity quest={quest} />);
  fireEvent.press(ui.getByText('Add photo'));
  await waitFor(() => expect(ui.getByLabelText('Photo comment preview')).toBeTruthy());
  fireEvent.changeText(ui.getByLabelText('Comment'), 'Maybe this one?');
  fireEvent.press(ui.getByLabelText('Post photo'));
  await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));
  expect(ui.getByDisplayValue('Maybe this one?')).toBeTruthy();
  expect(ui.getByLabelText('Photo comment preview')).toBeTruthy();
  fireEvent.press(ui.getByLabelText('Post photo'));
  await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(2));
  expect(mockAdd.mock.calls[1]).toEqual(mockAdd.mock.calls[0]);
});

it('promotes only my photo replies and protects the completed photo from deletion', () => {
  mockActivity.comments = [photo, { ...photo, id: 'other', author_id: 'creator' }, { ...photo, id: 'original', kind: 'original' }];
  const onComplete = jest.fn();
  const ui = render(<QuestActivity quest={quest} onComplete={onComplete} />);
  expect(ui.getAllByText('Complete with this photo')).toHaveLength(1);
  fireEvent.press(ui.getByText('Complete with this photo'));
  expect(onComplete).toHaveBeenCalledWith(photo);
  ui.rerender(<QuestActivity quest={{ ...quest, status: 'completed', completion_comment_id: photo.id }} onComplete={onComplete} />);
  expect(ui.getByText('Completed the quest')).toBeTruthy();
  expect(ui.queryByText('Complete with this photo')).toBeNull();
  expect(ui.queryByLabelText('Delete comment')).toBeNull();
});

it('lets the creator attach photos without offering completion', () => {
  mockActivity.comments = [photo];
  const ui = render(<QuestActivity quest={{ ...quest, creator_id: 'me', assignee_id: 'someone' }} onComplete={jest.fn()} />);
  expect(ui.getByText('Add photo')).toBeTruthy();
  expect(ui.queryByText('Complete with this photo')).toBeNull();
});
