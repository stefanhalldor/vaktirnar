# TODO-091 v028: Public defaults and recoverable met.no forecasts

**Created:** 2026-07-25 00:58 (Atlantic/Reykjavik)  
**Agent:** Codex  
**Status:** Implemented locally; ready for Claude Code review and release decision

## 1. Plan

1. Trace why public users received empty Yr / met.no rows.
2. Keep five explicit default places for users without saved server preferences.
3. Allow the public forecast UI to read met.no forecasts without exposing an arbitrary-coordinate proxy.
4. Add visible loading, error, automatic retry, and manual retry behavior.
5. Add focused tests, type-check, full test run, production build, and this handoff.

## 2. What was actually done

- Root cause confirmed: `/auth-mvp/vedrid/road-map-prototype` was public, but
  `/api/teskeid/weather/metno/point` was not in the middleware public
  allowlist. Public requests therefore received `401`.
- Added the met.no route as an exact public middleware path.
- Hardened the route before making it public:
  - it now accepts only a canonical `placeId` from `ROAD_MAP_PLACES`;
  - arbitrary `lat`/`lon` requests are rejected;
  - empty provider results return `503`, not a misleading successful response.
- Added these five explicit defaults when no saved server preference exists:
  - Hella (Veðurstofa Íslands)
  - Reykjavík (Veðurstofa Íslands)
  - Vestmannaeyjabær (Veðurstofa Íslands)
  - Egilsstaðir (Yr / met.no)
  - Ísafjörður (Yr / met.no)
- Existing authenticated server preferences still take precedence.
- Added placeholder items for the defaults while Veðurstofan data hydrates, so
  the intended selection is stable.
- Client met.no loading now sends `placeId`, retries once automatically, caches
  only usable non-empty rows, and logs diagnostics outside normal production
  mode.
- A failed or empty row now shows a translated error and `Reyna aftur` action
  instead of only dashes. This works both when the entire comparison has no
  columns and when other rows already provide comparison columns.

## 3. Files inspected

