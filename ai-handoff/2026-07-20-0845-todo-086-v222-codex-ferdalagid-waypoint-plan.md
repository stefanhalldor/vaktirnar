# Codex Handoff: Viðkomustaður Between Frá And Til

**Created:** 2026-07-20 08:45 Atlantic/Reykjavik  
**Agent:** Codex  
**Related area:** todo-086, `/vedrid`, `/vedrid/ferdalagid`, route memory, route options  
**Scope:** Plan/handoff only. No code, SQL, migration, commit, push, deploy, or production action was performed.

## User Request

Stebbi is exploring a better way to make curated/weather-aware routes usable without hard-coding every route manually.

Immediate requested direction:

- Add an optional `Viðkomustaður` between `Frá` and `Til` in the first step of `/vedrid/ferdalagid`.
- Example route: `Reykjavík -> Hólmavík -> Ísafjörður`.
- When calculated, it should be usable as:
  1. `Reykjavík -> Hólmavík`
  2. `Hólmavík -> Ísafjörður`
  3. `Reykjavík -> Ísafjörður`, through `Hólmavík`
- Later thought: `/vedrid` could become smarter and guide the user toward a useful destination/route by suggesting a stopover, but this handoff should start with the manual waypoint.

## Important Constraints

- Do not weaken RLS.
- Do not store raw Google route geometry, Google steps, raw addresses, raw Google place IDs, user IDs, or user-private travel history in global route memory.
- Keep the first implementation small: one optional waypoint only.
- User-facing text belongs in `messages/is.json` and `messages/en.json`.
- UI must follow `Design.md`: mobile-first, app-like, no horizontal overflow, no unwanted mobile zoom, compact controls, visible loading/pending state for route calculations.
- Route logic should honor `IcelandRoadmap.md`: route matching must remain explicit and reviewable, and route intelligence should avoid brittle place-name hacks.

## Current Code Context

Files inspected by Codex:

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `components/weather/RouteSelectionStep.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/iceland-routes/routeDraft.ts`
- `lib/weather/provider.types.ts`
- `lib/weather/google.server.ts`
- `lib/weather/providerRouteMatching.ts`
- `lib/weather/trip.ts`

Relevant findings:

- `RouteSelectionStep` currently has only `origin` and `destination` props, plus `ActiveField = 'origin' | 'destination' | null`.
- The route-selection map currently draws `routeOptions` and fits bounds around `origin` and effective destination.
- `FerdalagidClient` keeps `origin` and `destination` state only.
- `FerdalagidClient` fetches route options with:
  - `POST /api/teskeid/weather/travel/routes`
  - body `{ origin, destination: effectiveDest }`
- `lib/iceland-routes/routeDraft.ts` is schema version 1 and stores only `{ from, to, savedAtIso }` in sessionStorage.
- `app/api/teskeid/weather/travel/routes/route.ts` currently accepts only `origin` and `destination`, calls `provider.getRouteOptions(originCandidate, destCandidate)`, sorts by duration, and warms route memory for every returned option.
- Route memory warming already stores `routeVariantKey`, `routeVariantLabel`, provider station IDs, station order, and `routeCautionIds` when SQL 87 exists.
- `lib/weather/trip.ts` already has conceptual support for `TripStopKind = 'waypoint'` and `WeatherTripMode = 'multi_stop_trip'`, but the active UI/API path does not use it yet.

## Recommended MVP

Implement exactly one optional waypoint between `Frá` and `Til`.

Suggested user flow:

1. User selects `Frá`.
2. Between `Frá` and `Til`, show a compact secondary control:
   - `+ Bæta við viðkomustað`
3. If clicked, show a `Viðkomustaður` `PlaceSearch` field between the two existing fields.
4. Once selected, show it as a compact selected-place row with:
   - a distinct marker dot color, for example muted amber or teal
   - place name
   - optional formatted address
   - `X` clear/change button
5. Route options should calculate for `Frá -> Viðkomustaður -> Til`.
6. Confirming a route should continue into existing weather assessment as one continuous trip.

