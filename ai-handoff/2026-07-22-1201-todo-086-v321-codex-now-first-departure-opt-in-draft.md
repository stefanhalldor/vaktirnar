# TODO-086 v321 Codex Handoff - Now-First Departure Opt-In Draft

## Context

Stebbi asked Codex to review:

- `2026-07-22-1148-todo-086-v320-plan-now-first-departure-opt-in`
- `2026-07-22-1150-todo-086-v320-claude-session-handoff`

and implement a first draft of the new idea: show the route immediately for **Núna** using Vegagerðin current route stations, then make hourly departure/forecast calculation an explicit user action in the scrubber instead of automatic background work.

Stebbi gave explicit execution permission for code/text/handoff edits. No commit, push, deploy, SQL, migration, env, Supabase, production, or dev-server action was performed.

## Plan For This Slice

1. Keep `/api/teskeid/weather/travel` contract unchanged.
2. Stop auto-running `buildProviderSlotStatusOverrides()` right after route calculation.
3. Open the map on the first computed route with only the `Núna` route-state active.
4. Store the forecast timeline computation context in-memory so it can be run later.
5. Add an opt-in scrubber section: "Ef lagt er af stað kl.".
6. Compute the first 24-ish hourly departure slots only after the user asks for them.
7. Keep current Vegagerðin route station labels visible for `Núna`.
8. Show Vegagerðin current wind as mean + gust compactly where gust exists: `8(13) m/s`.

## What Was Actually Done

Changed `components/weather/RoadMapPrototypeMap.tsx`:

- Added `RouteForecastBuildStatus` and `RouteForecastBuildContext`.
- Added `routeForecastBuildContextRef`.
- Added `routeDepartureForecastExpanded` state.
- Added `resetRouteDepartureForecastState()`.
- Added `handleRouteDepartureForecastOptIn()`.
- Removed the automatic post-route `setTimeout(...buildProviderSlotStatusOverrides...)` path from `calculateResolvedRoute()`.
- `calculateResolvedRoute()` now:
  - renders the route and current provider stations first;
  - sets `routeCandidates` to only the first/now candidate;
  - sets `selectedCandidateIdx` to `0`;
  - stores full timeline inputs in `routeForecastBuildContextRef`;
  - leaves forecast status idle until the user opts in.
- Reworked the route bottom strip:
  - always shows `Einfalt` / `Nánar` and status pills for the currently visible route station set;
  - shows an explicit selected `Núna` chip;
  - shows a collapsed `Ef lagt er af stað kl.` action;
  - renders `DepartureHeatmap` only after opt-in and successful timeline expansion.
- Updated Vegagerðin route station labels/popups:
  - label uses `mean(gust)` when gust exists, for example `8(12) m/s`;
  - popup wind line uses the same compact value;
  - separate duplicate gust line was removed from this route popup path.

Changed translations:

- `messages/is.json`
- `messages/en.json`

Added keys:

- `roadMapPrototypeDepartureOptInTitle`
- `roadMapPrototypeDepartureOptInDescription`
- `roadMapPrototypeDepartureOptInButton`
- `roadMapPrototypeDepartureOptInRetry`
- `roadMapPrototypeDepartureOptInUnavailable`