- `WORKFLOW.md`
- `Design.md`
- `middleware.ts`
- `app/api/teskeid/weather/metno/point/route.ts`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `lib/road-intelligence/roadMapPlaces.ts`
- `lib/weather/providers/vedurstofanStationsRegistry.ts`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/README.md`

## 4. Files changed

- `middleware.ts`
- `app/api/teskeid/weather/metno/point/route.ts`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- `lib/__tests__/weather-metno-point-route.test.ts` (new)
- `ai-handoff/2026-07-25-0058-todo-091-v028-codex-public-metno-defaults-and-recovery.md` (new)

Unrelated pre-existing working-tree changes were preserved, including
`.obsidian/workspace.json` and the v006 handoff rename/delete state.

## 5. Commands run

1. Focused tests:
   - `npm run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-metno-point-route.test.ts`
   - First run: exit 1 while the new tests were being corrected.
   - Final run: exit 0; 2 files, 6 tests passed.
2. TypeScript:
   - `npm run type-check`
   - Exit 0.
3. Diff hygiene:
   - `git diff --check`
   - Exit 0; only existing line-ending warnings were printed.
4. Full tests:
   - `npm run test:run`
   - Exit 1; 134 files passed, 1 file failed; 3,579 tests passed, 17 failed,
     27 skipped, 8 todo.
5. Production build:
   - `npm run build`
   - Exit 0.

## 6. Results

- Focused behavior is covered and passes.
- TypeScript passes.
- Production build passes.
- No new build warnings were identified as specific to this change.
- Public met.no access is deliberately bounded to the existing canonical place
  catalog.

## 7. What failed or was skipped

- The full suite has 17 failures in
  `lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts`.
- All failures have the same unrelated cause:
  `Invariant: incrementalCache missing in unstable_cache`.
- The failing route is
  `app/api/teskeid/weather/vedurstofan/stations/route.ts`, which this change did
  not modify. Its test environment needs an `unstable_cache` mock or equivalent
  Next cache context.
- No browser automation was run because Stebbi owns the localhost dev server.
- No commit, push, deploy, SQL, migration, Supabase change, or production
  mutation was performed.

## 8. Decisions taken

- Used explicit product defaults rather than dynamically choosing nearest
  Veðurstofan stations, because the requested public first impression must be
  deterministic.
- Did not make a free-coordinate endpoint public. Canonical `placeId` avoids
  turning Teskeið into an unrestricted met.no proxy/cache warmer.
- Kept saved server preferences authoritative. Defaults apply only when the
  saved selection is empty.
- Added one silent automatic retry plus a visible manual retry. This handles a
  transient first failure without trapping the user in a frozen empty row.

## 9. Remaining risk

- The live met.no provider behavior still needs browser verification from both
  ASCII and IDN production hostnames after deployment.
- The endpoint is public and causes an upstream/cache read for valid catalog
  places. The bounded catalog materially limits abuse, but Claude Code should
  still review provider caching and rate-limit assumptions before release.
- Default Veðurstofan station IDs depend on the current curated registry:
  `6315`, `1475`, and `6015`.
- The unrelated full-suite `unstable_cache` test regression should be fixed or
  explicitly accepted before treating the complete suite as green.

## 10. Suggested next step

Claude Code should review this diff, especially the exact middleware exposure
and canonical-place validation. If accepted, fix or formally isolate the
unrelated `unstable_cache` Vitest regression, then commit and deploy only after
Stebbi gives separate permission for those external actions.

## 11. Questions for Claude Code review

1. Is `ROAD_MAP_PLACES` sufficiently bounded and stable to define all public
   met.no requests?
2. Does `fetchForecast` already provide the intended production cache/rate
   behavior for repeated public requests?
3. Should the automatic retry be restricted to `5xx`/network errors rather
   than all non-OK responses, even though valid UI IDs cannot produce `400`?
4. Can the existing station-explorer tests safely mock `unstable_cache`
   without weakening coverage of the route's cached behavior?

## 12. Supabase / data / auth impact

- No SQL file was written or run.
- No migration, RLS, grant, policy, function, auth record, or production data
  was changed.
- One read-only weather endpoint changed from authenticated-by-middleware to
  exact-path public.
- The handler now provides its own strict input boundary: only known
  `ROAD_MAP_PLACES` IDs are accepted.
- Saved authenticated preferences remain server-owned and take precedence.
- Public users still do not persist defaults in localStorage.

## Localhost checks for Stebbi

Use the existing localhost server; Codex did not start or restart it.

### Public first visit

1. Open a private/incognito window.
2. Visit
   `/auth-mvp/vedrid/road-map-prototype`.
3. Open `Spágögn`.
4. Expected:
   - exactly these five defaults appear: Hella, Reykjavík,
     Vestmannaeyjabær, Egilsstaðir, and Ísafjörður;
   - the first three are marked Veðurstofa Íslands;
   - Egilsstaðir and Ísafjörður are marked Yr / met.no;
   - Veðurstofan values can appear first;
   - met.no values populate without a page reload and do not remain silent
     rows of dashes.

### Failure and retry

1. In browser devtools, temporarily block
   `/api/teskeid/weather/metno/point`.
2. Add or reload a Yr / met.no place.
3. Expected: the row shows `Náði ekki að sækja spá.` and `Reyna aftur`.
4. Remove the block and click `Reyna aftur`.
5. Expected: values populate and the error disappears.

### Authenticated preference regression

1. Sign in with an account that already has saved weather places.
2. Open `Spágögn`.
3. Expected: the saved server-side selection appears instead of the five
   public defaults.
4. Change the selected places, reload, and confirm autosave still restores the
   new selection.

### Security boundary

In the browser console or address bar, request:

`/api/teskeid/weather/metno/point?lat=64.1&lon=-21.9`

Expected: HTTP 400. Then request:

`/api/teskeid/weather/metno/point?placeId=egilsstadir`

Expected: HTTP 200 with forecast data under normal provider availability.

Do not test production deployment, Supabase writes, billing, secrets, or
provider stress/rate behavior without separate explicit permission. Normal
single-user localhost requests are read-only apart from the already-intended
authenticated preference autosave.
