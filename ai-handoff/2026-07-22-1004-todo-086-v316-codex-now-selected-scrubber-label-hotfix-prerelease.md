# TODO-086 / v316 Codex Prerelease Handoff

## Context

Stebbi reported that the Road Intelligence prototype at `/auth-mvp/vedrid/road-map-prototype` still did not open with `Núna` visibly selected, froze while route alternatives were searched, did not show hourly departure slots, allowed route labels to drift away from their stations on zoom, missed start/end labels, and showed the unwanted message:

`Náði ekki að reikna alla spátímana. Núna-staðan er samt tilbúin.`

Stebbi gave explicit execution permission for these fixes. No SQL, commit, push, deploy, env, Supabase, or production action was performed.

## Plan

1. Make `Núna` a real selected scrubber index (`0`) instead of relying on `null` as a special selection state.
2. Keep the map usable immediately after route calculation by delaying background route-alternative/surface analysis until after the route has rendered.
3. Let the scrubber show generated hourly slots even if provider slot scoring fails, without surfacing a full UI error message.
4. Simplify route station label placement so wind value and station name move together and stay close to the station point.
5. Strengthen start/end route labels using the entered `Frá` and `Til` names already passed into route calculation.
6. Remove the unwanted hourly-error translation keys.

## What Changed

### `components/weather/DepartureHeatmap.tsx`

- The special first `Núna` slot now calls `onSelectIdx(0)` instead of `onSelectIdx(null)`.
- The component still supports `selectedIdx=null` for older callers, but route mode now has a normal selected index for the first slot.

### `components/weather/RoadMapPrototypeMap.tsx`

- `handleSelectCandidateIdx()` now normalizes `null` to `0`, so any old caller still lands on `Núna`.
- The initial successful route calculation now calls `setSelectedCandidateIdx(0)` when the first route candidate exists.
- Displayed route status/answer only switch to a forecast-slot answer when `selectedCandidateIdx > 0`; index `0` remains the `Núna` state.
- Route status counts now use the Vegagerðin/now route station counts when selected index is `0`.
- Future departure slots are still placed into the scrubber when a timeline exists. If Veðurstofan slot scoring fails or is unavailable, future slots get `no_data` overrides instead of hiding the entire timeline behind an error.
- The unwanted `routeForecastBuildStatus === 'error'` user-facing message path was removed from `routeScrubberStatusText`.
- Route surface-choice loading is delayed by `1200ms` and only then sets `routeSurfaceChoicesStatus('loading')`, so the map can paint and accept gestures before the extra route/surface work starts.
- `routeLabelPlacementForPoint()` now returns a stable vertical marker placement anchored close to the station. This removes the previous dynamic left/right placement that could make labels appear far from the point after zooming.
- Route station labels get a slightly higher z-index and GPU transform hint.
- Start/end labels are a bit stronger visually: larger, higher z-index, wider max width.

### `messages/is.json` and `messages/en.json`

- Removed the hourly failure strings:
  - IS: `roadMapPrototypeScrubberHourlyError`
  - EN: `roadMapPrototypeScrubberHourlyError`

## Files Inspected

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`

## Files Changed

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-22-1004-todo-086-v316-codex-now-selected-scrubber-label-hotfix-prerelease.md`

Unrelated dirty file observed but not touched:

- `.obsidian/workspace.json`

Pre-existing untracked handoff files were also observed and not modified.

## Commands Run

- `npm run type-check`
  - Exit code: `0`
- `npm run test:run -- road-intelligence-route-slot-statuses`
  - Exit code: `0`
  - Result: `1` test file passed, `25` tests passed
- `git diff --check`
  - Exit code: `0`
  - Only CRLF warnings, no whitespace errors
- `git status --short`
  - Exit code: `0`
  - Shows the expected changed files plus pre-existing dirty/untracked files

## What Was Not Done

- No browser automation was run.
- No dev server was started or restarted.
- No commit, push, deploy, SQL, migration, Supabase, Vercel, or env changes were made.
- This does not yet implement full next-day `Sækja meira` fetching semantics. It only prevents the first hourly timeline from disappearing when scoring is unavailable.

## Risk / Things For Claude Code To Review

- Confirm that selecting `Núna` as real index `0` does not regress any old `/ferdalagid` scrubber behavior. `DepartureHeatmap` keeps backward `null` support, but this should be checked.
- Future slots with provider scoring failure now render as `no_data` instead of hiding. That is better than an error banner, but Claude Code should confirm whether future `no_data` slots should be selectable or visually disabled.
- The stable vertical label placement is intentionally simpler. It should keep labels tied to points, but may create more vertical crowding on dense routes. This is a safer prototype default than labels drifting away.
- Delaying surface choices by `1200ms` should reduce map freeze. If the browser still freezes, the next step is to move route alternative/surface matching behind an explicit async queue or separate endpoint rather than only delaying it.

## Suggested Next Step

Claude Code should run a manual browser pass on localhost and verify the state transitions:

1. Route calculation opens with `Núna` visibly selected.
2. The map is interactive before `Leita að fleiri leiðum...` starts.
3. Vegagerðin route stations are visible for `Núna`, with wind labels and station names moving together during zoom/pan.
4. Hourly slots appear in the scrubber after the background calculation starts or completes.
5. The removed failure message no longer appears.

If any of those still fail, the next likely root cause is a stale client state path after `calculateResolvedRoute()` or the route-surface fetch doing too much synchronous client work.

## Supabase / SQL

No SQL file was created or changed. No migration was run. No RLS, grants, auth, policies, functions, production data, secrets, or Supabase settings were touched.

## Localhost Checks For Stebbi

Open:

`http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Recommended setup:

- Be logged in as a user with `road-intelligence-v1`.
- Keep `ROAD_INTELLIGENCE_V1_ENABLED=true` locally.
- Use the same route examples that failed before, especially:
  - `Akureyri -> Egilsstaðir`
  - `Ísafjörður -> Reykjavík`

Check these exact things:

1. Click `Reikna`.
2. Expected: sidebar closes, Teskeið loader shows only while the first `Núna` route is calculated.
3. Expected: map opens with `Núna` visibly selected in the scrubber, not with no selected slot.
4. Expected: the route station pill counts match the route stations visible for `Núna`, not the old `80` sampled forecast points.
5. Expected: Vegagerðin/current route station wind labels and station names stay close together when zooming in/out.
6. Expected: start and destination labels appear near the route ends using the entered place names.
7. Expected: the message `Náði ekki að reikna alla spátímana...` is gone.
8. Expected: `Leita að fleiri leiðum...` may appear after a short delay, but the map should already be usable.
9. Expected: the scrubber should get hourly slots after background work. If future slots are grey/no-data, that means provider scoring failed but the UI did not collapse.

Do not test production deployment, Supabase changes, SQL, env changes, or feature-flag changes as part of this localhost pass unless Stebbi gives separate explicit approval.
