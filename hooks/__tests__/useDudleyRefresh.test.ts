import { act, renderHook } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { useDudleyRefresh } from '../useDudleyRefresh';

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
    start: callback => { (value as Animated.Value).setValue(config.toValue as number); callback?.({ finished: true }); },
    stop: jest.fn(), reset: jest.fn(),
  }));
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

function pendingRequest() {
  let finish!: () => void;
  const request = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  return { request, finish: () => finish() };
}

it('tracks the pull reversibly and cancels below the threshold without fetching', () => {
  const request = jest.fn();
  const { result } = renderHook(() => useDudleyRefresh(request, false, true, true));
  act(() => { result.current.controls.begin(); result.current.controls.move(180); });
  expect(result.current.distance).toBe(108);
  act(() => result.current.controls.move(60));
  expect(result.current.distance).toBe(36);
  act(() => result.current.controls.release());
  expect(result.current.phase).toBe('idle');
  expect(request).not.toHaveBeenCalled();
});

it('pops on release, starts the request immediately, then shakes only while waiting', async () => {
  const { request, finish } = pendingRequest();
  const { result } = renderHook(() => useDudleyRefresh(request, false, true, true));
  act(() => { result.current.controls.begin(); result.current.controls.move(180); result.current.controls.release(); });
  expect(request).toHaveBeenCalledTimes(1);
  expect(result.current.phase).toBe('pop');
  act(() => jest.advanceTimersByTime(400));
  expect(result.current.phase).toBe('refresh');
  act(() => { void result.current.controls.refresh(); result.current.controls.begin(); result.current.controls.move(200); result.current.controls.release(); });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(result.current.phase).toBe('idle');
});

it('never claims scrolls started below the top, upward/horizontal drags or multiple touches', () => {
  const { result } = renderHook(() => useDudleyRefresh(jest.fn(), false, true, true));
  const c = result.current.controls;
  c.scroll(100); c.begin(); c.scroll(0);
  expect(c.canMove(0, 180)).toBe(false);
  c.begin(); expect(c.canMove(0, -180)).toBe(false);
  expect(c.canMove(180, 10)).toBe(false);
  expect(c.canMove(0, 180)).toBe(false);
  c.begin(); expect(c.canMove(0, 180, 2)).toBe(false);
  c.begin(); expect(c.canMove(0, 180)).toBe(true);
});

it('clears a canceled gesture and a gesture interrupted by blur', () => {
  const request = jest.fn();
  const { result, rerender } = renderHook<ReturnType<typeof useDudleyRefresh>, { focused: boolean }>(({ focused }) => useDudleyRefresh(request, false, true, focused), { initialProps: { focused: true } });
  act(() => { result.current.controls.begin(); result.current.controls.move(220); result.current.controls.cancel(); result.current.controls.release(); });
  expect(request).not.toHaveBeenCalled();
  act(() => { result.current.controls.begin(); result.current.controls.move(220); });
  rerender({ focused: false });
  expect(result.current.phase).toBe('idle');
  act(() => result.current.controls.release());
  expect(request).not.toHaveBeenCalled();
});

it('uses a static refresh with reduced motion and clears failures so retry works', async () => {
  const request = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const { result } = renderHook(() => useDudleyRefresh(request, false, false, true));
  act(() => { void result.current.controls.refresh(); });
  expect(result.current.phase).toBe('refresh');
  await act(async () => {});
  expect(result.current.phase).toBe('idle');
  expect(result.current.error).toBe(true);
  await act(async () => { await result.current.controls.refresh(); });
  expect(result.current.error).toBe(false);
  expect(request).toHaveBeenCalledTimes(2);
});

it('cleans up a fast response before the pop timer, and a request finishing after unmount', async () => {
  const request = jest.fn().mockResolvedValue(undefined);
  const { result, unmount } = renderHook(() => useDudleyRefresh(request, false, true, true));
  await act(async () => { await result.current.controls.refresh(); });
  act(() => jest.advanceTimersByTime(1000));
  expect(result.current.phase).toBe('idle');
  unmount();
  const delayed = pendingRequest();
  const second = renderHook(() => useDudleyRefresh(delayed.request, false, true, true));
  act(() => { void second.result.current.controls.refresh(); });
  second.unmount();
  const animationsAfterUnmount = jest.mocked(Animated.timing).mock.calls.length;
  await act(async () => delayed.finish());
  expect(Animated.timing).toHaveBeenCalledTimes(animationsAfterUnmount);
});

it('blocks refresh while the caller is already loading and uses the latest callback', async () => {
  const first = jest.fn(), next = jest.fn().mockResolvedValue(undefined);
  const { result, rerender } = renderHook<ReturnType<typeof useDudleyRefresh>, { disabled: boolean; refresh: () => Promise<unknown> }>(({ disabled, refresh }) => useDudleyRefresh(refresh, disabled, false, true), { initialProps: { disabled: true, refresh: first } });
  await act(async () => { await result.current.controls.refresh(); });
  expect(first).not.toHaveBeenCalled();
  rerender({ disabled: false, refresh: next });
  await act(async () => { await result.current.controls.refresh(); });
  expect(next).toHaveBeenCalledTimes(1);
});

it('keeps the refresh action available when form screens disable gestures', async () => {
  const request = jest.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useDudleyRefresh(request, false, false, true, false));
  result.current.controls.begin();
  expect(result.current.controls.canMove(0, 200)).toBe(false);
  act(() => { result.current.controls.move(200); result.current.controls.release(); });
  expect(request).not.toHaveBeenCalled();
  await act(async () => { await result.current.controls.refresh(); });
  expect(request).toHaveBeenCalledTimes(1);
});
