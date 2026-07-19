# 2026-07-18 12:24 - TODO 086 v489 - Codex review of v488 prerelease

Reviewed handoff:
- `ai-handoff/2026-07-18-1220-todo-086-v488-claude-v487-done-prerelease.md`

Review stance: critical prerelease review. No code, SQL, env, commit, push, deploy, or production change was performed.

## Findings

1. **High: v487 core requirement is still not complete on `/vedrid` overview**

   `components/weather/WeatherOverviewClient.tsx:125`-`145` still builds the Veðurstofan map layer from station freshness (`stationTone(s.status)`) and freshness text (`statusOkTitle`, `statusStaleTitle`, `statusUnavailableTitle`). It does not classify Veðurstofan markers from forecast wind rows using `WindDisplayStatus`, does not set `markerColor`, and does not feed a shared status-filter row.

   Evidence: `components/weather/WindStatusFilterPills.tsx` is only used in `TravelAuditMap` and `DepartureHeatmap`; `rg` shows no `/vedrid` overview usage despite the component comment saying it is shared with overview. So `/vedrid` and `/ferdalagid` are not yet the same user model.

   Product impact: this does not yet deliver Stebbi's request: same colors, same status comments, and same pills under the map on `/vedrid` as on `/ferdalagid`. It is fine as an intermediate phase, but should not be treated as v487 done.

   Fix: finish the overview parity pass next:
   - derive a provider-neutral `WindDisplayStatus` per overview marker
   - for Veðurstofan, choose the forecast row closest to “now” or the same product-decided now-window rule used elsewhere
   - set `markerColor`, `statusLabel`, and marker `tone` from the same `windDisplayStatus` helpers
   - compute status counts across visible provider markers
   - render `WindStatusFilterPills` below the overview map using the same component as `/ferdalagid`
   - apply filters to both Veðurstofan and Vegagerðin markers without refetching

2. **Medium: SQL 82 is not safely runnable yet**

   `sql/82_weather_user_preferences.sql:50` creates a policy without `DROP POLICY IF EXISTS`, and `sql/82_weather_user_preferences.sql:68` creates a trigger without `DROP TRIGGER IF EXISTS`. Re-running the migration can fail. The file also enables RLS and creates authenticated policies but does not explicitly `REVOKE`/`GRANT` table privileges. Compare the repo pattern in `sql/69_weather_saved_places.sql`, which revokes public/anon/authenticated first, grants explicit authenticated/service_role privileges, drops policies/triggers before recreating them, then creates policies.

   Product impact: SQL 82 has not been run, which is good. But before Stebbi runs it, make it idempotent and explicit about privileges. Otherwise the later preferences API may fail due to missing grants, or a retry can fail on policy/trigger creation.

   Fix:
   - add `REVOKE ALL ON public.weather_user_preferences FROM PUBLIC, anon, authenticated`
   - add `GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_user_preferences TO authenticated`
   - add `GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_user_preferences TO service_role`
   - `DROP POLICY IF EXISTS "weather_user_preferences_own_row" ON public.weather_user_preferences`
   - `DROP TRIGGER IF EXISTS weather_user_preferences_updated_at ON public.weather_user_preferences`
   - consider reusing `public.teskeid_set_updated_at()` if available and preferred locally, instead of a one-off trigger function

3. **Medium: saved default threshold behavior is still deferred**

   v488 writes `sql/82_weather_user_preferences.sql`, but API routes and client persistence are deferred. That is acceptable if this is intentionally a partial phase, but the user-facing goal included “notandinn getur vistað sín default gildi ef hann er innskráður.”

   Product impact: authenticated users still cannot save threshold defaults. They can only adjust the in-memory overview values for the current session. Do not describe this as complete until GET/PUT routes, client loading, and save feedback exist.

4. **Low: `WindStatusFilterPills` docs overstate current usage**

   `components/weather/WindStatusFilterPills.tsx:41`-`44` says it is shared with `/vedrid` overview, but the current code does not use it there. This is small, but misleading during handoff-driven development.

   Fix: either use it in overview in the next phase, or soften the comment to “intended for /vedrid overview”.

## What Looks Good

- `WeatherThresholdBar` now uses `useId()`, so duplicate input IDs are fixed.
- `alwaysOpen` is a reasonable extension point and keeps the threshold UI reusable instead of one-off.
- Default driving thresholds are now 10/15 in `lib/weather/thresholds.ts`.
- The pill extraction is good directionally: `TravelAuditMap` and `DepartureHeatmap` now share one component.
- The provider context map legend was moved away from Google attribution.
- CTA label and placement moved in the right direction: bottom-centered `Ferðalagið`.

## Commands Run

```bash
npm run type-check
```

Result: exit 0.

```bash
npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/travelAuditMap.helpers.test.ts lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/spatialOrder.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts
```

Result: exit 0. 8 files passed, 313 tests passed, 5 skipped.

## Recommended Next Large Step

Give Claude Code one focused implementation block that finishes the parity instead of starting persistence first:

```text
Workflow

Rýndu v489 og framkvæmdu næsta afmarkaða skref:

1. Klára `/vedrid` overview þannig að kortið noti sömu `WindDisplayStatus` lógík, sömu marker colors, sömu status labels og sömu `WindStatusFilterPills` og `/vedrid/ferdalagid`.
2. Veðurstofan má ekki lengur lita overview punkta eftir freshness. Hún á að nota næsta/viðeigandi forecast wind row og sömu threshold gildi og Vegagerðin og ferðakortið.
3. Vegagerðin og Veðurstofan eiga báðar að renna í provider-neutral status-counts og visible-status filter.
4. Filter pillurnar undir overview map eiga að vera nákvæmlega sami reusable component og er nú notaður í `TravelAuditMap` og `DepartureHeatmap`.
5. Lagfæra comment í `WindStatusFilterPills` ef overview notkun klárast ekki í sama skrefi.
6. Harðna SQL 82 þannig að migration sé idempotent og með explicit REVOKE/GRANT/policy/trigger handling, en EKKI keyra SQL.
7. Ekki útfæra save-default API enn nema þetta klárist örugglega innan sama skrefs. Ef ekki, skilja það eftir sem næsta fasa.

Keyra:
- npm run type-check
- targeted tests fyrir wind status / travel map / overview ef til eru

Ekki commit-a, push-a, deploya eða keyra SQL.
Skila handoff strax eftir framkvæmd.
```

## Localhost Checks For Stebbi

After Claude Code fixes the findings above:

1. Open `http://localhost:3004/vedrid`.
2. Confirm both provider toggles still work: `Vegagerðin (núna)` and `Veðurstofan (spá)`.
3. Confirm the map markers are colored by weather thresholds, not freshness.
4. Confirm the same pill labels appear under the map as on `/vedrid/ferdalagid`: `Innan marka`, `Nálgast óþægindi`, `Óþægilegt`, `Nálgast hættumörk`, `Hættulegt`, as applicable.
5. Change thresholds from 10/15 to something stricter or looser, click `Setja`, and verify both Vegagerðin and Veðurstofan marker colors/counts update without reload.
6. Open `/vedrid/ferdalagid` for a route and verify pill wording and colors still match the overview.
7. Do not run SQL 82 from localhost testing unless Stebbi explicitly decides to test saved preferences.

## Release Stance

Not ready to call v487 complete. The build/tests are clean, but the main product promise, unified `/vedrid` and `/ferdalagid` status behavior, is still deferred. Safe to continue locally; do not release as “done” until finding #1 is fixed and SQL 82 is hardened before any migration run.

