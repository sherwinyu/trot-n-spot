import { feedStatusMessage } from '../feedStatus';

const NOW = 1_700_000_000_000;
const TWO_HOURS_AGO = NOW - 2 * 60 * 60 * 1000;

describe('feedStatusMessage', () => {
  it('hides once the current session has fetched successfully', () => {
    expect(feedStatusMessage('fresh', NOW, true, NOW)).toBeNull();
  });

  it('shows the cache age with the outcome of the last attempt', () => {
    expect(feedStatusMessage('offline', TWO_HOURS_AGO, false, NOW)).toBe('Offline · Updated 2h ago');
    expect(feedStatusMessage('error', TWO_HOURS_AGO, true, NOW)).toBe('Couldn’t refresh · Updated 2h ago');
    expect(feedStatusMessage('fetching', TWO_HOURS_AGO, true, NOW)).toBe('Updated 2h ago · Refreshing…');
  });

  it('explains an empty offline feed', () => {
    expect(feedStatusMessage('offline', null, false, NOW)).toBe('Offline · no saved quests yet');
    expect(feedStatusMessage('idle', null, false, NOW)).toBe('Offline · no saved quests yet');
    expect(feedStatusMessage('fetching', null, true, NOW)).toBe('Loading quests…');
  });
});