Keep multiple waypoints out of the first release. The component/API shape can use an array internally, but validation should enforce max 1 for now.

## Product Decisions To Preserve

The waypoint must not depend on a manually curated static place list.

This is important because recent issues around `Stóra-Borg` and `Borgarnes` showed that static/regex-only place recognition is fragile. A user-selected Google place should be enough to calculate and, when privacy-safe normalization succeeds, warm route memory.

Recommended route memory behavior:

- If `Frá`, `Viðkomustaður`, and `Til` normalize to safe public route-memory keys, persist all three useful rows:
  - `from -> waypoint`
  - `waypoint -> to`
  - `from -> to` with a via variant
- If one place cannot normalize safely, still calculate the route for the user, but skip global route-memory persistence for that missing key instead of inventing risky/private keys.

## Technical Plan

### 1. Extend RouteSelectionStep

Likely file:

- `components/weather/RouteSelectionStep.tsx`

Add props:

- `waypoint: RoutePlace | null`
- `onWaypointSelected: (p: RoutePlace) => void`
- `onClearWaypoint: () => void`
- optional `waypointEnabled?: boolean`, default `true`

Update active field type:

```ts
type ActiveField = 'origin' | 'waypoint' | 'destination' | null
```

Update field progression:

- If no origin: active `origin`
- If origin exists and waypoint field is open but empty: active `waypoint`
- If origin exists and no destination: active `destination`
- If all required fields exist: active `null`

Saved-place filtering should exclude all already selected places, not just the opposite endpoint.

Map changes:

- Add a waypoint marker when selected.
- Include waypoint in bounds.
- Fallback line should draw `origin -> waypoint -> destination` when waypoint exists.
- Existing returned route polylines can remain the source of truth once route options load.

### 2. Extend FerdalagidClient State

Likely file:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Add:

- `const [waypoint, setWaypoint] = useState<RoutePlace | null>(null)`

State resets:

- Clearing origin/destination should invalidate route options as today.
- Setting or clearing waypoint must also invalidate route options, selected route id, result, fallback, and any restored-route coordinate cache.

Fetch dependencies:

- Route-options effect should include waypoint coordinates/name.
- Body should include `waypoints: waypoint ? [waypoint] : []`.

Confirm disabled:

- Same as today for origin/destination.
- Do not require waypoint.
- If waypoint exists, require route options/fallback that correspond to the waypoint state.

### 3. Extend Overview Route Draft

Likely file:

- `lib/iceland-routes/routeDraft.ts`

Move to schema version 2:

```ts
export interface OverviewRouteDraft {
  from: RouteDraftPlace
  to: RouteDraftPlace
  via?: RouteDraftPlace[]
  savedAtIso: string
}
```

Recommended function signature:

```ts
writeOverviewRouteDraft(from, to, options?: { via?: RouteDraftPlace[] })
```

Backward compatibility:

- `readOverviewRouteDraft()` should continue accepting v1 drafts with only `from` and `to`.
- v2 drafts may contain `via`, but MVP should accept only zero or one item.
- Keep TTL at 5 minutes.

Tests:

- Update `lib/__tests__/overview-route-draft.test.ts`.
- Add coverage that v1 drafts still hydrate.
- Add coverage that v2 drafts preserve one waypoint.
- Add coverage that malformed or too-large `via` returns null or clamps according to the chosen contract.

### 4. Extend Route Options API

Likely file:

- `app/api/teskeid/weather/travel/routes/route.ts`

Recommended body:

```ts
{
  origin,
  destination,
  waypoints?: Array<{ name: string; lat: number; lon: number; placeId?: string; formattedAddress?: string }>
}
```

Validation:

- `waypoints` optional.
- MVP: `waypoints.length <= 1`.
- Each waypoint must pass the same shape validation as origin/destination.
- If more than one waypoint is sent, return 400 with a stable error code like `too_many_waypoints`.

Recommended route calculation approach for MVP:

