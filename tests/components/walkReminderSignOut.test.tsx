import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';

const mockSignOut = jest.fn();
const mockReminderAccount = jest.fn();
jest.mock('@/lib/auth', () => ({ signOut: () => mockSignOut(), signInWithGoogle: jest.fn() }));
jest.mock('@/lib/walkReminders', () => ({ setWalkReminderAccount: (...args: unknown[]) => mockReminderAccount(...args) }));
jest.mock('@/lib/notifications', () => ({ removePushToken: async () => {} }));
jest.mock('@/lib/signedUrls', () => ({ clearSignedPhotoUrlCache: jest.fn(), hydrateSignedPhotoUrlCache: jest.fn() }));
jest.mock('@/lib/prefetch', () => ({ resetPrefetchMemory: jest.fn() }));
jest.mock('@/lib/offline', () => ({ cacheClearAll: async () => {}, cacheGet: async () => null, cacheSet: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'me' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
  },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
} }));
function wrapper({ children }: { children: React.ReactNode }) { return <AuthProvider>{children}</AuthProvider>; }

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
  mockReminderAccount.mockResolvedValue(undefined);
});

it('preserves reminders and the signed-in account when server sign-out fails', async () => {
  mockSignOut.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await expect(result.current.signOut()).rejects.toThrow('offline'); });
  expect(result.current.user?.id).toBe('me');
  expect(mockReminderAccount).not.toHaveBeenCalled();
});

it('finishes sign-out even if the OS fails to clean up reminders', async () => {
  mockReminderAccount.mockRejectedValue(new Error('OS failure'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.signOut()).resolves.toBeUndefined(); });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
  } finally { warn.mockRestore(); }
});
