# TODO-067 v206 - Codex handoff - Curated route registry

Created: 2026-07-08 13:48  
Timezone: Atlantic/Reykjavik  
Relevant TODO: TODO-067, Ferðaveðrið route fidelity

## Context

Stebbi confirmed on localhost that v203 finally returns the expected Garðabær -> Þorlákshöfn route via Þrengslavegur/Leið 39:

- curated route: about 56 km / 57 min / `Þrengslavegur/Leið 39`
- Google default route: about 67 km / 58 min / `Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427`
- provider diagnostics showed `curatedAdded: true`

Stebbi then asked whether this solves the issue everywhere in Iceland. Codex answered: no. v203 solves one confirmed bad corridor. The right next step is to keep that behavior, but refactor it into a small curated-route registry so future confirmed exceptions can be added by data entry + tests instead of adding more one-off helper functions.

## Recommendation

Claude Code should do a narrow implementation pass:

1. Refactor the current hardcoded Þrengslavegur helper into an extensible curated route registry.
2. Keep the current Þorlákshöfn/Þrengslavegur rule as the only registry entry for now.
3. Fix the route option label priority so a curated route is visibly labelled as curated even when it is also fastest.
4. Add/adjust provider tests so the registry behavior is covered.
5. Add or confirm a final-submit regression test for a selected curated route.

This is not a request to add more Iceland-wide route rules yet. More entries should only be added after Stebbi has confirmed a specific origin/destination failure and an acceptable via point.

## Files Codex inspected

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `lib/weather/google.server.ts`
- `components/weather/RouteSelectionStep.tsx`
- `lib/__tests__/weather-google.test.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/__tests__/weather-routes-api.test.ts`
- `lib/weather/provider.types.ts`
- `messages/is.json`

## Current implementation shape

`lib/weather/google.server.ts` currently has one-off constants/functions:

- `THORLAKSHOFN_PLACE_ID`
- `THORLAKSHOFN_BOUNDS`
- `CAPITAL_AREA_BOUNDS`
- `THRENGSLAVEGUR_VIA`
- `isNearThorlakshofn`
- `isInCapitalArea`
- `tryGetCuratedThrengslavegurRoute`

`getRouteOptions()` calls that one helper after the normal Google alternatives are deduped and sorted.

That works for the known failure, but it will get messy when a second or third confirmed route exception appears.

## Proposed implementation

In `lib/weather/google.server.ts`, replace the one-off helper with a small registry model.

Suggested shape:

```ts
type Bounds = {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

type PlaceMatcher = {
  placeIds?: readonly string[]
  bounds?: readonly Bounds[]
}

type CuratedRouteRule = {
  id: string
  logName: string
  origin: PlaceMatcher
  destination: PlaceMatcher
  via: { lat: number; lon: number }
  labels: readonly string[]
}

const CURATED_ROUTE_RULES: readonly CuratedRouteRule[] = [
  {
    id: 'capital-area-to-thorlakshofn-via-threngslavegur',
    logName: 'Þrengslavegur',
    origin: { bounds: [CAPITAL_AREA_BOUNDS] },
    destination: {
      placeIds: [THORLAKSHOFN_PLACE_ID],
      bounds: [THORLAKSHOFN_BOUNDS],
    },
    via: { lat: 63.9550, lon: -21.4900 },
    labels: ['CURATED_VIA_THRENGSLAVEGUR'],
  },
]
```

Then add generic helpers:

- `matchesBounds(candidate, bounds)`
- `matchesPlaceMatcher(candidate, matcher)`
- `matchesCuratedRouteRule(from, to, rule)`
- `fetchCuratedRoute(rule, from, to, key, existingIds)`
- `getCuratedRouteOptions(from, to, key, existingIds)`

`getCuratedRouteOptions()` should loop over matching rules, make one extra Google Routes request per matching rule, skip duplicates, and update `existingIds` after each added curated route. Sequential calls are fine; there is currently only one rule and sequential behavior makes diagnostics easier to read.

Keep these existing behavior guarantees:

- If a rule does not match, do not make the extra Google request.
- If Google returns no curated route, omit it silently from the user-facing UI.
- If the curated route has the same geometry fingerprint as an existing route, skip it.
- If the curated request fails or throws, keep the normal Google route options.
- Keep `SHORTER_DISTANCE` removed.
- Keep `route.id` based on geometry fingerprint, not duration or array index.
- Keep `routeIndex: -1` for curated routes unless there is a strong reason to change it.

## Diagnostics

Update dev diagnostics so they remain useful with multiple future rules.

Current:

```ts
curatedAdded: curated !== null
```

Better:

```ts
curatedAdded: curatedRoutes.length > 0,
curatedRulesAdded: curatedRoutes.map(r => /* rule id or labels */)
```

Do not log user emails, auth details, API keys, or full request bodies.

## UI label priority

`components/weather/RouteSelectionStep.tsx` currently checks `idx === 0` before curated labels, so the curated Þrengslavegur route shows as `Fljótlegasta leið` when it is first.

Change the priority so curated labels win:

```ts
const label = ro.labels.includes('CURATED_VIA_THRENGSLAVEGUR')
  ? tf('routeOptionViaThrengslavegur')
  : idx === 0
    ? tf('routeOptionShortest')
    : ro.isDefault
      ? tf('routeOptionDefault')
      : tf('routeOptionOther')
```

