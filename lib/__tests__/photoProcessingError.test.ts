import { getPhotoProcessingErrorMessage } from '../photoProcessingError';

describe('getPhotoProcessingErrorMessage', () => {
  it('reports explicit storage exhaustion', () => {
    expect(getPhotoProcessingErrorMessage(new Error('ENOSPC: No space left on device'))).toBe(
      'Your phone ran out of storage space. Free up space and try again.'
    );
  });

  it('distinguishes RAM exhaustion from device storage', () => {
    expect(getPhotoProcessingErrorMessage(new Error('OutOfMemoryError: Failed to allocate bitmap'))).toBe(
      'Your phone ran low on memory (RAM) while processing the photo. Close other apps or try a smaller photo.'
    );
  });

  it('reports critically low available storage when the native error is vague', () => {
    expect(getPhotoProcessingErrorMessage(new Error('Loading bitmap failed'), 300 * 1024 * 1024)).toBe(
      "Couldn't process this photo. Your phone has about 300 MB of storage free; freeing up space may help."
    );
  });

  it('uses a helpful neutral message when the failure cause is unknown', () => {
    expect(getPhotoProcessingErrorMessage(new Error('Loading bitmap failed'), 2 * 1024 ** 3)).toBe(
      "Couldn't load or process this photo. Check that it's available and try again. If this keeps happening, check your phone's free storage or try a smaller photo."
    );
  });
});
