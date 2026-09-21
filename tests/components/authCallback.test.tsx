import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import AuthCallbackScreen from '@/app/auth/callback';
import { completeGoogleSignIn } from '@/lib/googleAuth';

const mockReplace = jest.fn();
let mockParams: Record<string, unknown> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>{`Redirect to ${href}`}</Text>;
  },
}));
jest.mock('@/lib/googleAuth', () => ({ completeGoogleSignIn: jest.fn() }));
const complete = jest.mocked(completeGoogleSignIn);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { code: 'single-use-code' };
});

it('holds the callback screen until the session exchange finishes', async () => {
  let finish!: () => void;
  complete.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<AuthCallbackScreen />);
  expect(screen.getByText('Finishing sign-in…')).toBeTruthy();
  expect(screen.queryByText('Redirect to /(auth)/login')).toBeNull();
  finish();
  await waitFor(() => expect(screen.getByText('Redirect to /(auth)/login')).toBeTruthy());
});

it('lets the user recover from a denied sign-in', async () => {
  mockParams = { error: 'access_denied' };
  complete.mockRejectedValue(new Error('Google sign-in was cancelled. Please try again.'));
  render(<AuthCallbackScreen />);
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(mockReplace).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
});

it('shows a recovery action when the callback has no code', async () => {
  mockParams = {};
  complete.mockRejectedValue(new Error('This sign-in link is incomplete. Please start Google sign-in again.'));
  render(<AuthCallbackScreen />);
  await waitFor(() => expect(screen.getByText('This sign-in link is incomplete. Please start Google sign-in again.')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeTruthy();
});
