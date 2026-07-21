# 2026-07-21 15:09 - TODO 086 v286 - Codex label helper + map time badge

Created: 2026-07-21 15:09
Timezone: Atlantic/Reykjavik

## Context

Stebbi asked Codex to review `2026-07-21-1500-todo-086-v285-claude-label-density`, fix/change as needed, continue into the next implementation step, and create a handoff for Claude Code.

Execution permission was explicit for code changes and handoff files. No permission was given for SQL, migrations, Supabase changes, `.env.local`, commit, push, deploy, Vercel, or production actions. None of those were done.

## Review Findings On v285

No blockers.

One correctness/UX issue was worth fixing:

- The v285 density anchor rule used the first/last item from the non-priority secondary list, not the true first/last route station. On a long route, that could make the “anchor” labels represent the first/last quiet station rather than the route’s actual first/last Veðurstofan station.

Codex fixed this by sorting status entries by route position and selecting true first/last route anchors.

## What Codex Changed

### 1. Hardened Veðurstofan label density anchors

File: `components/weather/RoadMapPrototypeMap.tsx`

Updated the long-route label selection:

- Create `routeOrderedEntries` sorted by `routeFraction`, falling back to `distanceFromOriginM`.
- If route has `<= VEDURSTOFAN_LABEL_DENSITY_THRESHOLD`, label all entries.
- If route is longer:
  - add true first route entry
  - add true last route entry
  - add every priority status from `VEDURSTOFAN_LABEL_ALWAYS_STATUSES`
  - de-dupe by `stationId:routePointId`
  - output labels in route order

This preserves v285’s main intent while making the anchors match the route rather than a status subset.

### 2. Extracted shared route wind label button helper

File: `components/weather/RoadMapPrototypeMap.tsx`

Added:

- `createRouteWindLabelElement(...)`

Both provider-specific label functions now use it:

- `createVedurstofanRouteLabel(...)`
- `createVegagerdinRouteLabel(...)`

Provider-specific logic now only decides:

- station name
- value text
- status color
- popup callback

The common helper owns:

- DOM button creation
- `aria-label`
- shared styling
- value/unit layout
- click stopPropagation/preventDefault behavior

This is the reusable step recommended in v285 and keeps the two provider label systems visually and behaviorally aligned.

### 3. Added selected-slot badge near map controls

File: `components/weather/RoadMapPrototypeMap.tsx`

When a route is active, the bottom-left map control stack now shows a compact badge using the same `displayedRouteSlotLabel` already shown in the summary:

- `Skoðar: Núna`
- or `Skoðar brottför: ...`

The badge also carries a status dot using `routeStatusColor(displayedRouteStatus)`.

This makes the time context visible on the map itself, not only in the form/summary card.

## Files Reviewed

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/2026-07-21-1500-todo-086-v285-claude-label-density.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/README.md`

## Files Changed

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-21-1509-todo-086-v286-codex-label-helper-time-badge.md`

No message files were changed in this v286 step.

Important git note:

- `components/weather/RoadMapPrototypeMap.tsx` is still untracked in the current worktree, so normal `git diff -- components/weather/RoadMapPrototypeMap.tsx` prints nothing even though the file content has changed. Use `rg` or stage-aware diffing if needed before commit.

## Commands Run

Review/read commands:

- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 Design.md`
- `Get-Content -Encoding UTF8 ai-handoff/2026-07-21-1500-todo-086-v285-claude-label-density.md`
- `git status --short`
- `rg -n "VEDURSTOFAN_LABEL|entriesToLabel|createVedurstofanRouteLabel|createVegagerdinRouteLabel|routeVedurstofanLabelMarkersRef|roadMapPrototypeViewingDeparture" ...`
- selected `Get-Content` ranges from `components/weather/RoadMapPrototypeMap.tsx`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

Verification commands:

- `npm run type-check`
  - exit code: 0

- `npm run test:run -- lib/__tests__/road-intelligence-route-slot-statuses.test.ts lib/__tests__/road-intelligence-travel-bridge-map-data.test.ts`
  - exit code: 0
  - result: 2 test files passed, 28 tests passed

- `npm run build`
  - exit code: 0
  - result: production build passed
  - warnings: existing unrelated lint warnings in:
    - `app/s/[sessionId]/page.tsx`
    - `components/landing/Avatar.tsx`
    - `components/weather/IcelandOverviewMap.tsx`
    - `components/weather/TravelAuditMap.tsx`
    - `components/weather/WeatherOverviewClient.tsx`

Git status warning:

- `git status` printed warnings about inaccessible global git ignore at `C:\Users\Lenovo/.config/git/ignore`; this did not block work.

## What Was Not Done

- No SQL or migration.
- No Supabase/RLS/auth changes.
- No feature access changes.
- No `.env.local` edits.
- No dev server start/restart.
- No commit, push, deploy, or production action.
- No route algorithm changes.
- No new API route changes.

## Design Notes

Relevant `Design.md` alignment:

- Map time badge is compact, not a new nested card.
- It uses existing semantic route status color plus text, not color alone.
- It uses existing summary label text, so there is no duplicated new user copy.
- Shared label helper keeps provider labels visually consistent.
- The bottom-left badge uses `max-w-[calc(100vw-1.5rem)]` to reduce mobile overflow risk.

## Route Intelligence Check

Route-family touched:

- Experimental Road Intelligence map route view on `/auth-mvp/vedrid/road-map-prototype`.

Provider neutrality:

- The label helper is provider-neutral at the DOM/styling layer.
- Provider-specific data interpretation remains separate:
  - Veðurstofan forecast wind values from selected slot
  - Vegagerðin measured wind/gust values

Data/privacy:

- No new route data is stored.
- No Supabase writes.
- No user route history changes.
- No Google/raw geometry persistence changes.

IcelandRoadmap impact:

- No `IcelandRoadmap.md` update was needed because this is presentation/refactor work, not new canonical route knowledge, control points, segment definitions, or station-matching rules.

## Risk Still Present

1. Browser verification is still required for actual label density.
   - TypeScript/build are green, but only visual testing can confirm the right amount of labels on long routes.

2. DOM markers still do not have real collision avoidance.
   - v286 improves density, but this is not MapLibre symbol collision.
   - If clutter remains, next step should be moving labels to a GeoJSON symbol layer or adding stronger priority rules.

3. The shared helper is still inside `RoadMapPrototypeMap.tsx`.
   - That is acceptable for this phase.
   - If another component needs the same label style, extract it into a small local utility/component.

4. Worktree remains dirty with many untracked Road Intelligence files.
   - Claude Code should be careful before any commit/release review.

## Suggested Next Step For Claude Code

Recommended next implementation step:

1. Browser-test v286 on two routes:
   - long route with many Veðurstofan stations
   - short route with few stations

2. If density is acceptable, move next into route quality:
   - inspect why Akranes -> Akureyri or similar routes still appear not to follow roads perfectly in places
   - compare rendered route geometry with road segment overlay
   - identify whether the issue is Google route geometry, simplification, MapLibre projection/rendering, or our sampled station matching

3. If density is not acceptable, implement one stronger rule before route quality:
   - show all red/orange
   - show first/last
   - show every Nth green label by route distance, not count
   - cap labels at a mobile-friendly max such as 10-12

## Questions For Claude Code

1. Does the new bottom-left time badge overlap attribution/legend on 390px and 546px widths?

2. Are true first/last Veðurstofan anchor labels actually useful, or should anchors be nearest named places instead of weather stations?

3. Should the shared label helper include a provider marker later, e.g. measured vs forecast, or is that extra complexity too soon?

4. Can Claude Code confirm whether all map labels and circles still hide/show together when status pills are toggled?

## Localhost Checks For Stebbi

Use the existing local dev server. Codex did not start or restart it.

URL:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Required state:

- signed in
- `ROAD_INTELLIGENCE_V1_ENABLED=true`
- current user has `road-intelligence-v1` feature access

Checks:

1. Calculate `Reykjavík` -> `Akureyri`.
2. Confirm the bottom-left map controls show a small badge saying `Skoðar: Núna`.
3. Select a future scrubber slot.
4. Confirm the bottom-left badge changes to `Skoðar brottför: ...`.
5. Confirm the summary and bottom-left badge agree.
6. Confirm the status dot color in the bottom-left badge follows the selected slot status.
7. On a long route with many Veðurstofan stations, confirm the map is not covered in green labels.
8. Confirm red/orange Veðurstofan station labels still show.
9. Confirm first/last route station anchors show even when the route is mostly green.
10. Toggle `Einfalt` / `Nánar` and status pills.
11. Confirm labels and circles hide/show together.
12. Click both a label and a circle; confirm popups still open and use the selected slot data.
13. Press `Hreinsa`; confirm old labels disappear.
14. Calculate a different route; confirm old labels do not remain.

Do not test casually:

- Supabase writes
- SQL migrations
- production cron
- deploy/Vercel
- feature access changes

Those require separate explicit approval.

## Óvissa / þarf að staðfesta

Confidence: medium-high.

Code verification is green, but the real success criteria are visual:

- label density
- map overlap
- mobile readability
- whether true first/last station anchors feel helpful to Stebbi

Those need localhost/browser review.
