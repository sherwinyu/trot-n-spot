import { act, fireEvent, render } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { GestureHandlerRootView, type PanGesture, type PinchGesture, type TapGesture } from 'react-native-gesture-handler';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { ImageViewerModal } from '@/components/ImageViewerModal';

let mockStyle: () => { transform: object[] };
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: require('react-native').View,
    createAnimatedComponent: (component: unknown) => component,
  },
  useSharedValue: (value: number) => require('react').useRef({ value }).current,
  useEvent: () => () => {},
  useAnimatedStyle: (callback: typeof mockStyle) => { mockStyle = callback; return callback(); },
  withTiming: (value: number) => value,
}));
jest.mock('expo-image', () => ({ Image: require('react-native').Image }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 30, right: 0 }) }));

const setup = async () => {
  const onClose = jest.fn();
  const onError = jest.fn();
  const ui = render(<ImageViewerModal source={{ uri: 'photo.jpg' }} onClose={onClose} onError={onError} />);
  fireEvent(ui.UNSAFE_getByType(GestureHandlerRootView), 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
  fireEvent(ui.getByLabelText('Full-screen photo'), 'load', { source: { width: 1200, height: 600 } });
  await act(async () => {});
  return { ui, onClose, onError };
};
const doubleTap = (success = true) => act(() => {
  (getByGestureTestId('photo-double-tap') as TapGesture).handlers.onEnd?.({} as never, success);
});
const pan = (translationX: number, translationY: number) => act(() => {
  const { handlers } = getByGestureTestId('photo-pan') as PanGesture;
  handlers.onStart?.({} as never);
  const event = { translationX, translationY, changeX: translationX, changeY: translationY, numberOfPointers: 1 } as never;
  handlers.onUpdate?.(event);
  handlers.onChange?.(event);
});
const pinch = (scale: number, focalX = 200, focalY = 400) => act(() => {
  const { handlers } = getByGestureTestId('photo-pinch') as PinchGesture;
  handlers.onStart?.({ focalX, focalY } as never);
  handlers.onUpdate?.({ scale, focalX, focalY } as never);
});

it('ignores failed double taps and toggles successful ones between 1x and 3x', async () => {
  await setup();
  doubleTap(false);
  expect(mockStyle().transform).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
  doubleTap();
  expect(mockStyle().transform[2]).toEqual({ scale: 3 });
  doubleTap();
  expect(mockStyle().transform).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
});

it('bounds pan by the contained photo rather than the full-screen letterbox', async () => {
  await setup();
  pan(999, 999);
  expect(mockStyle().transform).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
  doubleTap();
  pan(999, 999);
  // The 2:1 image at 3x is 1200x600 inside a 400x800 viewport.
  expect(mockStyle().transform).toEqual([{ translateX: 400 }, { translateY: 0 }, { scale: 3 }]);
});

it('clamps an already-panned photo immediately when pinching back out', async () => {
  await setup();
  pinch(6);
  pan(999, 999);
  pinch(1 / 3);
  expect(mockStyle().transform).toEqual([{ translateX: 200 }, { translateY: 0 }, { scale: 2 }]);
  pinch(0.1);
  expect(mockStyle().transform).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
});

it('zooms around the pinch focal point and caps magnification at 6x', async () => {
  await setup();
  pinch(2, 300, 400);
  expect(mockStyle().transform).toEqual([{ translateX: -100 }, { translateY: 0 }, { scale: 2 }]);
  pinch(100);
  expect(mockStyle().transform[2]).toEqual({ scale: 6 });
});

it('does not let an active pan overwrite a two-finger pinch', async () => {
  await setup();
  const { handlers } = getByGestureTestId('photo-pan') as PanGesture;
  act(() => { handlers.onStart?.({} as never); });
  pinch(2, 300, 400);
  act(() => {
    const event = { translationX: 20, translationY: 20, changeX: 20, changeY: 20, numberOfPointers: 2 } as never;
    handlers.onUpdate?.(event);
    handlers.onChange?.(event);
  });
  expect(mockStyle().transform).toEqual([{ translateX: -100 }, { translateY: 0 }, { scale: 2 }]);
  act(() => {
    const event = { translationX: 30, translationY: 20, changeX: 10, changeY: 0, numberOfPointers: 1 } as never;
    handlers.onUpdate?.(event);
    handlers.onChange?.(event);
  });
  expect(mockStyle().transform).toEqual([{ translateX: -90 }, { translateY: 0 }, { scale: 2 }]);
});

it('resets on rotation and remount, but not when a higher-resolution image arrives', async () => {
  const { ui, onClose, onError } = await setup();
  doubleTap();
  ui.rerender(<ImageViewerModal source={{ uri: 'full.jpg' }} onClose={onClose} onError={onError} />);
  expect(mockStyle().transform[2]).toEqual({ scale: 3 });
  fireEvent(ui.UNSAFE_getByType(GestureHandlerRootView), 'layout', { nativeEvent: { layout: { width: 800, height: 400 } } });
  expect(mockStyle().transform[2]).toEqual({ scale: 1 });
  doubleTap();
  ui.unmount();
  await setup();
  expect(mockStyle().transform[2]).toEqual({ scale: 1 });
});

it('closes via the accessible button or Android back and exposes image failures', async () => {
  const { ui, onClose, onError } = await setup();
  fireEvent.press(ui.getByRole('button', { name: 'Close photo viewer' }), { stopPropagation: jest.fn() });
  fireEvent(ui.UNSAFE_getByType(Modal), 'requestClose');
  expect(onClose).toHaveBeenCalledTimes(2);
  fireEvent(ui.getByLabelText('Full-screen photo'), 'error');
  expect(onError).toHaveBeenCalledTimes(1);
  expect(ui.getByText('Photo unavailable')).toBeTruthy();
});
