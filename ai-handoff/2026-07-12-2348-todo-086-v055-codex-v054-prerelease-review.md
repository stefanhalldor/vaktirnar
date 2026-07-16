# TODO 086 - v055 Codex review of v054 prerelease

Created: 2026-07-12 23:48 Atlantic/Reykjavik  
Author: Codex  
Input reviewed: `ai-handoff/2026-07-12-2302-todo-086-v054-claude-v053-done-prerelease.md`  
Mode: prerelease review, no implementation changes except this review file

## Verdict

v054 is directionally good and fixes the main v053 access-control concern: the Elta veðrið page and API now require both `vedrid` and `elta-vedrid`, and the new view is behind `WEATHER_ELTA_VEDRID_FLAG`.

I would not call it release-ready yet. There are two small but important fixes before commit/release, plus one release-order guardrail around the SQL migration.

## Findings

### P1 - Missing static tests for migration 73

`sql/73_feature_access_elta_vedrid.sql:17`-`22` widens the `feature_access_feature_key_check` constraint, but `lib/__tests__/sql-migration.test.ts` has no static test block for migration 73. The current SQL migration tests only cover earlier feature-access migrations such as `sql/68_feature_access_vedrid.sql`.

This was part of the v053 expectation: if Claude writes the migration file, it should also add static tests for that migration. Add a `sql73` test block that checks:

- migration wraps in `BEGIN`/`COMMIT`
- it drops `feature_access_feature_key_check` before adding it
- the new CHECK allows exactly `umonnun`, `tengsl`, `facebook-oauth`, `vedrid`, `ferdalagid`, `elta-vedrid`
- it does not touch grants, RLS, auth, or data (`GRANT`, `REVOKE`, `ENABLE ROW LEVEL SECURITY`, `INSERT`, `UPDATE`, `DELETE`)

Then run:

```bash
npm.cmd run test:run -- lib/__tests__/sql-migration.test.ts
```

### P2 - UI text still implies all/current Veðurstofan stations too strongly

The view still says:

- `messages/is.json:872`: `Veðurstofustöðvar til sannprófunar...`
- `messages/is.json:877`: `{count} stöðvar`

But the API uses the curated local list from `VEDURSTOFAN_STATIONS`:

- `lib/weather/providers/vedurstofanStations.ts:54`
- `app/api/teskeid/weather/vedurstofan/stations/route.ts:32`

And it fetches forecast rows from the `type=forec` endpoint:

- `app/api/teskeid/weather/vedurstofan/stations/route.ts:35`
- `lib/weather/providers/vedurstofanStationExplorer.ts:12`-`13`

Given Stebbi's explicit concern about “bara 29 veðurstöðvar” and why umferðin.is shows current gusts, the UI should not leave room for interpreting this as all Veðurstofan stations or live observations. Make the copy explicit, for example:

- IS subtitle: `Valdar Veðurstofu-/Vegagerðar-spástöðvar til sannprófunar. Þetta eru spágögn, ekki númælingar/hviður, og hafa ekki áhrif á ferðamat enn.`
- IS count: `{count} valdar stöðvar`
- EN equivalent: `Selected Veðurstofan/Vegagerðin forecast stations for validation. These are forecast rows, not live observations/gusts, and do not affect route results yet.`

This keeps the tool future-proof while preventing the validation screen from accidentally overstating what the data proves.

### P2 - Release order: admin grant UI can fail until migration 73 is run

`app/api/admin/feature-access/route.ts:7` and `app/(admin)/admin/page.tsx:1538`-`1546` expose `ferdalagid` and `elta-vedrid` in admin feature access. Until `sql/73_feature_access_elta_vedrid.sql` is run in the target Supabase database, POSTing either new feature key can fail against the old CHECK constraint.

This is acceptable during prerelease because SQL was only written, not run. But before deployment/release, choose an explicit sequence:

1. Review and commit the migration file with tests.
2. Get separate Stebbi approval to run migration 73 in the target DB.
3. Only then deploy or rely on admin UI grants for `ferdalagid` / `elta-vedrid`.

Do not run the SQL from Claude/Codex without explicit Supabase approval.

### P3 - Feature-access API test for distinct keys is weak

`lib/__tests__/feature-access-api.test.ts:238`-`250` says it verifies that `vedrid` and `elta-vedrid` are distinct, but the current mock does not capture the inserted payload from `.insert({ feature_key, email })`. It only verifies both requests return `201`.

Not a blocker for this prerelease, because the route implementation is simple and visible at `app/api/admin/feature-access/route.ts:55`-`57`, but it would be better to enhance the mock so the test asserts that the POST with `?feature=elta-vedrid` inserts `feature_key: 'elta-vedrid'`.

## What Looks Good

- `app/auth-mvp/vedrid/elta-vedrid/page.tsx:6`-`8` requires authenticated session, `vedrid`, and `elta-vedrid`.
- `app/api/teskeid/weather/vedurstofan/stations/route.ts:10`-`18` fail-closes on disabled auth/weather/Elta flag.
- `app/api/teskeid/weather/vedurstofan/stations/route.ts:26`-`29` requires both `vedrid` and `elta-vedrid` API-side, so this is not just page-gated.
- `app/api/teskeid/weather/vedurstofan/stations/route.ts:34`-`38` fails open for Veðurstofan fetch errors by returning station metadata with unavailable statuses.
- `app/auth-mvp/vedrid/elta-vedrid/loading.tsx` exists and uses the canonical Teskeið loader.
- v048 i18n issue is fixed: table headers and parse-error summary now use `messages/is.json` and `messages/en.json`.