- Do not change provider type at first.
- Use existing `provider.getRouteOptions(from, to)` twice:
  1. `origin -> waypoint`
  2. `waypoint -> destination`
- Pick the best/default leg route for each leg initially and return one composed route option.

Composed route option:

- `id`: stable client-safe string, for example `via:${waypointKey}:default`
- `routeIndex`: `0`
- `provider`: `'google'`
- `labels`: include a new label such as `CURATED_VIA_USER_WAYPOINT`
- `description`: `Gegnum {waypoint label}` or localized via route option label
- `distanceM`: sum of both leg distances
- `durationS`: sum of both leg durations
- `points`: concatenate leg points, dropping the duplicate waypoint boundary point
- `providerMatchingPoints`: concatenate leg provider matching points, also dropping duplicate boundary
- `cautions`: union cautions from both legs by `id`
- `isDefault`: true

Why this is preferred for MVP:

- It avoids changing the provider adapter contract before needed.
- It keeps station matching and route-memory warming based on the same geometry that the user sees.
- It naturally supports Stebbi's triplicate route-memory requirement.
- It avoids a combinatorial explosion of leg alternatives.

Later enhancement:

- If needed, extend `WeatherMapProvider.getRouteOptions()` to accept `intermediates` and use native Google intermediates.
- If leg alternatives matter, combine top N leg alternatives with a hard cap, for example max 4 composite options.

### 5. Route Memory Warming

Likely files:

- `app/api/teskeid/weather/travel/routes/route.ts`
- `lib/weather/routeMemory.server.ts`
- `lib/iceland-routes/routePlaceNormalization.ts`

For a waypoint route, write route memory for:

1. `origin -> waypoint`
2. `waypoint -> destination`
3. `origin -> destination`, variant key `via:{waypointKey}` or similarly stable, with label `Gegnum {waypointLabel}`

Important:

- The composite `origin -> destination via waypoint` route should be preserved by dedupe/cleanup logic.
- Any cleanup rule that removes "similar" variants must not collapse away a `via:` variant just because it shares endpoints with a direct/default route.
- For the composite row, run station matching over the composed route polyline if possible. This gives correct station order and avoids duplicated stations at the leg boundary.
- Dedupe stations by `(provider, stationId)` before writing, preserving first route order.
- Do not store raw route geometry.

Normalization:

- Prefer safe dynamic normalized keys from selected public place labels.
- Do not require adding every place to `routePlaces.ts`.
- Do not store raw Google place IDs.
- Do not store raw formatted addresses in route memory.
- If the selected place label is ambiguous or normalization fails, calculate route options but skip global route-memory for that leg/composite.

### 6. Travel Result API

Likely file:

- `app/api/teskeid/weather/travel/route.ts`

Inspect before implementation. It currently appears to call route options/geometry for origin and destination as a single pair.

The final "Nota þessa leið" flow must not accidentally recalculate a direct `origin -> destination` route and discard the waypoint.

Acceptable implementation paths:

- Preferred: when a composed route option has been selected in step 1, pass that route geometry/metadata through to the travel-result API so it evaluates the same continuous route the user selected.
- Alternative: extend the travel-result API to accept the same `waypoints` array and compose the route server-side again.

Avoid:

- Showing a route through the waypoint in step 1, then assessing weather on the direct route in the result step.

### 7. `/vedrid` Follow-up

No immediate `/vedrid` UI change is required for the first waypoint implementation, unless route-memory pills already appear automatically.

Expected behavior after route-memory warming:

- On `/vedrid`, choosing `Reykjavík -> Ísafjörður` should be able to show a route pill like `Gegnum Hólmavík` once the composite memory row exists.

Later smart guidance idea:

- If `/vedrid` has a direct route with poor coverage or dangerous weather, and there is a known `via:` route memory variant with better weather/station coverage, suggest it as a route pill or lightweight prompt.
- Do this as a later, separate plan. It needs product wording and ranking rules.

## User-Facing Text

Add translations in both locales.

