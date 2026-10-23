import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { WalkReminderSettings } from '@/components/WalkReminderSettings';

const mockRead = jest.fn();
jest.mock('expo-notifications', () => ({}));
const mockUpdate = jest.fn();
const mockRequest = jest.fn();
const mockSettings = jest.fn();
let mockPermission = 'granted';
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/hooks/useJourney', () => ({ useJourney: () => ({ reminderError: null, loading: false }) }));
jest.mock('@/providers/NotificationProvider', () => ({ useNotifications: () => ({
  permission: mockPermission, requestPermission: mockRequest, openSystemSettings: mockSettings,
}) }));
jest.mock('@/lib/walkReminders', () => ({
  ...jest.requireActual('@/lib/walkReminders'),
  prepareWalkReminderNotifications: jest.fn(),
  readWalkReminders: (...args: unknown[]) => mockRead(...args),
  updateWalkReminders: (...args: unknown[]) => mockUpdate(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = 'granted';
  mockRead.mockResolvedValue({ isEnabled: true, morning: 420, evening: 960 });
  mockUpdate.mockResolvedValue(undefined);
});

it('loads persisted local times and saves an edited time', async () => {
  render(<WalkReminderSettings />);
  await waitFor(() => expect(screen.getByLabelText('Morning reminder time').props.editable).toBe(true));
  fireEvent.changeText(screen.getByLabelText('Morning reminder time'), '08:15');
  fireEvent.press(screen.getByText('Save reminder times'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('me', { isEnabled: true, morning: 495, evening: 960 }));
});

it('can disable reminders even with an invalid unsaved time draft', async () => {
  render(<WalkReminderSettings />);
  await waitFor(() => expect(screen.getByLabelText('Morning reminder time').props.editable).toBe(true));
  fireEvent.changeText(screen.getByLabelText('Morning reminder time'), 'bad');
  fireEvent(screen.getByLabelText('Walk reminders'), 'valueChange', false);
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('me', { isEnabled: false, morning: 420, evening: 960 }));
});

it('keeps reminders off if notification permission is refused', async () => {
  mockRead.mockResolvedValue({ isEnabled: false, morning: 420, evening: 960 });
  mockPermission = 'undetermined';
  mockRequest.mockResolvedValue('denied');
  render(<WalkReminderSettings />);
  await waitFor(() => expect(screen.getByLabelText('Morning reminder time').props.editable).toBe(true));
  fireEvent(screen.getByLabelText('Walk reminders'), 'valueChange', true);
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Walk reminders').props.value).toBe(false);
});

it('reports invalid times without saving or asking for permission', async () => {
  mockRead.mockResolvedValue({ isEnabled: false, morning: 420, evening: 960 });
  mockPermission = 'undetermined';
  mockRequest.mockResolvedValue('granted');
  render(<WalkReminderSettings />);
  await waitFor(() => expect(screen.getByLabelText('Morning reminder time').props.editable).toBe(true));
  fireEvent.changeText(screen.getByLabelText('Morning reminder time'), '23:00');
  fireEvent(screen.getByLabelText('Walk reminders'), 'valueChange', true);
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(mockRequest).not.toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
});
