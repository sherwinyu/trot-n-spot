import { clampImageTranslation, containedImageSize } from '../imageViewer';

it.each([
  [1200, 600, 400, 800, 400, 200],
  [600, 1200, 800, 400, 200, 400],
  [800, 800, 400, 800, 400, 400],
])('fits %sx%s into %sx%s without distorting it', (iw, ih, w, h, expectedW, expectedH) => {
  expect(containedImageSize(iw, ih, w, h)).toEqual({ width: expectedW, height: expectedH });
});

it('does not allow panning on a letterboxed axis even while zoomed', () => {
  expect(clampImageTranslation(100, 200, 800, 3)).toBe(0);
  expect(clampImageTranslation(-100, 200, 800, 3)).toBe(0);
});

it('clamps both edges while retaining translations inside the visible bounds', () => {
  expect(clampImageTranslation(999, 400, 400, 3)).toBe(400);
  expect(clampImageTranslation(-999, 400, 400, 3)).toBe(-400);
  expect(clampImageTranslation(50, 400, 400, 3)).toBe(50);
});