Likely Icelandic strings:

- `waypointLabel`: `Viðkomustaður`
- `addWaypoint`: `Bæta við viðkomustað`
- `routeSelectWaypointPrompt`: `Veldu viðkomustað`
- `changeWaypoint`: `Breyta viðkomustað`
- `clearWaypoint`: `Fjarlægja viðkomustað`
- `routeOptionViaWaypoint`: `Gegnum {waypoint}`
- `tooManyWaypoints`: `Aðeins einn viðkomustaður er studdur í þessari útgáfu.`

Keep wording short and informal.

## Design Notes

From `Design.md`, the implementation should:

- Fit cleanly on 360-460 px mobile widths.
- Avoid horizontal overflow in selected place rows and route option labels.
- Keep input font size at least 16 px to avoid iOS zoom.
- Keep the waypoint control compact between `Frá` and `Til`.
- Avoid making a large explanatory card.
- Show a visible loading state while route options are recalculated.
- Preserve existing map interaction and avoid layout jumps when the waypoint is added or removed.

Suggested UI shape:

- `Frá`
- small add/select row for `Viðkomustaður`
- `Til`
- provider layer pill
- map
- route options

## Route Intelligence Check

This change touches route intelligence.

Checklist:

- Does it hard-code a place? No, not in the proposed MVP.
- Does it create durable route-memory variants? Yes, but only from user-confirmed route calculations.
- Does it need SQL? Not for MVP if `route_variant_key` and `route_variant_label` are enough.
- Does it interact with SQL 87? Only if route cautions are stored for waypoint/composite options. SQL 87 must already be applied in environments where `routeCautionIds` writes are expected.
- Does it need `IcelandRoadmap.md` changes? Not required for the first implementation, unless Claude Code adds reusable waypoint route policy or a new registry. If so, update the roadmap docs in the same branch.
- Privacy risk? Low if route memory stores only normalized public place keys/labels, route variant key/label, caution IDs, and provider station IDs.

## Testing Plan

Recommended commands after implementation:

- `npm run type-check`
- `npm run test:run`
- `npm run build`

Recommended focused tests:

- `lib/__tests__/overview-route-draft.test.ts`
  - v1 draft still reads.
  - v2 draft with one waypoint reads.
  - expired v2 draft returns null.
  - malformed waypoint returns null.
- Route-options API tests if this project has API route unit coverage:
  - no waypoint behaves exactly as before.
  - one waypoint returns one composed route option.
  - more than one waypoint returns 400.
  - composed route distance/duration are sums.
  - composed points preserve leg order and do not duplicate the boundary point.
  - route-memory warming is called for leg 1, leg 2, and composite route when all places normalize.
- UI/component tests if practical:
  - `Bæta við viðkomustað` opens waypoint search.
  - selected waypoint appears between origin and destination.
  - clearing waypoint refetches direct route options.
  - saved-place lists do not show already selected origin/waypoint/destination.

## Commands Run By Codex

All commands were read-only except creating this handoff file.

- `rg -n "origin|destination|waypoint|RouteSelectionStep|readOverviewRouteDraft|writeOverviewRouteDraft|/api/teskeid/weather/travel/routes" "app/auth-mvp/vedrid/FerdalagidClient.tsx"` - exit 0
- `rg -n "export type RouteOption|interface RouteProvider|getRouteOptions|PlaceCandidate|matchingPoints|providerMatchingPoints" lib/weather lib/iceland-routes app/api/teskeid/weather/travel` - exit 0
- `Get-ChildItem -File ai-handoff | Sort-Object LastWriteTime -Descending | Select-Object -First 8 Name,LastWriteTime,Length` - exit 0
- `Get-Content` snippets from `components/weather/RouteSelectionStep.tsx`, `lib/iceland-routes/routeDraft.ts`, `lib/weather/provider.types.ts`, and `app/api/teskeid/weather/travel/routes/route.ts` - exit 0
- `Get-Date -Format "yyyy-MM-dd HH:mm"` - exit 0

