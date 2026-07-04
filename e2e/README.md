# Testing

Three layers, in order of feedback speed:

## 1. Unit tests (anywhere)

```bash
npx jest
```

Covers the offline mutation queue, formatters, and the location-privacy
column list.

## 2. DB tests (anywhere with Postgres — no Docker needed)

```bash
scripts/db-test.sh        # PGHOST/PGPORT/PGUSER env-overridable
```

Creates a throwaway `quest_test` database, applies
`supabase/tests/supabase-shim.sql` (a stand-in for the Supabase-managed
auth/storage schemas), all migrations, and seed data, then runs
`supabase/tests/db-tests.sql`: RLS isolation, pair_with_partner,
complete_quest, storage folder policies, and push-trigger resilience.

## 3. Browser E2E (anywhere with Chromium)

```bash
node e2e/run-e2e.js       # E2E_VERBOSE=1 for Metro logs
```

Boots `e2e/mock-supabase.js` — a thin HTTP emulation of the Supabase
API (auth password grant, PostgREST subset, storage upload/signed URLs)
that executes every data operation against the real Postgres **as the
authenticated role with RLS active** — plus Expo web, then drives the
real UI in Chromium through the full two-user story: sign in → walk →
create quest with photo → location visible to creator only → partner
completes with photo → history with time-to-find. Screenshots land in
`e2e/screenshots/`.

If Docker is available you can run the same flows against genuine local
Supabase instead: `npx supabase start` + `.env` from its printed keys.

## On-device (macOS with emulator/device — see AGENTS.md)

```bash
maestro test .maestro/full-smoke.yaml
```

What can only be verified on real hardware:
- Camera capture (web E2E uses the file picker fallback)
- GPS capture on native (web E2E uses browser geolocation)
- Push notification delivery end-to-end (needs a physical device +
  deployed edge function + `app_config` rows pointing at it)
- Cold-start deep link from a notification tap
