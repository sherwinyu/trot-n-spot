# Run Verification

Verified on 2026-07-03 in a cloud sandbox:

- `npm install` completes cleanly
- `npx tsc --noEmit` passes with no type errors
- `npx expo start --web` bundles and serves the app; login screen renders correctly in a headless browser, dev-login form pre-filled as documented in AGENTS.md
- Sign-in attempt fails gracefully ("Failed to fetch") when no backend is reachable, with no crash

Not verified in this sandbox (network policy blocks Docker registry pulls):

- Local Supabase stack (`supabase start`)
- Android emulator / Maestro E2E flows
