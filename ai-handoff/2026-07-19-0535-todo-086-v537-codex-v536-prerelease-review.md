# 2026-07-19 05:35 - TODO 086 v537 - Codex review of v536

Created: 2026-07-19 05:35
Timezone: Atlantic/Reykjavik

Reviewed:

- `ai-handoff/2026-07-19-0100-todo-086-v536-claude-v535-done-prerelease.md`

Focused code read:

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/WeatherThresholdBar.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `components/weather/IcelandOverviewMap.tsx`
- `lib/weather/windDisplayStatus.ts`
- `messages/is.json`
- `messages/en.json`

---

## Findings

1. **Medium/UX: default filter can make the map look broken when only hidden statuses exist**

   The default filter now correctly starts with only actionable statuses:

   - `components/weather/WeatherOverviewClient.tsx:103` to `components/weather/WeatherOverviewClient.tsx:106`
   - `lib/weather/windDisplayStatus.ts:41` to `lib/weather/windDisplayStatus.ts:51`

   That matches Stebbi's request to hide `innan-marka`, `no_wind_data`, and `no_data` by default.

   Edge case: on a calm day, or in a route-filtered view where every remaining station is `innan-marka` or missing wind, `WeatherOverviewClient` marks every marker `visible: false` at:

   - Veðurstofan: `components/weather/WeatherOverviewClient.tsx:343` to `components/weather/WeatherOverviewClient.tsx:355`
   - Vegagerðin: `components/weather/WeatherOverviewClient.tsx:410` to `components/weather/WeatherOverviewClient.tsx:425`

   The pill row still shows faded hidden-status pills and `Sýna allt`, but the map itself can become empty with no explanatory text. Users may read that as "no data" rather than "everything currently shown is filtered out".

   Recommended fix before release if small:

   - Keep the default filter exactly as requested.
   - Add a compact empty-filter hint when active filters hide all active-provider markers, e.g. "Engin stöð fellur undir virku síurnar. Sýna allt".
   - Or make `Sýna allt` visually stronger only in that empty-filter state.

   Do not auto-enable `innan-marka`; that would undo Stebbi's product decision.

2. **Low/Docs: `WeatherSourceTimeSelector` comments still say Veðurstofan/Yr**

   User-facing copy was fixed to `Veðurstofan (spá)`:

   - `messages/is.json:1053`
   - `messages/en.json:1049`

   But comments still say Veðurstofan/Yr:

   - `components/weather/WeatherSourceTimeSelector.tsx:22`
   - `components/weather/WeatherSourceTimeSelector.tsx:37`
   - `components/weather/WeatherSourceTimeSelector.tsx:103`

   Not user-visible, not a release blocker, but it undermines the "Yr is not wired yet" clarity. Change comments to "forecast provider" or "Veðurstofan forecast slots" until Yr is real.

3. **Low/Test gap: no targeted test protects the new `/vedrid` default filter**

   v536 adds `DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES`, but there is no focused assertion that:

   - it includes the four actionable statuses,
   - it excludes `innan-marka`,
   - it excludes `no_data`,
   - it excludes `no_wind_data`.

   Since this was a direct Stebbi product request and easy to regress, add a tiny unit test if there is a nearby lightweight weather status test file. This is not a blocker if Claude wants to keep the pass tiny, but it is cheap protection.

---

## Positive confirmations

- v536 correctly chose Yr Option A: the UI no longer claims `Veðurstofan/Yr` while no runtime reader/writer exists for `metno_point_forecasts_history`.
- Migration instructions in v536 are clear and safe:
  - `82` not needed for this pass.
  - `83` not ready unless writer/fallback reader are truly in use.
  - `84` not ready until Yr writer/API/UI are wired.
  - `85` is still `DO NOT RUN`.
- `Nota mörk` is a better label than `Setja` for local-only threshold application.
- The threshold button no longer uses the heavy filled primary style.
- `WeatherSourceTimeSelector` left "Núna" block is centered and much closer to the forecast slot rhythm.
- No SQL, migration, env, Vercel, commit, push or deploy was done.

---

## Commands run by Codex

```bash
npm run type-check
```

Exit code: 0

```bash
npm run test:run -- lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/windObservationStatus.test.ts
```

Exit code: 0

Result: 4 test files passed, 104 tests passed.

Note: `git status` printed warnings about being unable to access `C:\Users\Lenovo/.config/git/ignore` due permission denial. This did not block the review or tests.

---

## SQL / migration status

No SQL was run.

Codex agrees with v536:

| Migration | Status for this pass |
|---|---|
| `sql/81_teskeid_chat_target_type_vegagerdin_station.sql` | Only run if Stebbi explicitly wants Vegagerðin pulse writes and it has not already been run. Not needed for v536 UI polish. |
| `sql/82_weather_user_preferences.sql` | Do not run for v536. `Nota mörk` is local-only. |
| `sql/83_vegagerdin_measurements_history.sql` | Do not run until writer + fallback reader are confirmed in the current branch. |
| `sql/84_metno_point_forecasts_history.sql` | Do not run until Yr/met.no writer + API reader + UI are all wired. v536 removed the misleading Yr label instead. |
| `sql/85_route_observation_aggregate.sql` | Do not run. It is still draft. |

Very plain rule for Stebbi:

> Do not run any migration for v536. The `/vedrid` banner/filter/button/label polish is code-only.

---

## Design.md check

Relevant rules considered:

- Mobile-first app feel.
- Inputs must stay >=16px to avoid iOS zoom.
- Controls should not introduce horizontal overflow or layout shift.
- Buttons should use Teskeið hierarchy and not create competing primary CTAs.
- User-facing text belongs in message files.

v536 mostly follows this. The main remaining UX concern is the empty-map case from the default filter.

---

## Route intelligence check

- Route/domain area touched indirectly: `/vedrid` overview and route lens context.
- No new route-family, segment, caution, provider matching, or storage logic was added in v536.
- No raw Google route content, exact addresses, user IDs or place IDs are newly stored.
- No `IcelandRoadmap.md` update needed for v536.

---

## Recommended next Claude step

Small hardening pass, no SQL:

1. Add empty-filter hint for the case where active provider has markers, but active filters hide all of them.
2. Clean stale `Veðurstofan/Yr` comments in `WeatherSourceTimeSelector`.
3. Add tiny test for `DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES`.
4. Re-run:
   - `npm run type-check`
   - targeted tests, including the new/updated status test.
5. Return a handoff.

Do not run migrations, commit, push or deploy.

---

## Localhost checks for Stebbi

After Claude's next hardening pass, test:

1. Open `/vedrid` in mobile width.
2. Confirm the banner appears and feels calm, not like a large card.
3. Confirm the default map focuses on actionable wind statuses.
4. If possible, test a route/filter state where no actionable statuses are left.
5. Expected: the UI explains that active filters are hiding everything and offers a clear `Sýna allt` path.
6. Confirm `Núna / Mælt hh:mm` is centered and readable.
7. Confirm the forecast selector says `Veðurstofan (spá)`, not `Veðurstofan/Yr`.
8. Confirm station details do not claim Yr unless real Yr data is displayed.
9. Confirm no SQL was run.

---

## Release stance

I would not block a prerelease solely on v536 if Stebbi is comfortable with the possible empty-map UX. However, the empty-filter hint is small, valuable, and directly protects the new default-filter behavior. I would ask Claude Code to do that quick hardening before treating this as release-ready.