If Claude Code wants to make future labels easier, create a tiny local mapping from route label to message key in this component. Keep all visible text in `messages/is.json` and `messages/en.json`.

Design note: this follows `Design.md` because the label is short, visible, translated, and does not rely only on color to explain why the route is special.

## Tests to add or adjust

Provider tests in `lib/__tests__/weather-google.test.ts` should continue to cover:

- capital-area -> Þorlákshöfn triggers exactly one curated request.
- non-Þorlákshöfn destination does not trigger a curated request.
- Reykjanes/southwest origin does not trigger the capital-area rule.
- curated route gets `CURATED_VIA_THRENGSLAVEGUR`.
- curated via request includes `intermediates[0].via === true`.
- duplicate geometry is skipped.
- empty/failed curated response is omitted.
- distinct curated route and default route both appear, sorted by `durationS`.
- `requestedReferenceRoutes` remains undefined.

Add or adjust at least one test that makes the registry nature explicit. Good options:

- test name says "uses curated route registry entry for capital-area -> Þorlákshöfn"
- assert the added route has the registry label and that the via coordinate comes from the rule
- if helpers are exported only for tests, keep exports minimal and avoid widening production API unnecessarily

Final-submit regression:

- Add or confirm an API-level test for `POST /api/teskeid/weather/travel/route` where `selectedRouteId` matches a curated route returned by `provider.getRouteOptions()`.
- Expected result: the route API uses the selected curated route instead of returning `selected_route_unavailable`.
- This guards the live flow after Stebbi clicks `Nota þessa leið`.

If there is no existing API test harness for `travel/route.ts`, add the narrowest test needed with mocked provider/met.no/weather result dependencies.

## Scope boundaries

Do not do these in this pass:

- No SQL or migrations.
- No Supabase/RLS/grants changes.
- No saved-place schema changes.
- No dev server start/restart.
- No commit, push, deploy, or production change.
- No new curated route entries beyond the already confirmed Þrengslavegur rule.
- No revival of `SHORTER_DISTANCE`.

## Localhost checks for Stebbi

After Claude Code implements this, Stebbi should test on localhost:

1. Open `/auth-mvp/vedrid`.
2. Select `Garðabær` as origin from Google search, not a stale saved place if possible.
3. Select `Þorlákshöfn` as destination from Google search.
4. Expected route cards:
   - one route labelled `Um Þrengslaveg`, description `Þrengslavegur/Leið 39`, around 56 km / 57 min
   - one route labelled `Sjálfgefin Google-leið`, description Route 427, around 67 km / 58 min
5. Confirm that the Þrengslavegur card keeps the `Um Þrengslaveg` label even if it is first/fastest.
6. Click `Nota þessa leið`.
7. Expected: final Ferðaveðrið result loads normally; no `Valin leið fannst ekki`.
8. Test a normal route such as `Garðabær -> Selfoss` or `Garðabær -> Akureyri`.
9. Expected: no curated Þrengslavegur route appears for unrelated destinations.
10. Test `Keflavík -> Þorlákshöfn`.
11. Expected: no capital-area curated route is injected unless Stebbi later confirms that route also needs an override.

Watch terminal diagnostics:

- for Garðabær -> Þorlákshöfn: `curatedAdded: true` and the registry rule/label should be visible in dev logs.
- for unrelated routes: `curatedAdded: false`.

No production data, Supabase data, auth settings, billing, secrets, or deployment should be touched in this localhost check.

## Commands Codex ran

- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `Get-Content -Encoding UTF8 Design.md`
- `rg -n "CURATED_VIA_THRENGSLAVEGUR|THRENGSLAVEGUR|THORLAKSHOFN|SHORTER_DISTANCE|routeOptionVia" .`
- `rg -n "getRouteOptions|route option|routeOptions|requestedReferenceRoutes|intermediates" app components lib messages test tests __tests__`
- `git status --short`
- `Get-Content -Encoding UTF8 lib/weather/google.server.ts`
- `Get-Content -Encoding UTF8 components/weather/RouteSelectionStep.tsx`
- `Get-Content -Encoding UTF8 lib/__tests__/weather-google.test.ts`
- `Get-Content -Encoding UTF8 app/api/teskeid/weather/travel/route.ts`
- `Get-Content -Encoding UTF8 app/api/teskeid/weather/travel/routes/route.ts`
- `Get-Content -Encoding UTF8 lib/__tests__/weather-routes-api.test.ts`
- `Get-Content -Encoding UTF8 lib/weather/provider.types.ts`
- `Get-Content -Encoding UTF8 messages/is.json | Select-String -Pattern 'routeOption' -Context 0,18`
- `rg -n "selected_route_unavailable|selectedRouteId|routeConfirmSelected|checkTravelWeather|forecast_unavailable" lib app`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

No tests were run by Codex for this handoff. No app code, SQL, migration, commit, push, deploy, or production state was changed by Codex.

## Open questions / needs confirmation

- The registry should start with only the confirmed Þorlákshöfn rule. Adding more route entries needs Stebbi-provided examples and localhost confirmation.
- The current via point worked in Stebbi's live test. Keep it unless a later test shows `ZERO_RESULTS` or a bad detour.
- Confidence: high that this is the right refactor direction; medium on exact final-submit test placement until Claude Code checks existing API test coverage for `travel/route.ts`.
