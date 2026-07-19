# 2026-07-18 13:05 - TODO 086 v491 - Codex review of v490 and SQL82 answer

Reviewed handoff:
- `ai-handoff/2026-07-18-1300-todo-086-v490-claude-v489-done-prerelease.md`

Review stance: prerelease review plus direct answer to Stebbi's question: “Á ég að keyra sql82 núna, og hvað gerir það?” No SQL, code, env, commit, push, deploy, or production action was performed.

## Short Answer For Stebbi

**You do not need to run SQL 82 right now to test v490.**

SQL 82 is a preparation migration for the later “save my default weather thresholds” feature. The current v490 behavior, marker colors, status pills, `/vedrid` overview parity, and threshold controls are in-memory/client behavior and do **not** require SQL 82 yet.

**Run SQL 82 only when you are ready to continue into the next phase where logged-in users can save their default wind thresholds.**

## What SQL 82 Does

`sql/82_weather_user_preferences.sql` creates a new table:

- `public.weather_user_preferences`

It stores one preferences row per logged-in user:

- `user_id`
- `caution_wind_ms`
- `red_wind_ms`
- `created_at`
- `updated_at`

It also:

- enforces `caution_wind_ms < red_wind_ms`
- enforces both values are `> 0` and `<= 40`
- enables RLS
- revokes broad public/anon/authenticated rights first
- grants authenticated users explicit table privileges
- adds one RLS policy so authenticated users can only manage their own row
- grants service_role access
- adds an `updated_at` trigger

It does **not** change existing weather data, Veðurstofan tables, Vegagerðin tables, chat/pulse messages, saved places, feature access, auth users, or production behavior by itself.

## Should It Be Safe To Run Later?

Yes, directionally. v490 hardened the two important SQL issues from v489:

- `DROP POLICY IF EXISTS` before recreating the policy
- `DROP TRIGGER IF EXISTS` before recreating the trigger
- explicit `REVOKE` and `GRANT`

So it now matches the local migration style much better.

Still, this is a schema change. Run it only when Stebbi explicitly chooses to prepare the DB for saved threshold preferences. After it is run, the app still will not save preferences until the GET/PUT API routes and client persistence are implemented.

## Findings

1. **Low: now-anchored Veðurstofan classifier should get a direct unit test**

   `lib/weather/windDisplayStatus.ts:124` adds `classifyNowAnchoredForecastWindDisplayStatus`, but `rg` did not find a direct test for that function. The existing targeted suite passes, and this is not a blocker for localhost testing, but this function is now part of the shared status/color model for `/vedrid` overview. It should be pinned down with tests for:

   - empty forecasts returns `no_data`
   - closest forecast row is chosen
   - null wind row returns `no_data`
   - 10/15 threshold boundaries classify the same as other status surfaces

2. **Low: long-open `/vedrid` pages may not re-anchor “now” automatically**

   The classifier uses `Date.now()` during render/classification. If a user leaves `/vedrid` open for a long time, marker classification may not move to the next forecast time unless another state update causes a re-render. This is likely acceptable for now, because provider polling/loading and user threshold changes can re-render, but eventually we may want a small interval tick every 5-10 minutes for overview status freshness.

## What Looks Good

- v490 appears to fix the main v489 blocker: Veðurstofan overview markers now use `classifyNowAnchoredForecastWindDisplayStatus` instead of freshness-based `stationTone`.
- Both Veðurstofan and Vegagerðin markers now use `WIND_STATUS_MARKER_COLOR`, `WIND_STATUS_META`, and `WindDisplayStatus`.
- `WindStatusFilterPills` is now actually used on `/vedrid` overview.
- Counts aggregate across visible providers and respond to provider toggles.
- SQL 82 is much safer than in v488 and should be okay to prepare for a later saved-preferences phase.

## Commands Run

```bash
npm run type-check
```

Result: exit 0.

```bash
npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/travelAuditMap.helpers.test.ts lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/spatialOrder.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts
```

Result: exit 0. 8 files passed, 313 tests passed, 5 skipped.

## Recommended Next Step

Do **not** run SQL 82 just for v490 localhost testing.

Recommended next Claude Code step:

```text
Workflow

Rýndu v491 og framkvæmdu aðeins hardening sem þarf fyrir v490:

1. Bæta unit tests fyrir `classifyNowAnchoredForecastWindDisplayStatus`.
2. Staðfesta að `/vedrid` overview status pills og marker colors noti sömu status order og `/ferdalagid`.
3. Ekki útfæra saved threshold API enn nema Stebbi biðji sérstaklega um það.
4. Ekki keyra SQL 82.

Keyra type-check og targeted wind/status tests.
Ekki commit-a, push-a, deploya eða keyra SQL.
Skila handoff strax eftir framkvæmd.
```

## Localhost Checks For Stebbi

Without running SQL 82:

1. Open `http://localhost:3004/vedrid`.
2. Confirm marker colors are now driven by weather thresholds, not freshness.
3. Confirm status pills below the map match `/vedrid/ferdalagid`.
4. Toggle `Vegagerðin (núna)` and `Veðurstofan (spá)` and confirm pill counts update.
5. Change thresholds from 10/15 to stricter/looser values and click `Setja`; confirm markers and pill counts update without reload.

If SQL 82 is later run:

1. Only test saved preferences after GET/PUT API routes exist.
2. Do not expect any visible change immediately after SQL 82 alone.
3. Do not test this casually on production unless Stebbi has explicitly decided that the DB schema prep is desired.

