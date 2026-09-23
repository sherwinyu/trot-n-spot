import { act, renderHook } from '@testing-library/react-native';
import { usePullRefresh } from '../usePullRefresh';

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

it('starts the request immediately and holds a fast refresh for two seconds', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => usePullRefresh(refresh));
  expect(result.current.refreshing).toBe(false);
  act(() => { void result.current.onRefresh(); });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(result.current.refreshing).toBe(true);
  await act(async () => { jest.advanceTimersByTime(1999); });
  expect(result.current.refreshing).toBe(true);
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(result.current.refreshing).toBe(false);
});

it('waits for a slow request without adding another two-second delay', async () => {
  let finish!: () => void;
  const refresh = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const { result } = renderHook(() => usePullRefresh(refresh));
  act(() => { void result.current.onRefresh(); });
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(result.current.refreshing).toBe(true);
  await act(async () => { finish(); });
  expect(result.current.refreshing).toBe(false);
});

it('ignores duplicate pulls and permits a new refresh once the first finishes', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => usePullRefresh(refresh));
  act(() => { void result.current.onRefresh(); void result.current.onRefresh(); });
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(2000); });
  act(() => { void result.current.onRefresh(); });
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(result.current.refreshing).toBe(true);
  await act(async () => { jest.advanceTimersByTime(2000); });
});

it('clears the indicator after a failed refresh and preserves the error', async () => {
  const failure = new Error('offline');
  const refresh = jest.fn().mockRejectedValue(failure);
  const { result } = renderHook(() => usePullRefresh(refresh));
  let completion!: Promise<unknown>;
  act(() => { completion = result.current.onRefresh().catch(error => error); });
  await act(async () => { jest.advanceTimersByTime(1999); });
  expect(result.current.refreshing).toBe(true);
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(await completion).toBe(failure);
  expect(result.current.refreshing).toBe(false);
});