No tests, build, lint, SQL, migration, commit, push, deploy, or production command was run.

## Files Changed By Codex

- `ai-handoff/2026-07-20-0845-todo-086-v222-codex-ferdalagid-waypoint-plan.md`

No application source file was changed.

## Risks And Open Questions For Claude Code

1. Route-result mismatch risk:
   - Make sure the result step assesses the waypoint route, not a recalculated direct route.

2. Route-memory cleanup risk:
   - Existing dedupe/cleanup must not delete `via:` variants as duplicates of direct endpoint variants.

3. Place-normalization risk:
   - Do not repeat the Stóra-Borg/Borgarnes problem by requiring every useful place to be predeclared in a static registry.

4. API cost/performance:
   - One waypoint means two Google route-option calls. This is acceptable for MVP, but keep loading/pending states clear and usage logging non-sensitive.

5. Multiple alternatives:
   - Decide whether MVP returns exactly one composite route or combines top leg alternatives. Codex recommends exactly one composite route first.

6. Vestmannaeyjar/ferry interaction:
   - If destination is Vestmannaeyjar and a waypoint is also set, define route order carefully:
     - likely `origin -> waypoint -> selected ferry port`, then final destination context remains Vestmannaeyjar.
   - This needs a quick explicit test.

7. Auth/public behavior:
   - Waypoint route calculation should work for public users according to existing feature access rules.
   - Do not introduce user-specific persistence unless a separate authenticated/RLS-protected saved-routes feature is added later.

## Suggested Next Step

Claude Code should implement the MVP in one small branch/patch:

1. Add one optional waypoint field to route selection UI.
2. Extend route draft and tests for optional `via`.
3. Extend route-options API for `waypoints.length <= 1`.
4. Compose a single route option from two existing provider calls.
5. Ensure final travel result uses the same composed route.
6. Warm route memory for leg 1, leg 2, and composite route.
7. Run type-check, tests, and build.
8. Return a prerelease handoff to Codex before deployment.

## Localhost Checks For Stebbi

After Claude Code implements the change, Stebbi should test on localhost.

Recommended page:

- `/auth-mvp/vedrid/ferdalagid`

Test 1: basic waypoint route

1. Select `Frá`: `Reykjavík`.
2. Click `Bæta við viðkomustað`.
3. Select `Viðkomustaður`: `Hólmavík`.
4. Select `Til`: `Ísafjörður`.
5. Expected:
   - Waypoint appears between `Frá` and `Til`.
   - Map route visibly goes through Hólmavík.
   - Route option label clearly says `Gegnum Hólmavík` or equivalent.
   - No horizontal overflow or mobile zoom.

Test 2: clearing waypoint

1. Clear `Viðkomustaður`.
2. Expected:
   - Route options refetch for direct `Reykjavík -> Ísafjörður`.
   - Old via route is not still selected.
   - Map no longer draws through Hólmavík.

Test 3: final result

1. Re-add `Hólmavík` as waypoint.
2. Select the composed route.
3. Continue to the weather result.
4. Expected:
   - Weather stations and route summary match the route through Hólmavík, not the direct route.

Test 4: route memory on `/vedrid`

1. After completing/calculating the waypoint route, open `/vedrid`.
2. Select `Frá`: `Reykjavík`.
3. Select `Til`: `Ísafjörður`.
4. Expected after refresh if route memory warmed successfully:
   - A route pill such as `Gegnum Hólmavík` appears.
   - Selecting it filters the map to the stations for that via route.

Test 5: mobile layout

1. Use a 390 px mobile viewport.
2. Repeat Test 1.
3. Expected:
   - `Frá`, `Viðkomustaður`, and `Til` fit without overlap.
   - Route cards and buttons remain tappable.
   - Keyboard/focus does not leave the page in a broken scroll state.

Safety note:

- Do not run SQL or production cleanup while testing this UI.
- Route-memory writes on localhost should target only the intended local/dev Supabase environment unless Stebbi explicitly decides to test production behavior.
