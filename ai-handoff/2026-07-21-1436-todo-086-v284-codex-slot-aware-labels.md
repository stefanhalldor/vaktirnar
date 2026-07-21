# 2026-07-21 14:36 - TODO 086 v284 - Codex slot-aware labels

## Context

Stebbi asked Codex to review `2026-07-21-1400-todo-086-v283-claude-slot-aware-summary`, fix/improve code as needed, and take the next execution step.

Execution permission was explicit for code changes and handoff. No permission was given for commit, push, deploy, SQL/migrations, Supabase writes, env edits, or production changes. None of those were done.

## Plan

1. Review v283 with focus on whether selected scrubber slots actually update the visible route answer/status.
2. Keep the implementation aligned with existing reusable pieces:
   - `WindDisplayStatus`
   - `WindStatusFilterPills`
   - provider-aware slot status helpers
   - existing MapLibre marker/popup pattern
3. Add the next safe user-visible step:
   - make the selected slot visible in the route summary
   - make Veðurstofan route station wind numbers visible on the map, similar to Vegagerðin labels
4. Verify with type-check, targeted tests, and production build.
5. Produce this handoff for Claude review.

## What Codex Changed

### 1. Selected scrubber slot is now explicit in the summary

File: `components/weather/RoadMapPrototypeMap.tsx`

The route summary now shows whether the user is viewing:

- `Skoðar: Núna`
- or `Skoðar brottför: {time}`

When a scrubber slot is selected, a small `Núna` button appears and calls `handleSelectCandidateIdx(null)`. That resets:

- the summary badge/answer back to current view
- the Veðurstofan station forecast selection back to current-time anchoring

This closes the main UX gap left after v283: the badge could change, but the user had no obvious label explaining which departure time the badge represented.

### 2. Veðurstofan station wind labels on the route

File: `components/weather/RoadMapPrototypeMap.tsx`

Added a Veðurstofan label marker path parallel to the existing Vegagerðin one:

- `RouteVedurstofanLabelMarker`
- `routeVedurstofanLabelMarkersRef`
- `clearRouteVedurstofanLabelMarkers`
- `updateVedurstofanLabelMarkerState`
- `openVedurstofanRouteStationPopup`
- `createVedurstofanRouteLabel`

The labels show the selected forecast row wind value as `{value} m/s`.

They reuse the existing `WindDisplayStatus` colors through:

- `displayWindStatus`
- `routeStatusIsVisible`
- `WIND_STATUS_MARKER_COLOR`

This means the same simple/detailed filter mode and the same filter pills control both the map circles and the DOM wind labels.

### 3. Veðurstofan popup is now slot-aware too

File: `components/weather/RoadMapPrototypeMap.tsx`

The circle click handler now looks up the same `VedurstofanRouteStatusEntry` used by the label, then opens the same popup helper.

Result:

- clicking the circle and clicking the label should show the same station
- popup wind/time should match the selected scrubber slot
- stale note remains visible for stale Veðurstofan rows

### 4. i18n strings

Files:

- `messages/is.json`
- `messages/en.json`

Added:

- `roadMapPrototypeViewingDepartureNow`
- `roadMapPrototypeViewingDepartureAt`
- `roadMapPrototypeReturnToNow`

Note: both messages files already contain large uncommitted prototype-string additions from previous work. Codex only added these three keys inside that existing block.

## Files Reviewed

- `ai-handoff/2026-07-21-1400-todo-086-v283-claude-slot-aware-summary.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `lib/weather/providers/vedurstofanBlend.ts`
- `lib/road-intelligence/routeSlotStatuses.ts`
- `lib/road-intelligence/vegagerdinRouteLayer.ts`
- `messages/is.json`
- `messages/en.json`
- `Design.md`
- `WORKFLOW.md`
- `ai-handoff/README.md`

## Files Changed

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-21-1436-todo-086-v284-codex-slot-aware-labels.md`

## Commands Run

Read/review commands:

- `rg ... components/weather/RoadMapPrototypeMap.tsx`
- `rg ... messages/is.json messages/en.json`
- selected `Get-Content` ranges for relevant source files
- `git status --short`
- `git diff -- components/weather/RoadMapPrototypeMap.tsx messages/is.json messages/en.json`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

Verification commands:

- `npm run type-check`
  - exit code: 0
  - result: TypeScript passed.

- `npm run test:run -- lib/__tests__/road-intelligence-route-slot-statuses.test.ts lib/__tests__/road-intelligence-travel-bridge-map-data.test.ts`
  - exit code: 0
  - result: 2 test files passed, 28 tests passed.

- `npm run build`
  - exit code: 0
  - result: production build passed.
  - warnings: existing lint warnings in unrelated files:
    - `app/s/[sessionId]/page.tsx`
    - `components/landing/Avatar.tsx`
    - `components/weather/IcelandOverviewMap.tsx`
    - `components/weather/TravelAuditMap.tsx`
    - `components/weather/WeatherOverviewClient.tsx`
  - no new build/type failure from this patch.

Other notes:

- `git status --short` printed warnings about inaccessible global git ignore at `C:\Users\Lenovo/.config/git/ignore`. This did not block status output.

## What Was Not Changed

- No SQL or migrations.
- No Supabase/RLS/auth changes.
- No environment variable changes.
- No feature_access changes.
- No route matching algorithm changes.
- No route geometry/snap-to-road changes.
- No commit, push, deploy, or production action.
- No localhost dev server start/restart.

