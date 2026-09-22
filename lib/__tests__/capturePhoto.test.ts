import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { capturePhoto } from '../photos';
import { notify } from '@/lib/notify';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/notify', () => ({ notify: jest.fn() }));

const mocked = ImagePicker as jest.Mocked<typeof ImagePicker>;
const asset = { canceled: false, assets: [{ uri: 'file:///photo.jpg' }] } as any;

describe('capturePhoto', () => {
  const originalOS = Platform.OS;
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
  });
  afterAll(() => {
    Platform.OS = originalOS;
  });

  it('requests camera permission before launching the camera', async () => {
    mocked.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as any);
    mocked.launchCameraAsync.mockResolvedValue(asset);

    await expect(capturePhoto()).resolves.toBe('file:///photo.jpg');

    expect(mocked.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.launchCameraAsync).toHaveBeenCalledTimes(1);
    expect(mocked.requestCameraPermissionsAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.launchCameraAsync.mock.invocationCallOrder[0]
    );
  });

  it('does not launch the camera when permission is denied and tells the user', async () => {
    mocked.requestCameraPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
    } as any);

    await expect(capturePhoto()).resolves.toBeNull();

    expect(mocked.launchCameraAsync).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Camera access needed', expect.any(String));
  });

  it('surfaces camera launch failures instead of silently doing nothing', async () => {
    mocked.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as any);
    mocked.launchCameraAsync.mockRejectedValue(new Error('Camera not available on simulator'));

    await expect(capturePhoto()).resolves.toBeNull();

    expect(notify).toHaveBeenCalledWith('Camera unavailable', 'Camera not available on simulator');
  });

  it('skips the camera permission prompt on web and uses the library picker', async () => {
    Platform.OS = 'web';
    mocked.launchImageLibraryAsync.mockResolvedValue(asset);

    await expect(capturePhoto()).resolves.toBe('file:///photo.jpg');

    expect(mocked.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.launchCameraAsync).not.toHaveBeenCalled();
  });
});