## Files Inspected

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-22-1148-todo-086-v320-plan-now-first-departure-opt-in.md`
- `ai-handoff/2026-07-22-1150-todo-086-v320-claude-session-handoff.md`
- `ai-handoff/2026-07-22-1125-todo-086-v319-claude-v318-bugs-fixed-prerelease.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Files Changed By Codex In This Turn

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-22-1201-todo-086-v321-codex-now-first-departure-opt-in-draft.md`

Already dirty before this turn, not authored by this slice:

- `components/weather/DepartureHeatmap.tsx`
- `.obsidian/workspace.json`
- several untracked previous `ai-handoff/*` files

`DepartureHeatmap.tsx` still appears dirty in `git status`, but Codex did not edit it in this turn.

## Commands Run

- `npm run type-check`
  - Exit code: `0`
  - Result: TypeScript passed.
- `npm run test:run -- road-intelligence-route-slot-statuses`
  - Exit code: `0`
  - Result: 1 test file passed, 25 tests passed.
- `git diff --check`
  - Exit code: `0`
  - Result: no whitespace errors. Git printed existing CRLF warnings.
- `git status --short`
  - Exit code: `0`
  - Result: confirmed dirty state includes this slice plus pre-existing dirty/untracked files.

No dev server was started or restarted.

## Route Intelligence Check

- No SQL written or run.
- No Supabase, RLS, auth, grants, policies, service-role functions, or production data touched.
- No Google Routes API dependency was added.
- No raw Google route geometry persistence was added.
- The route still uses the existing travel API response and current provider matching pipeline.
- This slice reduces eager work: forecast slot status computation is now user opt-in.
- The "Núna" route path remains provider-first: Vegagerðin current route stations are used when available; Veðurstofan is only for forecast/departure mode.

## Design / UX Notes

This follows the v320 product idea:

- The user gets the useful route map sooner.
- The bottom scrubber starts simpler: current route conditions first.
- Forecast-by-departure becomes a progressive disclosure action, not something that blocks or clutters the first result.
- The fullscreen Teskeið loader remains only for the initial route + `Núna` calculation.
- Longer forecast calculation messaging lives inside the scrubber after opt-in.

Remaining UX risk:

- I did not run a browser visual test in this turn because Stebbi runs localhost.
- The exact spacing/fit of the new scrubber card should be checked on the 546px responsive viewport.

## What Was Not Solved In This Slice

This slice intentionally did not attempt to fully solve every older map issue:

- It does not redesign route station label collision/placement.
- It does not implement a worker/chunked algorithm for forecast computation.
- It does not change the road-surface alternative route search pipeline.
- It does not add persistent user preference for this opt-in behavior.
- It does not remove older diagnostic console logs from v319.

## Risks / Things Claude Should Review

1. Review whether `routeForecastBuildContextRef` should be invalidated in any additional edge case, especially if future code adds more route-changing controls.
2. Check that switching between route alternatives keeps the no-fullscreen-loader behavior but correctly collapses forecast opt-in on the new route.
3. Check whether forecast opt-in should preserve `visibleRouteStatuses` or reset filters before rendering the heatmap.
4. Confirm whether `8(12) m/s` is the desired route-station label for current Vegagerðin data, or whether gusts should only appear in popup/details.
5. Review if the new `Ef lagt er af stað kl.` copy is too terse in English/Icelandic.
6. Consider extracting the route status mode toggle and now/departure scrubber mini UI into smaller reusable components once this behavior is accepted.

## Suggested Next Step

Claude should review the v321 changes and then do a localhost-driven polish pass:

1. Confirm that `Reikna` opens immediately on `Núna` only.
2. Confirm no grey forecast-hour dots are shown before opt-in.
3. Confirm clicking `Skoða brottfarartíma` computes and reveals the first 24 slots.
4. Confirm selecting a future slot switches map station layer from Vegagerðin current to Veðurstofan forecast.
5. If that works, next implementation should focus on label placement/collision and route option switching fluidity.

## Localhost Checks For Stebbi

Setup:

- Use local dev server already running from Stebbi.
- Open `/auth-mvp/vedrid/road-map-prototype`.
- Be signed in with `road-intelligence-v1` access and `ROAD_INTELLIGENCE_V1_ENABLED=true`.

Check 1: Now-first route result

1. Open the car panel.
2. Search a known route, for example `Akureyri` to `Egilsstaðir`.
3. Click `Reikna`.

Expected:

- Fullscreen Teskeið loader appears only while route + current station state is being calculated.
- Map opens with `Núna` selected.
- Bottom strip shows `Einfalt` / `Nánar`, status pills, and a selected `Núna` chip.
- It does not immediately show 24 grey departure-hour dots.
- Route station counts in the pills should match the visible current route station set, not old 80 MET/Yr route points.

Check 2: Current Vegagerðin labels

1. Stay on `Núna`.
2. Inspect route station labels.

Expected:

- Vegagerðin current route stations are visible.
- Labels show wind compactly, e.g. `8(12) m/s` where gust exists or `8 m/s` without gust.
- Clicking a current route station opens the route popup and uses the same compact wind value.

Check 3: Departure forecast opt-in

1. Click `Skoða brottfarartíma` under `Ef lagt er af stað kl.`.

Expected:

- No fullscreen loader appears.
- A scrubber-local loading/info message appears while hourly departure status is computed.
- When ready, the departure heatmap appears.
- Selecting a future hour should switch the map to Veðurstofan forecast stations for that departure.
- `Núna` should still be available as the first slot and should switch back to current Vegagerðin route stations.

Check 4: Route alternatives

1. If more route choices appear, switch between them.

Expected:

- No full Teskeið loader between route options.
- The new route returns to now-first, with forecast opt-in collapsed again.
- No stale forecast slots from the previous route remain visible.

Do not test this casually on production until Claude has reviewed and Stebbi explicitly approves release. No SQL or production data is involved in this slice.
