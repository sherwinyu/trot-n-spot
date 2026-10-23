import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { QuestPhoto } from '@/components/QuestPhoto';

const mockReportFailure = jest.fn();
const mockSignedUrl = jest.fn((path: string | null) => ({
  url: path ? `signed:${path}` : null,
  reportLoadFailure: mockReportFailure,
}));
jest.mock('@/hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: (path: string | null) => mockSignedUrl(path) }));
jest.mock('expo-image', () => ({ Image: require('react-native').Image }));
jest.mock('@/components/ImageViewerModal', () => ({
  ImageViewerModal: (props: object) => require('react').createElement(require('react-native').View, { ...props, testID: 'viewer' }),
}));

beforeEach(() => jest.clearAllMocks());

it('opens the full photo only on tap without navigating the containing card', () => {
  const navigate = jest.fn();
  const ui = render(
    <Pressable onPress={navigate}>
      <QuestPhoto storagePath="thumbnail.jpg" previewStoragePath="full.jpg" style={{ flex: 1, height: 120 }} accessibilityLabel="Quest photo" />
    </Pressable>
  );
  expect(mockSignedUrl).not.toHaveBeenCalledWith('full.jpg');
  expect(ui.queryByTestId('viewer')).toBeNull();
  const stopPropagation = jest.fn();
  fireEvent.press(ui.getByRole('button', { name: 'View Quest photo full screen' }), { stopPropagation });
  expect(stopPropagation).toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
  expect(ui.getByTestId('viewer').props.source).toEqual({ uri: 'signed:full.jpg', cacheKey: 'quest-photo:full.jpg' });
  fireEvent(ui.getByTestId('viewer'), 'close');
  expect(ui.queryByTestId('viewer')).toBeNull();
});

it('retains the cached thumbnail when the full image fails and requests a fresh signature', () => {
  const ui = render(<QuestPhoto storagePath="thumbnail.jpg" previewStoragePath="full.jpg" style={{ height: 120 }} />);
  fireEvent.press(ui.getByRole('button'), { stopPropagation: jest.fn() });
  fireEvent(ui.getByTestId('viewer'), 'error');
  expect(mockReportFailure).toHaveBeenCalledWith('signed:full.jpg');
  expect(ui.getByTestId('viewer').props.source).toEqual({ uri: 'signed:thumbnail.jpg', cacheKey: 'quest-photo:thumbnail.jpg' });
});

it('previews local pending captures without signing either storage path', () => {
  const ui = render(<QuestPhoto storagePath="remote.jpg" previewStoragePath="full.jpg" localUri="file://pending.jpg" style={{ height: 120 }} />);
  fireEvent.press(ui.getByRole('button'), { stopPropagation: jest.fn() });
  expect(mockSignedUrl.mock.calls.every(([path]) => path === null)).toBe(true);
  expect(ui.getByTestId('viewer').props.source).toEqual({ uri: 'file://pending.jpg' });
});

it('keeps missing-photo fallbacks non-interactive', () => {
  const ui = render(<QuestPhoto storagePath={null} style={{ height: 120 }} fallback={<Text>No photo</Text>} />);
  expect(ui.getByText('No photo')).toBeTruthy();
  expect(ui.queryByRole('button')).toBeNull();
});

it('does not transfer an open viewer to a recycled list photo', () => {
  const ui = render(<QuestPhoto storagePath="first.jpg" style={{ height: 120 }} />);
  fireEvent.press(ui.getByRole('button'), { stopPropagation: jest.fn() });
  expect(ui.getByTestId('viewer')).toBeTruthy();
  ui.rerender(<QuestPhoto storagePath="second.jpg" style={{ height: 120 }} />);
  expect(ui.queryByTestId('viewer')).toBeNull();
});
