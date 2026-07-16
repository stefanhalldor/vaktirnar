# 2026-07-15 17:54 — TODO-086 v238 — Codex review of v237 release master handoff

Source reviewed:

- `ai-handoff/2026-07-15-1800-todo-086-v237-release-master-handoff.md`

This is a release-gate review before asking Claude Code to deploy/push the v226-v233 weather release.

## Findings

### BLOCKER — v237 treats SQL75 as graceful fallback, but current code makes it a hard dependency for refresh

v237 says SQL75 can fail and cron will still work without run-state (`ai-handoff/2026-07-15-1800-todo-086-v237-release-master-handoff.md:288`, `:307`). That does not match the current code.

In `app/api/cron/warm-vedurstofan/route.ts:37-39`, cron inserts a running row before warming. If `insertVedurstofanRunningRow()` returns `null`, the route returns `{ skipped: 'running' }` and does **not** call the warm/projector logic.

In `lib/weather/providers/vedurstofan.server.ts:961-985`, `insertVedurstofanRunningRow()` inserts SQL75 columns such as `status`, `triggered_by`, `trigger_reason`, and `expected_atime`. If SQL75 is missing, that insert can fail and is caught as `null`.

Impact:

- If SQL75 is not present in production, `/api/cron/warm-vedurstofan` can appear to succeed/skip while not refreshing Veðurstofan data.
- Manual refresh can hit the same dependency pattern.
- This would be especially confusing because the UI is designed around freshness/run-state.

Required correction before release:

- Treat SQL75 as a hard pre-deploy dependency, not graceful fallback.
- Update v237 wording in "Ef eitthvað fer úrskeiðis" and the risk table.
- Add a production preflight that verifies SQL75 columns exist before push/deploy.

Suggested read-only preflight:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'weather_fetch_runs'
  and column_name in (
    'status',
    'triggered_by',
    'triggered_by_user_id',
    'trigger_reason',
    'expected_atime',
    'result_atime'
  )
