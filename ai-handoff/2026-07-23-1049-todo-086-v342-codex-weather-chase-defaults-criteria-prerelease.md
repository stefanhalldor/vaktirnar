# TODO-086 v342 Codex Handoff - Weather Chase Defaults + Criteria

## Context

Stebbi asked to make the new Road Intelligence weather-chase view a more primary entry point: open the comparison panel over the map, remove the selected-place pills, allow reordering/removal inside the table, add "Hvernig veðri ertu að leita að?" criteria, dim non-matching forecast values instead of hiding them, and add a save-as-default flow similar to weather wind thresholds.

Design note: I followed the mobile/app constraints from `Design.md`: no tiny inputs, no mobile zoom traps, panel has stable max-height and internal scroll, controls are compact but tappable, and the map remains in the background without visually overtaking the table.

## What I Changed

1. Added a new preferences API + SQL migration draft
   - `sql/90_weather_chase_preferences.sql`
     - New `public.weather_chase_preferences` table.
     - Stores `selected_items jsonb` and `criteria jsonb`.
     - Service-role only, no anon/authenticated grants.
     - RLS enabled with no user policies; API reads/writes through service role.
     - Uses shared `public.teskeid_set_updated_at()` trigger.
   - `app/api/teskeid/weather/preferences/chase/route.ts`
     - `GET` returns saved weather-chase preferences for authenticated user.
     - `PUT` validates and upserts selected places + criteria.
     - Handles missing SQL90 table as `schema_missing`/`schemaMissing` instead of hard failing the UI.
     - Ensures profile row before upsert, mirroring the weather threshold pattern.

2. Updated `WeatherChasePanel`
   - Added criteria model:
     - minimum temperature
     - maximum wind
     - maximum precipitation
   - Forecast values outside those criteria are dimmed/grayscaled, not removed.
   - Added "Vista mitt veðurkort" button.
   - Removed the selected-place pills section as the primary selected-place control.
   - Added `x`, up, and down controls directly inside each table row/card.
   - Kept the search dropdown and the nearby-IMO-stations action for Yr/met.no items.
   - Added translated unit labels instead of adding new hardcoded UI text.

3. Updated `RoadMapPrototypeMap`
   - `Elta veðrið` now opens by default in the prototype.
   - Weather-chase panel z-index is raised above map markers so the map cannot draw over the panel.
   - Weather-chase top button stays above the panel.
   - Added preference loading order:
     - localStorage first for instant browser persistence
     - API preferences override when available
     - pending sessionStorage save is consumed after auth return
   - Save flow:
     - stores local copy immediately
     - calls `/api/teskeid/weather/preferences/chase`
     - on `401`, stores pending payload and redirects to `/innskraning?next=...`
     - on SQL90 missing, reports browser-local save state instead of breaking the panel

4. Updated translations
   - `messages/is.json`
   - `messages/en.json`
   - Added labels for criteria, saving state, saved state, local-only saved state, and units.

5. Small safety fix from test failure
   - `app/api/teskeid/weather/metno/point/route.ts`
   - Removed dynamic exception object from `console.error`; log-safety tests require static console error/warn payloads.

## Files Changed In This Step

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `app/api/teskeid/weather/preferences/chase/route.ts`
- `app/api/teskeid/weather/metno/point/route.ts`
- `sql/90_weather_chase_preferences.sql`
- `ai-handoff/2026-07-23-1049-todo-086-v342-codex-weather-chase-defaults-criteria-prerelease.md`

There are other dirty files from earlier Road Intelligence work in the worktree. I did not revert or normalize them.

## Commands Run

- `npm run type-check`
  - Exit code: 0
- `npm run test:run`
  - First run failed on log-safety for `app/api/teskeid/weather/metno/point/route.ts`.
  - I fixed the dynamic `console.error`.
- `npm run type-check`
  - Exit code: 0
- `npm run test:run`
  - Exit code: 0
  - 129 test files passed.
  - 3577 tests passed, 27 skipped, 8 todo.

## SQL / Supabase

SQL90 was written but not run.

Expected SQL90 impact if Stebbi approves and runs it:
- Creates one new table: `public.weather_chase_preferences`.
- Stores per-user selected weather-chase places and criteria.
- No public/anon/authenticated direct table access.
- `service_role` gets CRUD.
- RLS enabled.
- No weakening of existing RLS, auth, grants, policies, or user-data boundaries.

Until SQL90 is run:
- The UI still works.
- "Vista mitt veðurkort" stores preferences in the browser.
- Authenticated API save returns `schema_missing`, and the UI shows the local-only saved message.

## Known Limitations / Follow-Up

- The new save flow is implemented against the prototype route and API, but SQL90 must be reviewed and run before real per-user cross-browser persistence exists.
- The panel currently dims each metric stack for a time/place cell if any selected criterion fails. If Stebbi wants per-metric dimming instead, Claude can split the dimming between temperature/wind/precip lines.
- The selected-place X is in the row controls rather than visually pinned as an absolute top-right corner. Functionally this removes the need for pills; visually Claude may polish row placement if desired.
- No Playwright/browser screenshot was run because Stebbi controls localhost/dev server in this workflow.

## Suggested Claude Review Focus

1. Confirm SQL90 table ownership, RLS posture, and whether `jsonb` is the right shape for future provider comparison.
2. Review the save/auth flow against the existing wind-threshold defaults pattern.
3. Check whether localStorage fallback messaging is acceptable for prerelease.
4. Confirm the table overlay z-index does not conflict with map controls, chat drawer, route drawer, or full-screen loaders.
5. Consider whether criteria should eventually be saved in `weather_user_preferences` instead of a dedicated table; I chose a dedicated table to keep selected items and criteria together.

## Localhost Checks for Stebbi

Prereq:
- `ROAD_INTELLIGENCE_V1_ENABLED=true`
- User has `road-intelligence-v1` feature access.
- Do not run SQL90 casually unless you explicitly decide to test database persistence.

Checks:

1. Open `/auth-mvp/vedrid/road-map-prototype`.
   - Expected: `Elta veðrið` panel opens by default over the map.
   - Expected: map remains visible in background but does not draw over the panel.

2. Search for a place.
   - Type `Akureyri`, `Reykjavík`, `Vík`, or `Egilsstaðir`.
   - Expected: dropdown results appear while typing.
   - Add one or more items.

3. Remove and reorder places.
   - Use `x`, up, and down inside the table rows.
   - Expected: pills are not needed; table order changes and map markers follow selected places.

4. Try weather criteria.
   - Set e.g. minimum temperature `12`, max wind `6`, max precipitation `0`.
   - Expected: table cells that do not satisfy those criteria become dimmed/grayscaled, not hidden.
   - Clear a field and confirm the criterion stops affecting cells.

5. Save defaults before SQL90 is run.
   - Click `Vista mitt veðurkort`.
   - Expected: if SQL90 is not run, it should show local/browser saved state, not crash.
   - Refresh the page.
   - Expected: selected places and criteria return from localStorage.

6. After SQL90 is reviewed and explicitly approved/run:
   - Click `Vista mitt veðurkort` as authenticated user.
   - Expected: "Vistað sem sjálfgefið."
   - Refresh in same browser and, ideally, test another browser/session under same user.
   - Expected: preferences are fetched from API.

7. Regression checks:
   - Toggle 🚗 route mode and 💬 chat; each should close `Elta veðrið`.
   - Route calculation should still work.
   - Overview scrubber and filter pills should still work.
   - Console should not show missing translation errors for the new labels.

