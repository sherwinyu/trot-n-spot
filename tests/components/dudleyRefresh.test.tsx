import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, Platform, ScrollViewProps, View } from 'react-native';
import { PanGesture, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { DudleyRefresh } from '@/components/dudley/DudleyRefresh';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
let mockMotion = false;
jest.mock('@/components/dudley/Dudley', () => ({ useMotionAllowed: () => mockMotion }));
jest.mock('expo-image', () => ({ Image: require('react-native').Image }));

let scroll: ScrollViewProps;
const children = (props: ScrollViewProps) => { scroll = props; return <View />; };
const scrolled = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y }, contentInset: {}, contentSize: {}, layoutMeasurement: {}, zoomScale: 1 } } as never);

afterEach(() => { mockMotion = false; jest.restoreAllMocks(); });

it('iOS: refreshes from the list’s own over-scroll once released past the threshold, anywhere on the list', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  render(<DudleyRefresh onRefresh={refresh}>{children}</DudleyRefresh>);
  expect(scroll.bounces).toBe(true);
  expect(scroll.refreshControl).toBeUndefined();
  act(() => { scroll.onScrollBeginDrag?.(scrolled(0)); scroll.onScroll?.(scrolled(-40)); scroll.onScrollEndDrag?.(scrolled(-40)); });
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => { scroll.onScrollBeginDrag?.(scrolled(0)); scroll.onScroll?.(scrolled(-60)); scroll.onScroll?.(scrolled(-120)); scroll.onScrollEndDrag?.(scrolled(-120)); });
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('iOS: ignores a bounce that starts while the caller is loading', () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  render(<DudleyRefresh onRefresh={refresh} disabled>{children}</DudleyRefresh>);
  act(() => { scroll.onScrollBeginDrag?.(scrolled(0)); scroll.onScroll?.(scrolled(-150)); scroll.onScrollEndDrag?.(scrolled(-150)); });
  expect(refresh).not.toHaveBeenCalled();
});

it('keeps every animation JS-driven: the pop shares nodes with the layout-driven reveal height', async () => {
  mockMotion = true;
  const configs: Array<{ useNativeDriver?: boolean }> = [];
  const fake = { start: (cb?: Animated.EndCallback) => cb?.({ finished: true }), stop: jest.fn(), reset: jest.fn() };
  jest.spyOn(Animated, 'timing').mockImplementation((_, config) => { configs.push(config); return fake; });
  jest.spyOn(Animated, 'spring').mockImplementation((_, config) => { configs.push(config); return fake; });
  const refresh = jest.fn().mockResolvedValue(undefined);
  const { getByLabelText } = render(<DudleyRefresh onRefresh={refresh}>{children}</DudleyRefresh>);
  await act(async () => { fireEvent.press(getByLabelText('Refresh')); });
  expect(configs.length).toBeGreaterThan(2);
  expect(configs.filter(c => c.useNativeDriver)).toEqual([]);
});

// fireGestureHandler plays a complete gesture; step through the callbacks directly to observe a pull in progress.
const pull = () => {
  const { handlers } = getByGestureTestId('dudley-pull') as PanGesture;
  const at = (translationY: number, translationX = 0) => ({ translationX, translationY, numberOfPointers: 1 }) as never;
  return {
    begin: () => act(() => { handlers.onBegin?.(at(0)); }),
    move: (dy: number, dx = 0) => act(() => { handlers.onUpdate?.(at(dy, dx)); }),
    end: async (success: boolean) => {
      await act(async () => { handlers.onEnd?.(at(0), success); handlers.onFinalize?.(at(0), success); });
    },
  };
};
// Plays a complete gesture; the first ACTIVE event is the activation (onStart), later ones are updates.
const pan = (...moves: Array<[dx: number, dy: number]>) => act(() => {
  const at = ([translationX, translationY]: [number, number]) => ({ translationX, translationY, numberOfPointers: 1 });
  fireGestureHandler<PanGesture>(getByGestureTestId('dudley-pull'), [
    { state: State.BEGAN, ...at([0, 0]) },
    ...moves.map(m => ({ state: State.ACTIVE, ...at(m) })),
    { state: State.END, ...at(moves[moves.length - 1]) },
  ]);
});

it('Android: a pull that starts anywhere on the list at its top shows Dudley progressively, then refreshes on release', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const refresh = jest.fn().mockResolvedValue(undefined);
  const { queryByText } = render(<DudleyRefresh onRefresh={refresh}>{children}</DudleyRefresh>);
  expect(scroll.bounces).toBe(false);
  expect(scroll.refreshControl).toBeUndefined();
  const g = pull();
  g.begin();
  // The pan runs alongside the list's native scroll; a short drift is not a pull, so the list's children keep the tap.
  g.move(4);
  expect(scroll.scrollEnabled).toBe(true);
  g.move(60);
  expect(queryByText('A little further…')).not.toBeNull();
  expect(scroll.scrollEnabled).toBe(false);
  g.move(180);
  expect(queryByText('Let go — Dudley’s ready!')).not.toBeNull();
  await g.end(true);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(scroll.scrollEnabled).toBe(true);
});

it('Android: a cancelled pull settles without refreshing', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const refresh = jest.fn().mockResolvedValue(undefined);
  const { queryByText } = render(<DudleyRefresh onRefresh={refresh}>{children}</DudleyRefresh>);
  const g = pull();
  g.begin();
  g.move(180);
  expect(queryByText('Let go — Dudley’s ready!')).not.toBeNull();
  await g.end(false);
  expect(queryByText('Let go — Dudley’s ready!')).toBeNull();
  expect(refresh).not.toHaveBeenCalled();
  expect(scroll.scrollEnabled).toBe(true);
});

it('Android: leaves a drag begun mid-list or a horizontal swipe to the list', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const refresh = jest.fn().mockResolvedValue(undefined);
  render(<DudleyRefresh onRefresh={refresh}>{children}</DudleyRefresh>);
  act(() => { scroll.onScroll?.(scrolled(300)); });
  pan([0, 10], [0, 60], [0, 180]);
  act(() => { scroll.onScroll?.(scrolled(0)); });
  pan([0, 10], [60, 20], [0, 180]);
  expect(refresh).not.toHaveBeenCalled();
  expect(scroll.scrollEnabled).toBe(true);
});

it('Android: turning gestures off disables the pull without remounting the list', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const refresh = jest.fn().mockResolvedValue(undefined);
  const mounted = jest.fn();
  const List = (props: ScrollViewProps) => { scroll = props; React.useEffect(mounted, []); return <View />; };
  const list = (props: ScrollViewProps) => <List {...props} />;
  const { rerender, queryByText } = render(<DudleyRefresh onRefresh={refresh}>{list}</DudleyRefresh>);
  rerender(<DudleyRefresh onRefresh={refresh} gesturesEnabled={false}>{list}</DudleyRefresh>);
  expect(scroll.scrollEnabled).toBeUndefined();
  pan([0, 10], [0, 60], [0, 180]);
  expect(queryByText('Let go — Dudley’s ready!')).toBeNull();
  expect(refresh).not.toHaveBeenCalled();
  expect(mounted).toHaveBeenCalledTimes(1);
});