## Review Findings From v283

No blocking issue found in the v283 approach. The “derive displayed route status from selected slot” approach is appropriate because it avoids extra state synchronization.

Main gap found:

- v283 updated the badge/answer, but not enough UX context was shown. Users could click a future slot and see the route answer change without a visible “you are looking at this departure” label.

Codex fixed that gap.

## Design Notes

This stays within the existing prototype surface:

- no new floating card inside a card
- no nested UI cards
- compact mobile controls
- translated text in `messages`
- touch target for reset-to-now is `min-h-7`
- route status filter mode still uses the existing segmented control

The Veðurstofan labels are DOM marker buttons, matching the existing Vegagerðin label pattern. This is acceptable for the prototype and keeps behavior easy to verify. Later, if label density becomes too high, extract a provider-neutral label helper and add collision/priority rules.

## Risk Still Present

1. Label density on routes with many Veðurstofan stations may get noisy.
   - Current implementation labels all valid Veðurstofan route stations.
   - This was intentional because Stebbi asked to show wind numbers immediately.
   - Next step may need priority/collision handling if the map gets crowded.

2. `maplibre-gl.Marker` DOM markers are separate from style-layer filtering.
   - Codex updated label state whenever filter mode/status selection changes.
   - Needs browser confirmation that labels and circles hide/show together.

3. MET/Yr fallback points
   - Current code already empties/folds the MET/Yr point source in `renderTravelBridgeResult`.
   - If Stebbi still sees old MET/Yr dots, check stale bundle/dev refresh or whether another layer is being mistaken for MET/Yr.

4. Existing worktree is very dirty/uncommitted.
   - `RoadMapPrototypeMap.tsx` itself is still untracked in git status.
   - Claude should be careful not to interpret lack of `git diff` for that file as “no changes”; untracked files do not show in normal `git diff`.

## Suggested Next Step

Next implementation batch should make this route calculation feel more like a real travel assistant:

1. Add route station label density rules:
   - always show red/orange
   - show all if route station count is small
   - show first/middle/last green labels if route is long and all green

2. Add selected-slot visual highlight on the map:
   - when user selects a departure slot, labels/popups already update
   - add a subtle text or time badge near the route summary/legend so the map itself also feels time-aware

3. Start provider-neutral extraction:
   - extract shared label creation styling for Vegagerðin + Veðurstofan
   - keep provider-specific value formatting separate

4. Continue toward the bigger goal:
   - improve route geometry matching so Reykjavík -> Akureyri follows the intended road more tightly
   - keep using Veðurstofan/Vegagerðin first, MET/Yr only as fallback

## Questions For Claude

1. Should Veðurstofan labels display only wind speed, or include direction in a second compact line when available?

2. Should labels be all-provider visible by default, or should we immediately implement priority/collision rules to avoid clutter?

3. Do we want a provider-neutral `createRouteWindLabel` helper now, or wait until label density rules settle?

4. Please verify in browser whether MET/Yr points are truly hidden. Code says they should be, but Stebbi previously saw too many route weather points.

## Supabase / SQL / Production

No SQL was written or run.

No Supabase tables, RLS policies, grants, auth logic, service-role calls, user data, secrets, billing, deployment, or production state were touched.

## Route intelligence check

Expected state after this patch:

1. On `/auth-mvp/vedrid/road-map-prototype`, enter a route such as `Reykjavík` -> `Akureyri`.
2. The map should show the route line and provider station markers/labels.
3. Vegagerðin labels should continue to show measured wind/gust values.
4. Veðurstofan labels should now show forecast wind values without requiring a click.
5. The status badge and route answer should match the selected scrubber slot.
6. When the selected slot changes, Veðurstofan label values and popups should update to that slot’s forecast anchoring.
7. Pressing `Núna` in the route summary should reset selected slot state and return the summary/labels to current anchoring.

## Localhost checks for Stebbi

Use your normal local dev server; Codex did not start or restart it.

Page:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Required setup:

- be signed in
- `ROAD_INTELLIGENCE_V1_ENABLED=true` locally
- your user has `road-intelligence-v1` feature access

Checks:

1. Open the prototype route.
2. Enter `Reykjavík` -> `Akureyri` and press `Reikna`.
3. Confirm the route summary shows `Skoðar: Núna`.
4. Confirm Vegagerðin and/or Veðurstofan wind labels are visible on route stations.
5. Click a future slot in the scrubber.
6. Confirm the top badge/answer changes if that slot has a different provider status.
7. Confirm the summary now says `Skoðar brottför: ...`.
8. Confirm Veðurstofan labels/popups update to the selected slot.
9. Click `Núna`.
10. Confirm the summary goes back to `Skoðar: Núna` and station labels/popups return to current anchoring.
11. Toggle `Einfalt` / `Nánar`.
12. Confirm map labels and filter pills use the same status grouping.
13. Click status filter pills.
14. Confirm map labels and circles hide/show together.

Regression checks:

- route clear removes Veðurstofan and Vegagerðin labels
- reopening a different route does not leave old labels behind
- no MET/Yr sampled weather-point dots appear as route weather points when provider station layers are available
- map still pans/zooms on mobile without the labels blocking normal map interaction too aggressively

Do not test:

- Supabase writes
- SQL migrations
- production cron
- deploy or Vercel production

Those require separate explicit approval.