order by column_name;
```

Expected: all six rows present.

### BLOCKER — v237 says tests must be re-verified, but the release sequence does not actually require fresh tests before push

v237 says the current test status is `2561 pass` from the v233 checkpoint and "must re-verify after reviewing full diff" (`ai-handoff/2026-07-15-1800-todo-086-v237-release-master-handoff.md:6`).

But the actual release steps go from staging to commit/push without a mandatory fresh test/build gate.

Given the size of this release, this should be a hard pre-push gate:

```powershell
npm run type-check
npm run test:run
npm run build
```

Codex did **not** run these commands in this review. Claude Code should run them after staging the final intended manifest and before push/deploy.

### HIGH — staged-file count in v237 is stale/wrong

v237 says the staged file count should be exactly `56` (`ai-handoff/2026-07-15-1800-todo-086-v237-release-master-handoff.md:203-206`).

Counting the explicit `git add` manifest in v237 gives 63 paths, not 56. The hard-coded count is therefore unsafe as a release check.

Required correction:

- Remove the hard-coded `56`, or change it to the correct count after Claude Code confirms the final manifest.
- Prefer verifying exact filenames:

```powershell
git diff --cached --name-only
```

The important rule is not the count by itself. The important rule is:

- include the release files listed in v237,
- exclude `TODO.md`,
- exclude `WORKFLOW.md`,
- exclude `ai-handoff/*`,
- exclude unrelated local-only/session artifacts.

### MEDIUM — SQL76 should have a read-only feature-key preflight before running

`sql/76_feature_access_weather_provider_vedurstofan.sql:20-24` drops and recreates the `feature_access_feature_key_check` constraint with the known feature keys plus `weather-provider-vedurstofan`.

That is probably correct, but it will fail if production already contains another feature key not in that list.

Before running SQL76, run:

```sql
select distinct feature_key
from public.feature_access
order by 1;
```

Expected keys should all be in:

- `umonnun`
- `tengsl`
- `facebook-oauth`
- `vedrid`
- `ferdalagid`
- `elta-vedrid`
- `weather-provider-vedurstofan`

If another key exists, update SQL76 before running it.

### MEDIUM — public final travel submit still has no direct rate limit

`app/api/teskeid/weather/travel/routes/route.ts:49` rate-limits public route-option requests, but `app/api/teskeid/weather/travel/route.ts:190` explicitly says final submit is not rate-limited because the rate limit is on `/routes`.

That may be acceptable for this release, but v237 should mention it as residual production risk because `/travel` still triggers provider work if called directly.

Suggested release note:

- Accept for now if route-options flow is the intended public entry point.
- Monitor provider/API usage after deploy.
- Add a TODO to consider lightweight per-IP limiting on final submit if public traffic grows.

### LOW — stale v237 note about files showing modified with no diff

v237 says `lib/weather/travel.ts`, `lib/weather/types.ts`, and `lib/__tests__/weather-travel.test.ts` show as modified with no diff (`ai-handoff/2026-07-15-1800-todo-086-v237-release-master-handoff.md:318-319`).

Current status reviewed by Codex did not show those as modified. Remove or refresh that note so the deploy handoff does not make Claude chase stale CRLF noise.

## What Looks Right

- The overall release shape is coherent: base weather public/auth contract, per-user Veðurstofan provider gate, freshness/run-state, history table, admin feature access, and Vercel env cleanup all belong together.
- The desired Vercel env model is clear:
  - `WEATHER_ENABLED=All`
  - `WEATHER_AUTH_ACCESS_REQUIRED=true`
  - `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`
  - `WEATHER_TRIP_FLAG=true`
  - `WEATHER_ELTA_VEDRID_FLAG=true`
  - `WEATHER_AI_ENABLED=false`
- Removing legacy Vercel vars is right after deploy verification:
  - `WEATHER_PUBLIC_ENABLED`
  - `WEATHER_FLAG`
  - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`
  - `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`
- SQL order should stay:
  1. SQL75
  2. SQL76
  3. SQL77
- Excluding `TODO.md`, `WORKFLOW.md`, and `ai-handoff/*` from the release commit is correct.
- The per-user provider access key `weather-provider-vedurstofan` is the right gate for the Veðurstofan layer while MET/Yr base weather remains available to everyone when `WEATHER_ENABLED=All`.

## Corrected Release Gate For Claude Code

Do not release from v237 as written. Use this corrected gate.

### 1. Production SQL preflight

Run read-only checks first:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'weather_fetch_runs'
  and column_name in (
    'status',
    'triggered_by',
    'triggered_by_user_id',
    'trigger_reason',
    'expected_atime',
    'result_atime'
  )
order by column_name;

select to_regclass('public.vedurstofan_forecasts_history');

select distinct feature_key
from public.feature_access
order by 1;
```

If SQL75 columns are missing, run SQL75 before release.

If SQL76 feature key is missing and existing feature keys are compatible, run SQL76 before release.

If SQL77 table is missing, run SQL77 before release.

### 2. Vercel env before deploy

Set/update:

```env
NEXT_PUBLIC_SITE_URL=https://teskeid.is
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_AI_ENABLED=false
```

Keep existing required secrets/providers:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `METNO_USER_AGENT`
- `GOOGLE_MAPS_SERVER_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`
- email/auth secrets already used by the app

Remove legacy vars only after the new code is deployed and verified:

```env
WEATHER_PUBLIC_ENABLED
WEATHER_FLAG
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
```

### 3. Stage exact manifest, not handoff/review files

Use v237's file manifest as the basis, but do not rely on the stale `56 files` count.

After staging:

```powershell
git diff --cached --name-only
```

Confirm:

- no `TODO.md`
- no `WORKFLOW.md`
- no `ai-handoff/*`
- no `.env.local`
- no unrelated local scratch files

### 4. Run fresh checks after staging and before push

Required:

```powershell
npm run type-check
npm run test:run
npm run build
```

If any fail, do not push/deploy.

### 5. Commit/push only after Stebbi explicitly approves

This review is not deploy approval. Claude Code still needs Stebbi's explicit release instruction.

## Supabase / RLS Review

Based on the reviewed SQL files:

- SQL75 adds metadata columns and indexes to `weather_fetch_runs`; it does not weaken RLS.
- SQL76 widens the `feature_access` CHECK constraint; it does not grant broader data access by itself.
- SQL77 creates `vedurstofan_forecasts_history` with RLS enabled and grants only `service_role`; no anon/authenticated access.

Main database risk is not RLS weakening. Main risk is running release code before SQL75 exists.

## Localhost Checks For Stebbi

After Claude Code applies the corrected release gate locally, test these before production release:

1. Public, signed out:
   - Open `/vedrid`.
   - Expected: MET/Yr base weather works.
   - Expected: no saved places.
   - Expected: no Veðurstofan provider controls unless public provider access is intentionally enabled, which it should not be for this release.

2. Signed in without `vedrid` and without `weather-provider-vedurstofan`:
   - Open home.
   - Expected: Veðrið card is visible when `WEATHER_ENABLED=All`.
   - Open `/auth-mvp/vedrid`.
   - Expected: saved places/auth shell works.
   - Expected: no Veðurstofan layer.

3. Signed in with `weather-provider-vedurstofan`:
   - Open `/auth-mvp/vedrid`.
   - Expected: Veðurstofan appears in provider filter.
   - Toggle MET/Yr and Veðurstofan independently.
   - Expected: selected providers drive map, scrubber, worst point, selected point, and all point cards consistently.

4. Manual freshness refresh:
   - With provider access, wait until UI says Veðurstofan data is stale/expected.
   - Click manual refresh once.
   - Expected: button cooldown/run-state prevents repeated immediate refreshes.
   - Expected: if new data exists, UI updates.
   - Expected: if Veðurstofan still returns old cycle, message explains that a newer forecast was expected but not returned.

5. Admin provider grant:
   - Add/remove `weather-provider-vedurstofan` for a test user.
   - Expected: that user gains/loses Veðurstofan layer, while still keeping base MET/Yr weather if `WEATHER_ENABLED=All`.
   - Do not test this casually in production with real users unless Stebbi intends to change their access.

6. Cron endpoint:
   - Only call production cron intentionally with the correct `CRON_SECRET`.
   - Expected: SQL75 run-state rows are created/updated.
   - Expected: no repeated concurrent refresh storms.

## Final Recommendation

No-go from v237 as written.

Go after these are fixed:

1. v237 corrected to mark SQL75 as mandatory.
2. v237 corrected to remove/fix the stale `56 files` check.
3. SQL preflight confirms production schema state.
4. Fresh `type-check`, `test:run`, and `build` pass after final staging.
5. Stebbi explicitly approves commit/push/deploy.

