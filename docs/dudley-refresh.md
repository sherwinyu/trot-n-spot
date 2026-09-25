# Dudley pull-to-refresh

## Approved behavior

User request: “as you pull further he slides down more — maybe his eyes get
wider … the release is like him popping up and over … as it's loading he'll
shake.” Start from current main, preserving the recently merged Dudley behavior.

- Pull at the top of Quests, History, or Groceries Explore/Receipts: the list makes room for
  Dudley's face. Increasing pull distance raises him up out from behind the list
  edge (he climbs upward and grows slightly while the list slides down, rather
  than being uncovered in place) and changes his expression from curious to
  alert to wide-eyed. Reversing the pull reverses it.
- Release at 96 points of resisted travel (160 points of finger travel): start
  the existing refresh immediately, pop up with a little overshoot, then shake
  with four alternating head/ear poses. One request per gesture.
- Release below the threshold, lose the gesture, or navigate away mid-pull:
  settle without a refresh. Horizontal gestures, multiple fingers, form fields,
  and gestures begun below the top do not initiate a refresh.
  Groceries editing/capture/settings screens offer button refresh only, so even
  an unfocused native text field keeps its editing gestures.
- Finish or fail: retract. Preserve the caller's cached data and status messages.
  Unhandled refresh errors also show a retry message. The feed retains main's
  existing two-second minimum from `usePullRefresh`; no new minimum is introduced
  for History or Groceries.
- Reduce Motion uses a single static pose with finger-controlled reveal and no
  pop/shake. Animation stops when unfocused or backgrounded. A visible 44-point
  Refresh button offers keyboard/screen-reader access without a drag.

## Implementation

`DudleyRefresh` supplies scroll props to the existing FlatList/ScrollView, and
the list itself owns the gesture on native, so a standard pull from anywhere on
the list works: iOS follows the list's own bounce (`contentOffset.y < 0`) and
refreshes on release past the threshold; Android has no over-scroll, so a
pull that starts with the list at its top is claimed by a capture
`PanResponder` (2px slop, ahead of the list's own) and Dudley follows the
touch distance from the first frame, with an invisible `RefreshControl` as a
fallback if the native scroll wins the gesture. Web uses non-passive touch handling
only for eligible pulls and also supports mouse dragging. Ordinary scrolling and
list virtualization remain in place. All Dudley animations run on the JS driver,
since the pop transform shares nodes with the layout-driven reveal height.
The async state and gesture eligibility live in `hooks/useDudleyRefresh.ts`.
No new package or native configuration is required.

`components/dudley/assets/peek-sniff.webp` is a transparent 1024 × 512 atlas,
eight 256 × 256 cells (four columns/two rows): curious, alert, wide-eyed, pop,
shake left, center, right, center. The atlas is decoded once and clipped to one
cell; an animated transform adds the release overshoot. Shake advances at 90 ms
per cel. Bundled art has no network dependency.

## Artwork provenance and generation prompt

Created with the built-in image-generation tool using the user-selected “Peek &
sniff” concept as the character/style reference. The output was packaged into
uniform cells, with transparent padding and detached neighboring-cell fragments
removed; no character poses were redrawn in code.

Prompt: “Create a production animation sprite atlas for the approved Peek & sniff
Dudley character. Wide 2:1 canvas, exactly four equal columns by two equal rows.
Transparent alpha background; no grid, text, labels, background, card, ledge,
floor or shadows. Each cell contains one front-facing bust of a tan-and-white
pitbull with broad white muzzle, central blaze, floppy ears, black collar, blue
round tag and two front paws. Same scale, paw baseline and centered position.
Clean dark outline, warm tan shading. First row: relaxed curious small smile;
alert with lifted brows and bigger eyes; comically wide excited eyes and perked
ears; delighted open-mouth smile, tongue visible, pop-up pose. Bottom row:
happy closed eyes, head tilts left 12 degrees, ears swing; centered happy squint,
ears bounce; head tilts right 12 degrees, ears flop; centered closed-eye smile,
ears settle. Paws stay planted. No overlap or motion lines. Real transparency.”

## Verification

- `npx tsc --noEmit`
- `npm test -- --ci --runInBand`
- Export with the fixture variables in `docs/dudley.md`, then run
  `DUDLEY_REFRESH_ONLY=1 DUDLEY_WEB_BUILD=dist node e2e/dudley-smoke.cjs`.
- Optionally set `DUDLEY_ANIMATION_FRAMES` to capture the real interaction for a
  GIF; set `BROWSER_EXECUTABLE_PATH` for an installed Chromium executable.
- Browser evidence in `docs/evidence/dudley-refresh/` covers partial pull, wide
  eyes, pop, shake, reduced motion, History and Groceries; `rise-demo.gif` is
  the captured pull/pop/shake interaction (`peek-sniff-demo.gif` is the earlier
  uncover-in-place version). The script also checks
  backoff, touch cancellation, no accidental card navigation, duplicate refresh,
  scrolling away from the top, failure/retry, and setup mode without refresh.
- Hook tests cover threshold/backoff, request lifetime, gesture filtering,
  cancellation/blur, reduced motion, failed requests, fast responses, unmount,
  disabled state and callback freshness.

Native list bounce/RefreshControl behavior and VoiceOver/TalkBack need device
verification. This environment has no Android emulator or iOS simulator. Browser
fixtures do not validate live backend, camera, GPS or actual offline sync.

Base: `59d5bf4381f5fdc866a19a74f9457ed5a5fc31dd` (main, including PRs #14, #18 and #19).
Linear currently returns “This app connection requires reauthentication”; the
requested “App ux improvements” ticket cannot yet be confirmed or updated here.
