# Dudley moments

Approved scope: all four existing Dudley animations, plus a visible quest-detail
Back button with a quest-feed fallback when navigation history is unavailable.

## Placement

| Moment | Behavior |
| --- | --- |
| Quest detail / first feed fetch | Trot, after 200 ms of actual loading; stop immediately on completion |
| Feed refresh | Compact sniff; leave cached quests and offline/status messages visible |
| Confirmed quest completion | In-app success panel, two wiggles (1.12 seconds), immediate Back to quests action |
| Offline completion | Still Dudley, “Saved on this device”, explicitly waiting for confirmation on sync |
| Empty quests | Still napping dog, Create a quest action; only after a successful fetch, not during load/error/offline |
| Walk | Brief trot after a confirmed start; one breathing cycle after a confirmed end; initial fetch stays still |
| Receipt processing | Compact sniff only for `processing`; existing queue/review/error statuses remain authoritative |
| Boop | Optional accessible button on empty/completion/walk mascots; one wiggle and short caption |
| Quest navigation | Persistent 44-point Back target during loading, missing quest, detail, and completion; history or feed fallback |

The OS splash, loading durations, backend contracts, photo/location handling,
offline queue and native device permissions are unchanged.

## Rendering

`components/dudley/Dudley.tsx` uses the existing `expo-image` dependency and
bundled transparent WebP loops. PNG stills are used before accessibility settings
resolve, for Reduce Motion, in background tabs/apps, and when navigation focus
is lost. Finite celebrations expire even while backgrounded, so returning to a
tab does not replay a past success. Continuous loops are limited to real waits.

`WalkDudley` responds to the confirmed journey ID, not the button tap; an initial
journey fetch does not trigger a new-walk animation. Existing walk actions are
disabled while a change is pending. Profile content scrolls on smaller screens.

Source art: user-approved, image-generated Dudley concepts based on the earlier
“Dudley’s Stinky Cutie Pie Exhibit” reference. Four cels per loop; 384 × 256 px.
Timings: trot 480 ms, sniff 1,000 ms, wiggle 560 ms, nap 2,800 ms. Keep the
on-screen artwork small; these are illustrated cel loops, not vector rigs.

## Verification

`tests/components/dudley.test.tsx` covers motion preference races, focus and
background changes, finite animation expiry, booping, delayed loading without
artificial waits, Back navigation fallback, offline acknowledgement, immediate
success navigation, and confirmed walk transitions.

Run `npx tsc --noEmit` and `npm test -- --ci --runInBand`. Visual evidence and
runtime limitations belong in the PR's Evidence section. Browser fixtures do
not verify camera/GPS, device-specific rendering, or the real backend.

### Reproduce browser evidence

With Playwright Chromium installed, run from the repository root:

```sh
source scripts/env.sh
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 \
EXPO_PUBLIC_SUPABASE_ANON_KEY=fixture-anon-key \
EXPO_PUBLIC_ENABLE_EMAIL_LOGIN=true \
npx expo export --clear --platform web --output-dir dist
DUDLEY_WEB_BUILD=dist node e2e/dudley-smoke.cjs
```

Set `BROWSER_EXECUTABLE_PATH` to use an existing Chromium installation. The
script intercepts network requests, supplies fixture auth and backend responses,
and captures `docs/evidence/dudley/`. It checks empty quests/boop, confirmed walk
transitions, quest loading/detail navigation controls, confirmed and offline
completion, and reduced-motion rendering. Receipt processing and feed refresh
are not covered by this browser script.
