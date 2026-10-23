export function containedImageSize(imageWidth: number, imageHeight: number, width: number, height: number) {
  const fit = Math.min(width / imageWidth, height / imageHeight);
  return { width: imageWidth * fit, height: imageHeight * fit };
}

export function clampImageTranslation(value: number, imageSize: number, viewportSize: number, scale: number) {
  'worklet';
  const limit = Math.max(0, (imageSize * scale - viewportSize) / 2);
  if (limit === 0) return 0;
  return Math.max(-limit, Math.min(limit, value));
}
