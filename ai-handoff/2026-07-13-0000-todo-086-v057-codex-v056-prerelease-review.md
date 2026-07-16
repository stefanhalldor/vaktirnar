# TODO 086 - v057 Codex review of v056 prerelease

Created: 2026-07-13 00:00  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Input reviewed: `ai-handoff/2026-07-12-2353-todo-086-v056-claude-v055-done-prerelease.md`  
Mode: prerelease review, no implementation changes except this review file

## Verdict

No release-blocking findings found in v056.

Claude Code addressed the v055 blockers:

- `sql/73_feature_access_elta_vedrid.sql` now has static tests.
- Elta veðrið copy now clearly says this is a selected forecast-station validation view, not all stations and not live observations/gusts.
- The admin feature-access API test now asserts that `?feature=elta-vedrid` inserts `feature_key: 'elta-vedrid'`.

This is ready for Stebbi/Claude Code to decide the next operational step. The important remaining release gate is not code: `sql/73_feature_access_elta_vedrid.sql` still has to be explicitly approved and run before admin grants for `ferdalagid` / `elta-vedrid` can work in the target database.

## Findings

### No P1/P2 Findings

I did not find an auth, RLS, migration, type-safety, API, or build issue that should block the prerelease patch.

### P3 - Optional Icelandic Copy Polish

`messages/is.json:872` says:

```text
Þetta eru spágögn, ekki nútímamælingar eða hviður...
```

This is understandable, but `nútímamælingar` reads a little like "modern measurements" rather than "current/live measurements." I would prefer one of these before release if Claude Code is doing one more small copy pass:

- `ekki númælingar eða hviður`
- `ekki rauntímamælingar eða hviður`

This is non-blocking.

## What Looks Good

- `app/auth-mvp/vedrid/elta-vedrid/page.tsx` requires both `vedrid` and `elta-vedrid`.
- `app/api/teskeid/weather/vedurstofan/stations/route.ts` also enforces both gates API-side.
- `WEATHER_ELTA_VEDRID_FLAG` fail-closes both the page path and API path.
- The station explorer API still fails open for Veðurstofan fetch failures by returning station metadata with unavailable statuses.
- `app/auth-mvp/vedrid/elta-vedrid/loading.tsx` exists and uses the canonical Teskeið loader.
- Migration 73 is written but not run.
- The wording now protects against the misunderstanding Stebbi flagged: this screen is not proving "all Veðurstofan stations" and it is not showing umferðin.is-style live gust observations.

## Files Reviewed

- `ai-handoff/2026-07-12-2353-todo-086-v056-claude-v055-done-prerelease.md`
- `lib/__tests__/sql-migration.test.ts`
- `lib/__tests__/feature-access-api.test.ts`
- `messages/is.json`
- `messages/en.json`
- `sql/73_feature_access_elta_vedrid.sql`
- `app/api/teskeid/weather/vedurstofan/stations/route.ts`
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/loading.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `lib/weather/providers/vedurstofanStationExplorer.ts`

## Commands Run

```bash
git status --short
git diff -- lib/__tests__/sql-migration.test.ts lib/__tests__/feature-access-api.test.ts messages/is.json messages/en.json
npm.cmd run test:run -- lib/__tests__/sql-migration.test.ts lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts
npm.cmd run type-check
npm.cmd run lint
npm.cmd run build
```

## Results

- Targeted tests: passed, 4 files, 274 tests.
- Type-check: passed.
- Lint: passed with existing warnings in:
  - `app/s/[sessionId]/page.tsx`
  - `components/landing/Avatar.tsx`
  - `components/weather/TravelAuditMap.tsx`
- Build: passed. New routes included in build output:
  - `/auth-mvp/vedrid/elta-vedrid`
  - `/api/teskeid/weather/vedurstofan/stations`

Git still warns:

```text
unable to access 'C:\Users\Lenovo/.config/git/ignore': Permission denied
```

This did not block the review or validation commands.

## Supabase / SQL Status

`sql/73_feature_access_elta_vedrid.sql` was written but not run.

Expected SQL effect if run:

- Drops and recreates `public.feature_access.feature_key` CHECK constraint.
- Allows `umonnun`, `tengsl`, `facebook-oauth`, `vedrid`, `ferdalagid`, `elta-vedrid`.
- Does not intentionally alter RLS, grants, auth, policies, functions, or data.

Release-order requirement:

1. Do not deploy/rely on admin grants for `ferdalagid` or `elta-vedrid` against a database where migration 73 has not been run.
2. Running migration 73 needs separate explicit Supabase approval from Stebbi.
3. After migration 73 is run, verify admin grant/revoke for `elta-vedrid` and the page/API access gates.

## Recommended Next Step

If Claude Code does one more tiny patch, only change the Icelandic wording from `nútímamælingar` to `númælingar` or `rauntímamælingar`.

Otherwise, the next substantive step is operational, not code: Stebbi decides whether to approve running `sql/73_feature_access_elta_vedrid.sql` in the intended Supabase environment. Codex does not recommend running it casually from this review thread.

## Localhost Checks For Stebbi

Prereqs:

- Stebbi runs the dev server locally.
- `.env.local` has `AUTH_MVP_ENABLED=true`, `WEATHER_ENABLED=true`, and `WEATHER_ELTA_VEDRID_FLAG=true`.
- If `WEATHER_FLAG=true`, the test user needs `vedrid` in `feature_access`.
- The test user also needs `elta-vedrid` in `feature_access`; granting this through admin requires migration 73 to be run first.

Checks:

1. User with `vedrid` only: open `/auth-mvp/vedrid/elta-vedrid`. Expected: no access.
2. User with `elta-vedrid` only: open `/auth-mvp/vedrid/elta-vedrid`. Expected: no access.
3. User with both gates: open `/auth-mvp/vedrid/elta-vedrid`. Expected: map/list loads.
4. Turn `WEATHER_ELTA_VEDRID_FLAG=false` locally and reload. Expected: API 404 / page no access.
5. Confirm visible copy says selected forecast stations and does not imply all stations or live gust observations.
6. Regression check: `/auth-mvp/vedrid` still loads and existing route-weather flow works.
7. After separate migration approval/run only: test `/admin` grant/revoke for `elta-vedrid`.

Do not test admin grant/revoke for `elta-vedrid` or `ferdalagid` against a database where migration 73 has not been run, except deliberately to confirm the old CHECK constraint rejects it.

## Óvissa / þarf að staðfesta

- I did not run or inspect Supabase directly.
- I did not use a browser or localhost UI; Stebbi should perform the localhost checks above.
- I treated the existing dirty/untracked files outside this v056 scope as pre-existing work and did not modify or revert them.

