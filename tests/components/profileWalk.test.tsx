import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import ProfileScreen from '@/app/(tabs)/profile';

const journey = { id: 'walk' };
const mockWalk = {
  activeJourney: null as typeof journey | null,
  startJourney: jest.fn(), endJourney: jest.fn(),
  journeyDuration: 0, loading: false, isBusy: false, error: null,
};
jest.mock('@/hooks/useJourney', () => ({ useJourney: () => mockWalk }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: null, packs: [] }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/components/dudley/WalkDudley', () => ({ WalkDudley: () => null }));
jest.mock('@/components/WalkReminderSettings', () => ({ WalkReminderSettings: () => null }));
jest.mock('@/providers/NotificationProvider', () => ({ useNotifications: () => ({ permission: 'granted' }) }));

it.each(['start', 'end'] as const)('keeps the %s button busy without reversing its action during reminder sync', async (action) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  mockWalk.activeJourney = action === 'start' ? null : journey;
  mockWalk.isBusy = false;
  const mutate = action === 'start' ? mockWalk.startJourney : mockWalk.endJourney;
  mutate.mockReturnValue(pending);
  const { rerender } = render(<ProfileScreen />);
  fireEvent.press(screen.getByText(action === 'start' ? 'Start Walk' : 'End Walk'));

  // The journey is saved before reminder scheduling finishes.
  mockWalk.activeJourney = action === 'start' ? journey : null;
  mockWalk.isBusy = true;
  rerender(<ProfileScreen />);
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  expect(screen.queryByText(action === 'start' ? 'Ending…' : 'Starting…')).toBeNull();

  await act(async () => { finish(); await pending; });
  mockWalk.isBusy = false;
  rerender(<ProfileScreen />);
  expect(screen.getByRole('button', { name: action === 'start' ? 'End Walk' : 'Start Walk' })).toBeEnabled();
});
