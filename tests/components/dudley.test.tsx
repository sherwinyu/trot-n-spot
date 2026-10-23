import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { Dudley, DudleyLoading } from '@/components/dudley/Dudley';
import { WalkDudley } from '@/components/dudley/WalkDudley';
import { QuestBackButton } from '@/components/QuestBackButton';
import { QuestCompletion } from '@/components/QuestCompletion';

let mockFocused = true;
const mockBack = jest.fn(), mockReplace = jest.fn(), mockCanGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }) }));
jest.mock('expo-image', () => ({ Image: require('react-native').Image }));
jest.mock('@/components/dudley/assets/trot.webp', () => 'trot-loop');
jest.mock('@/components/dudley/assets/trot-0.png', () => 'trot-still');
jest.mock('@/components/dudley/assets/wiggle.webp', () => 'wiggle-loop');
jest.mock('@/components/dudley/assets/wiggle-0.png', () => 'wiggle-still');
jest.mock('@/components/dudley/assets/nap.webp', () => 'nap-loop');
jest.mock('@/components/dudley/assets/nap-0.png', () => 'nap-still');

let reduceMotion: (value: boolean) => void;
let appState: (value: AppStateStatus) => void;
const source = () => screen.getByTestId('dudley-image').props.source;
const settle = async () => { await act(async () => {}); };

beforeEach(() => {
  jest.useFakeTimers();
  mockFocused = true;
  mockCanGoBack.mockReturnValue(false);
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, handler: (value: boolean) => void) => {
    reduceMotion = handler;
    return { remove: jest.fn() };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    appState = handler;
    return { remove: jest.fn() };
  });
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

it('starts still, respects live reduced motion, focus and foreground changes', async () => {
  const view = render(<Dudley />);
  expect(source()).toBe('trot-still');
  await settle();
  expect(source()).toBe('trot-loop');
  act(() => reduceMotion(true));
  expect(source()).toBe('trot-still');
  act(() => reduceMotion(false));
  act(() => appState('background'));
  expect(source()).toBe('trot-still');
  act(() => appState('active'));
  expect(source()).toBe('trot-loop');
  mockFocused = false;
  view.rerender(<Dudley />);
  expect(source()).toBe('trot-still');
});

it('does not let an old preference query overwrite a new accessibility event', async () => {
  let resolve!: (value: boolean) => void;
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValue(new Promise(done => { resolve = done; }));
  render(<Dudley />);
  act(() => reduceMotion(true));
  await act(async () => resolve(false));
  expect(source()).toBe('trot-still');
});

it('finishes a celebration while backgrounded and does not replay on return', async () => {
  render(<Dudley mood="wiggle" durationMs={1120} />);
  await settle();
  expect(source()).toBe('wiggle-loop');
  act(() => appState('background'));
  act(() => jest.advanceTimersByTime(1120));
  act(() => appState('active'));
  expect(source()).toBe('wiggle-still');
});

it('boops a resting dog for 2.5 seconds, then restores the still pose', async () => {
  render(<Dudley mood="nap" animate={false} interactive />);
  await settle();
  fireEvent.press(screen.getByRole('button', { name: 'Boop Dudley' }));
  expect(source()).toBe('wiggle-loop');
  expect(screen.getByText('Boop received. Tail activated.')).toBeTruthy();
  act(() => jest.advanceTimersByTime(2499));
  expect(source()).toBe('wiggle-loop');
  act(() => jest.advanceTimersByTime(1));
  expect(source()).toBe('nap-still');
});

it('never flashes a loader for short waits or waits to finish an animation', async () => {
  const view = render(<DudleyLoading loading />);
  act(() => jest.advanceTimersByTime(100));
  view.rerender(<DudleyLoading loading={false} />);
  act(() => jest.advanceTimersByTime(200));
  expect(screen.queryByTestId('dudley-image')).toBeNull();
  view.rerender(<DudleyLoading loading />);
  act(() => jest.advanceTimersByTime(200));
  await settle();
  expect(screen.getByText('Loading quests…')).toBeTruthy();
  view.rerender(<DudleyLoading loading={false} />);
  expect(screen.queryByTestId('dudley-image')).toBeNull();
});

it('shows a pull-to-refresh loader immediately while respecting reduced motion', async () => {
  const view = render(<DudleyLoading loading immediate />);
  expect(screen.getByText('Loading quests…')).toBeTruthy();
  await settle();
  expect(source()).toBe('trot-loop');
  act(() => reduceMotion(true));
  expect(source()).toBe('trot-still');
  view.rerender(<DudleyLoading loading={false} immediate />);
  expect(screen.queryByTestId('dudley-image')).toBeNull();
});

it('uses history for Back and the feed for a direct link', () => {
  render(<QuestBackButton />);
  fireEvent.press(screen.getByRole('button', { name: 'Back to quests' }));
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  expect(mockBack).not.toHaveBeenCalled();
  mockCanGoBack.mockReturnValue(true);
  fireEvent.press(screen.getByRole('button', { name: 'Back to quests' }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('keeps offline acknowledgement honest and navigation available immediately', async () => {
  const onContinue = jest.fn();
  render(<QuestCompletion queued onContinue={onContinue} />);
  await settle();
  expect(screen.getByText('Saved on this device')).toBeTruthy();
  expect(screen.queryByText('Nice spot!')).toBeNull();
  expect(source()).toBe('nap-still');
  fireEvent.press(screen.getByRole('button', { name: 'Back to quests' }));
  expect(onContinue).toHaveBeenCalledTimes(1);
});

it('does not hold confirmed completion navigation for the wiggle', async () => {
  const onContinue = jest.fn();
  render(<QuestCompletion queued={false} onContinue={onContinue} />);
  await settle();
  expect(source()).toBe('wiggle-loop');
  fireEvent.press(screen.getByRole('button', { name: 'Back to quests' }));
  expect(onContinue).toHaveBeenCalledTimes(1);
});

it('keeps both restored and newly started walks moving until the walk ends', async () => {
  const view = render(<WalkDudley journeyId={null} loading />);
  await settle();
  view.rerender(<WalkDudley journeyId="existing-walk" loading={false} />);
  await settle();
  expect(source()).toBe('trot-loop');
  act(() => jest.advanceTimersByTime(10000));
  expect(source()).toBe('trot-loop');
  view.rerender(<WalkDudley journeyId={null} loading={false} />);
  await settle();
  expect(source()).toBe('nap-loop');
  act(() => jest.advanceTimersByTime(2800));
  expect(source()).toBe('nap-still');
  view.rerender(<WalkDudley journeyId="new-walk" loading={false} />);
  await settle();
  expect(source()).toBe('trot-loop');
  act(() => jest.advanceTimersByTime(10000));
  expect(source()).toBe('trot-loop');
});

it('resumes the active walk after a boop and extends the wiggle when booped again', async () => {
  render(<WalkDudley journeyId="active-walk" loading={false} />);
  await settle();
  expect(source()).toBe('trot-loop');
  fireEvent.press(screen.getByRole('button', { name: 'Boop Dudley' }));
  expect(source()).toBe('wiggle-loop');
  act(() => jest.advanceTimersByTime(2000));
  fireEvent.press(screen.getByRole('button', { name: 'Boop Dudley' }));
  act(() => jest.advanceTimersByTime(2499));
  expect(source()).toBe('wiggle-loop');
  act(() => jest.advanceTimersByTime(1));
  expect(source()).toBe('trot-loop');
  act(() => jest.advanceTimersByTime(10000));
  expect(source()).toBe('trot-loop');
});
