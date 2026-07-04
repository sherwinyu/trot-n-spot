import { getTimeAgo, formatDuration, formatTimer } from '../format';

describe('getTimeAgo', () => {
  const now = new Date('2026-07-03T12:00:00Z').getTime();

  it('formats minutes', () => {
    expect(getTimeAgo('2026-07-03T11:35:00Z', now)).toBe('25m ago');
  });

  it('formats hours', () => {
    expect(getTimeAgo('2026-07-03T09:00:00Z', now)).toBe('3h ago');
  });

  it('formats days', () => {
    expect(getTimeAgo('2026-06-30T12:00:00Z', now)).toBe('3d ago');
  });

  it('clamps future timestamps to 0m (clock skew)', () => {
    expect(getTimeAgo('2026-07-03T12:01:00Z', now)).toBe('0m ago');
  });
});

describe('formatDuration', () => {
  it('formats minutes', () => {
    expect(formatDuration(45 * 60000)).toBe('45 min');
  });

  it('formats hours with singular/plural', () => {
    expect(formatDuration(60 * 60000)).toBe('1 hour');
    expect(formatDuration(4 * 3600000)).toBe('4 hours');
  });

  it('formats days with singular/plural', () => {
    expect(formatDuration(24 * 3600000)).toBe('1 day');
    expect(formatDuration(3 * 24 * 3600000)).toBe('3 days');
  });
});

describe('formatTimer', () => {
  it('pads seconds', () => {
    expect(formatTimer(65)).toBe('1:05');
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(600)).toBe('10:00');
  });
});
