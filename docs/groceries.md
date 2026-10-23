# Groceries in Trot n Spot

Implements [SHE-103](https://linear.app/sherwin/issue/SHE-103/build-berkeley-bowl-receipt-tracker-scan-receipts-personal-grocery) as the Groceries tab, with Explore, Scan, Receipts, receipt editing, and product history.

## Storage and identity

Receipts use **the same Supabase project and Auth users as Trot n Spot**:

- Postgres: `groceries.receipts`, `receipt_line_items`, `extraction_attempts`, and `jobs`.
- Storage: private `grocery-receipts` bucket; originals are keyed by `<user-id>/<receipt-id>/<sha256>`. Original bytes are preserved; JPEG previews are stored alongside them.
- Auth: the app gets its current Supabase session for every API request. The API validates that token against the project's Auth server with `getUser(token)`. There is no receipt vault token or second sign-in.
- Isolation: RLS on all four tables. API queries run as a non-login `receipts_api` role with transaction-local verified user claims. Claims, role, and schema settings reset after every transaction, including failures. The worker uses the privileged database connection to process jobs across users.
- Clients have read-only table grants and owner-only Storage reads. They cannot write extracted fields, jobs, or original objects directly. The `groceries` schema does not need to be added to the exposed Data API schemas.
- Pack membership does not grant access to grocery receipts.

The Node API and extraction worker still need to run somewhere. Supabase replaces the separate database, local image volume, and S3 configuration; this change does not move processing into Edge Functions. The worker retains the existing durable queue, leases, retries, and late-result fencing, and continues processing after the phone closes.

## Setup

1. Apply the new `groceries_supabase_store` migration through Trot n Spot's normal Supabase migration workflow. For a linked project, review the pending migrations before `npx supabase db push`. This creates the tables, restricted API role, private bucket, and policies. **Do not run migrations automatically when starting the API.** The PR does not apply migrations to the hosted project.
2. Run `npm run receipts:setup`. It creates `services/receipts/.env` without overwriting an existing file. Fill in:

| Server variable             | Value                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_URL`              | Same project URL as the app                                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY` | Project service-role key; server only, used for Auth validation and private Storage                                                  |
| `DATABASE_URL`              | Supabase Postgres connection string for the `postgres` login, with TLS; use the **Session pooler** URI from Connect for an IPv4 host |
| `OPENAI_API_KEY`            | Server-only extraction key                                                                                                           |
| `OPENAI_MODEL`              | Optional; defaults to `gpt-4.1-mini`                                                                                                 |
| `PORT`                      | Optional; defaults to `3001`                                                                                                         |
| `CORS_ORIGINS`              | Comma-separated web app origins; local defaults are ports 8081 and 8082                                                              |

3. Start the API and worker with `npm run receipts:up` on a Docker host. Compose starts only those two processes; there is no second Postgres container or image volume. Alternatively run the service `dev` and `worker` scripts in separate terminals. The database login must be able to `SET ROLE receipts_api`; the migration grants this to `postgres`.
4. Set `EXPO_PUBLIC_RECEIPTS_API_URL` to the API's HTTPS URL when building the app. The Groceries tab then connects automatically with the existing Trot n Spot sign-in. Without that variable, enter the API URL under Groceries → Connection. No token field is shown.

The existing app variables remain `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and the release login flags. Never expose database credentials, the service-role key, or the OpenAI key through `EXPO_PUBLIC_*`.

For local development, point both app and service at the same local Supabase instance. A phone needs the API host's LAN address; Android emulator uses `http://10.0.2.2:3001`. `localhost` on the phone means the phone itself. A Docker container must use a Supabase address reachable from inside that container, not its own loopback address.

Connection references: [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

## Capture and processing

Use Scan to take a photo, select multiple library images, or import image files. Confirm them and save. Pending originals remain in an account-scoped on-device upload queue until accepted by the API. Uploads preserve UUIDs across retries and restarts. Stay in the app until uploads finish; this does not implement OS background uploading. After acceptance, the worker owns processing.

Sign-out or account changes stop that account's pending requests and queue drain; queued originals remain for that user to resume later. Every request checks that the Supabase session still belongs to the feature's user before sending bytes. Tokens are read fresh so refreshes work without reconnecting. Backend addresses and queued metadata remain per-user; the UI retains no separate receipt credential.

Images are displayed via five-minute signed URLs issued only after an owner-scoped receipt lookup; open receipt views renew them every four minutes. A copied signed URL works until expiry, so treat it as a temporary bearer link. The authenticated original-image endpoint still returns the exact original bytes.

Originals, raw model output, and edit history are retained. Integer-cent reconciliation tolerates a two-cent difference; uncertain receipts remain visible in best-effort analytics. Analytics use USD, convert known produce weights, and group product identities by merchant, code or printed description, and unit.

## Existing standalone data

The earlier standalone Bowl Pocket database is **not automatically imported**. This Supabase schema requires an explicit owner for every receipt. Do not point the new server at the old database or assume old tokens still work. Any real standalone data would need an explicit import that assigns its owner and copies originals into the private bucket. No such live data was accessed or migrated in this change. Old app-token values are ignored; the app now only uses Supabase sessions.

## Verification

```bash
npm run typecheck
npm run receipts:typecheck
npx jest --ci --runInBand
npm run receipts:test

EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 \
EXPO_PUBLIC_SUPABASE_ANON_KEY=local-test-anon-key \
npx expo export --platform web
npm run groceries:test-ui

npx expo export --platform android --platform ios --output-dir test-results/native-export
```

Service tests apply the real receipt migration to embedded Postgres with minimal Supabase Auth/Storage schema stand-ins. They exercise owner RLS, denied owner reassignment, read-only client grants, private Storage policies, cross-account receipt/image/history/edit/reprocess denial, and the existing extraction/retry/reconciliation flows. Auth and Storage adapter tests use the real Supabase SDK against fake HTTP responses; no production credentials or model calls are used.

The browser smoke test uses the real app/router/API and embedded Postgres with test Auth/Storage/vision adapters. It verifies sample data, import, interrupted-upload recovery, editing, analytics, navigation, and connecting a second user to the same backend without seeing the first user's receipts. Screenshots go to `test-results/groceries`. An existing Chromium can be selected with `BROWSER_EXECUTABLE_PATH`.

Hosted migration, live Supabase Storage/Auth, real model extraction, physical camera permissions, and a signed phone build require deployment/device validation. The Berkeley Bowl reference image was unavailable; fixtures are explicitly synthetic.
