# Groceries in Trot n Spot

Implements [SHE-103](https://linear.app/sherwin/issue/SHE-103/build-berkeley-bowl-receipt-tracker-scan-receipts-personal-grocery) as a **Groceries** tab beside Quests, Create, History, and Profile. The tab has Explore, Scan, and Receipts views, with inline receipt/product details. It uses the existing Expo SDK 55, app identity, auth gate, pack onboarding, and outer navigation.

## Try it

1. Run Trot n Spot normally, sign in, and open **Groceries**.
2. Choose **Explore with sample data** to preview immediately, or connect a receipt backend below.
3. Use **Scan** for camera capture, multiple photo-library images, or image files. Confirm the photos and save them. After upload completes, the server reads receipts independently of the phone.

The sample data is synthetic and never sent to the server. The receipt tracker retains its own backend connection; Trot n Spot's Supabase project continues to handle quests and identity. **This change does not deploy the receipt backend or migrate receipts into Supabase.**

## Start the included receipt backend

From the repository root:

```bash
npm ci
npm run receipts:setup
# Add OPENAI_API_KEY to services/receipts/.env
npm run receipts:up
```

This starts a separate Postgres database, migrations, authenticated API, and asynchronous extraction worker using Docker Compose. Original images use a persistent volume by default. Both API and worker can instead use an existing private S3-compatible bucket via `STORAGE_DRIVER=s3` and the S3/AWS settings in the service environment file.

In the Groceries connection screen, enter:

- Server address: `http://YOUR_COMPUTER_LAN_IP:3001` for a phone on the same Wi-Fi; `http://10.0.2.2:3001` for the Android emulator; `http://localhost:3001` for web/iOS simulator. Use HTTPS for a remote server and standalone phone builds.
- App access token: the generated `APP_TOKEN` in `services/receipts/.env`. The vision API key stays on the server.

`EXPO_PUBLIC_RECEIPTS_API_URL` can set the default address at build time. Do not put tokens or vision keys in public environment variables. For hosted web, include its exact origin in the service's `CORS_ORIGINS`.

If you already deployed the standalone Bowl Pocket API from the earlier implementation, connect its URL/token here; the API contract is unchanged. Existing server data remains usable. Local-only queues from the separate app are not automatically imported.

## Account boundaries and lifecycle

- The tab is behind Trot n Spot's normal sign-in/pack gate. It does not share receipt data with packmates.
- Backend URL, receipt token, and upload queue are namespaced by the current Supabase user ID. Native credentials use SecureStore; web credentials use session storage.
- Native queued images are copied to `receipts/<user-id>/` within app documents. Web uses IndexedDB. Receipt IDs remain stable across upload retries and app restarts.
- Account changes remount the feature, clearing rendered receipt and preview state. Sign-out aborts in-flight API requests and stops that account's queue from draining. Its pending images remain available when the same user returns.
- Receipt polling pauses when another Trot n Spot tab is focused; Android back handling is active only while Groceries is focused. Uploads already in progress can continue when switching tabs while signed in.
- Keep the app open until uploads finish. This feature does not claim native OS background uploading. Once accepted by the server, extraction continues even after the app closes.
- A receipt backend is a single private vault identified by its app token. Two people deliberately entering the same backend token share that vault. This is independent of Trot n Spot pack membership.

## Source layout

| Path                       | Role                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `app/(tabs)/groceries.tsx` | Auth-aware route; remounts on account change                      |
| `features/groceries/`      | Receipt UI, per-user connection, upload queue, runtime context    |
| `packages/receipt-model/`  | Shared Zod contracts, types, integer-cent reconciliation          |
| `services/receipts/`       | Postgres API, image storage, extraction worker, migrations, tests |
| `e2e/groceries-smoke.mts`  | Full-app browser navigation and receipt-flow check                |

The root npm workspace includes the shared contract and server. Trot n Spot's app is still the repository root; no second Expo application or standalone app navigation is included.

The backend preserves original image bytes and raw model/edit history. It uses idempotent uploads, transactional line replacement, worker leases with late-result fencing, three attempts with backoff, and a two-cent reconciliation tolerance. Printed line amounts are net of line discounts; receipt-level discounts are additional. Review receipts remain in best-effort analytics with an explicit caveat. Analytics currently use USD and separate product groups by merchant, candidate merchant code (or printed description), and unit.

## Verification commands

```bash
npm run typecheck
npm run receipts:typecheck
npx jest --ci --runInBand
npm run receipts:test

# Browser test against local in-process test adapters, never production Supabase:
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 \
EXPO_PUBLIC_SUPABASE_ANON_KEY=local-test-anon-key \
npx expo export --platform web
npx playwright install chromium
npm run groceries:test-ui

# Native JS/Hermes compilation:
npx expo export --platform android --platform ios --output-dir test-results/native-export
```

The browser smoke test uses the actual Trot n Spot app/router and receipt API with embedded Postgres. Supabase auth/profile responses, image storage, and the vision response are test adapters. It exercises the new tab, sample data, file import, interrupted-upload recovery across reload, receipt editing, analytics, navigation back to Quests/History, and isolation after switching accounts. Screenshots go to `test-results/groceries/`. An existing Chromium can be selected with `BROWSER_EXECUTABLE_PATH`.

Physical camera permissions, a signed phone build, live model extraction, Docker startup, and a live S3 bucket still require environment/device validation. The reference Berkeley Bowl image was unavailable; test receipts are synthetic. The additional document-picker native module and updated permission strings require a new development/preview binary when using a custom dev client rather than Expo Go.
