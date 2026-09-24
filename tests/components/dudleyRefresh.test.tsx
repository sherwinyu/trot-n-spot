import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, Platform, RefreshControl, ScrollViewProps, View } from 'react-native';
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

it('Android: a standard native pull anywhere on the list triggers the refresh, unless gestures are off', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const refresh = jest.fn().mockResolvedValue(undefined);
  const { rerender } = render(<DudleyRefresh onRefresh={refresh}>{children}</DudleyRefresh>);
  const control = scroll.refreshControl as React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  expect(control.type).toBe(RefreshControl);
  expect(scroll.bounces).toBe(false);
  await act(async () => control.props.onRefresh?.());
  expect(refresh).toHaveBeenCalledTimes(1);
  rerender(<DudleyRefresh onRefresh={refresh} gesturesEnabled={false}>{children}</DudleyRefresh>);
  expect(scroll.refreshControl).toBeUndefined();
});