## Files Reviewed

- `.env.example`
- `app/(admin)/admin/page.tsx`
- `app/api/admin/feature-access/route.ts`
- `app/api/teskeid/weather/vedurstofan/stations/route.ts`
- `app/auth-mvp/vedrid/page.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/loading.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `lib/loans/guard.ts`
- `lib/weather/providers/vedurstofanStationExplorer.ts`
- `lib/weather/providers/vedurstofanStations.ts`
- `lib/__tests__/feature-access-api.test.ts`
- `lib/__tests__/guard.test.ts`
- `lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts`
- `lib/__tests__/sql-migration.test.ts`
- `messages/is.json`
- `messages/en.json`
- `sql/73_feature_access_elta_vedrid.sql`

## Commands Run

```bash
git diff -- lib/loans/guard.ts app/api/admin/feature-access/route.ts "app/(admin)/admin/page.tsx" .env.example messages/is.json messages/en.json lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts
git status --short
git diff --stat
rg -n "73_feature_access|ferdalagid|elta-vedrid|feature_access_feature_key_check" lib/__tests__/sql-migration.test.ts sql
npm.cmd run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/weather-vedurstofan-server.test.ts lib/__tests__/sql-migration.test.ts
npm.cmd run type-check
npm.cmd run lint
npm.cmd run build
```

## Results

- Targeted tests: passed, 5 files, 293 tests.
- Type-check: passed.
- Lint: passed with existing warnings in:
  - `app/s/[sessionId]/page.tsx`
  - `components/landing/Avatar.tsx`
  - `components/weather/TravelAuditMap.tsx`
- Build: passed. New routes included in build output:
  - `/auth-mvp/vedrid/elta-vedrid`
  - `/api/teskeid/weather/vedurstofan/stations`

Git warning still appears:

```text
unable to access 'C:\Users\Lenovo/.config/git/ignore': Permission denied
```

This did not block review or tests.

## Supabase / SQL Status

`sql/73_feature_access_elta_vedrid.sql` was written but not run.

Observed SQL effect if run:

- Drops and recreates `public.feature_access.feature_key` CHECK constraint.
- Adds allowed values `ferdalagid` and `elta-vedrid`.
- Does not add grants.
- Does not change RLS.
- Does not change auth.
- Does not insert/update/delete data.

Production/DB risk is mostly sequencing: admin UI/API will accept these feature keys in app code, but the database will reject inserts until migration 73 is run.

## Recommended Next Step For Claude Code

Copy/paste direction:

```text
Claude Code: Please patch v054, but do not run SQL, commit, push, or deploy.

1. Add static tests for sql/73_feature_access_elta_vedrid.sql in lib/__tests__/sql-migration.test.ts, matching the existing sql/68 feature-access test style.
2. Update Elta veðrið UI copy in messages/is.json and messages/en.json so the screen clearly says these are selected/curated forecast stations, not all Veðurstofan stations and not live observations/gusts.
3. Optionally strengthen lib/__tests__/feature-access-api.test.ts so the elta-vedrid POST test asserts that the inserted feature_key is exactly "elta-vedrid".
4. Run:
   npm.cmd run test:run -- lib/__tests__/sql-migration.test.ts lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts
   npm.cmd run type-check
   npm.cmd run lint
   npm.cmd run build
5. Return a new prerelease handoff. Explicitly state again that sql/73 was not run.
```

## Localhost Checks For Stebbi

Do these after Claude patches the above wording/tests and after you have decided how to handle migration 73.

Prereqs:

- Stebbi runs the dev server locally.
- `.env.local` has `AUTH_MVP_ENABLED=true`, `WEATHER_ENABLED=true`, and `WEATHER_ELTA_VEDRID_FLAG=true`.
- If `WEATHER_FLAG=true`, the test user must have `vedrid`.
- The test user must also have `elta-vedrid`, but granting that through admin requires migration 73 to be run first.

Checks:

1. Open `/auth-mvp/vedrid/elta-vedrid` as a user without `elta-vedrid`. Expected: no access; page redirects away or API returns 404.
2. Open the same URL as a user with both `vedrid` and `elta-vedrid`. Expected: the validation map/list loads.
3. Confirm the visible copy says this is a selected/curated forecast-station validation view, not all stations and not live gust observations.
4. Turn `WEATHER_ELTA_VEDRID_FLAG` off locally and reload. Expected: no access.
5. After explicit migration approval and DB run only: use `/admin` to grant/revoke `elta-vedrid` and confirm the page access follows that grant.
6. Regression check: `/auth-mvp/vedrid` still loads for a normal `vedrid` user and normal route-weather behavior is unchanged.

Do not test admin grant/revoke for `elta-vedrid` or `ferdalagid` against a database where migration 73 has not been run, except if you are deliberately confirming that the old CHECK constraint rejects it.

