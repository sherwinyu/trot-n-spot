import React from 'react';
import { act, render } from '@testing-library/react-native';
import { PanResponder, PanResponderCallbacks, TextInput, View } from 'react-native';
import { DudleyRefresh } from '@/components/dudley/DudleyRefresh';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/components/dudley/Dudley', () => ({ useMotionAllowed: () => false }));
jest.mock('expo-image', () => ({ Image: require('react-native').Image }));

let handlers: PanResponderCallbacks;
let editing = false;
const event = {} as Parameters<NonNullable<PanResponderCallbacks['onPanResponderStart']>>[0];
const gesture = (touches = 1) => ({ numberActiveTouches: touches, dy: 200, dx: 0 }) as Parameters<NonNullable<PanResponderCallbacks['onPanResponderStart']>>[1];

beforeEach(() => {
  editing = false;
  jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockImplementation(() => editing ? {} as ReturnType<typeof TextInput.State.currentlyFocusedInput> : null as unknown as ReturnType<typeof TextInput.State.currentlyFocusedInput>);
  jest.spyOn(PanResponder, 'create').mockImplementation(config => { handlers = config; return { panHandlers: {} }; });
});
afterEach(() => jest.restoreAllMocks());

it('does not claim a drag when an input is focused at start or gains focus before movement', () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  render(<DudleyRefresh onRefresh={refresh}>{() => <View />}</DudleyRefresh>);
  editing = true;
  act(() => { handlers.onStartShouldSetPanResponderCapture?.(event, gesture()); });
  act(() => { expect(handlers.onMoveShouldSetPanResponderCapture?.(event, gesture())).toBe(false); });
  editing = false;
  act(() => { handlers.onStartShouldSetPanResponderCapture?.(event, gesture()); });
  editing = true;
  act(() => { expect(handlers.onMoveShouldSetPanResponderCapture?.(event, gesture())).toBe(false); });
  act(() => handlers.onPanResponderRelease?.(event, gesture(0)));
  expect(refresh).not.toHaveBeenCalled();
});

it('cancels an armed native pull when a second finger lands, even without a further move', () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  render(<DudleyRefresh onRefresh={refresh}>{() => <View />}</DudleyRefresh>);
  act(() => { handlers.onStartShouldSetPanResponderCapture?.(event, gesture()); });
  expect(handlers.onMoveShouldSetPanResponderCapture?.(event, gesture())).toBe(true);
  act(() => handlers.onPanResponderGrant?.(event, gesture()));
  act(() => handlers.onPanResponderStart?.(event, gesture(2)));
  act(() => handlers.onPanResponderRelease?.(event, gesture(0)));
  expect(refresh).not.toHaveBeenCalled();
});
