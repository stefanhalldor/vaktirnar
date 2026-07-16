# TODO #70 - Hellisheiði hidden via-route rule

Created: 2026-07-10 06:59  
Timezone: Atlantic/Reykjavik

## Context

Stebbi reported a new route-fidelity problem in Ferðaveðrið: Google/Maps API sometimes avoids Hellisheiði when the user is driving from the west/capital area toward the east/south, even though Route 1 over Hellisheiði is normally the correct route out of Reykjavík for that direction.

Stebbi then tested a manual "dummy" destination/segment:

- Garðabær -> Hellisheiði follows Route 1.
- Hellisheiði -> Hveragerði follows the expected road onward.
- Hellisheiði -> Þorlákshöfn correctly continues down Þrengslavegur/related route.

Stebbi's question: can we use a dummy Hellisheiði point so the route always goes that way for these cases?

## Codex recommendation

Yes, but implement it as a hidden server-side via-point in the existing curated route registry, not as a visible fake place in the UI.

That means:

- User still searches/selects real origin and real destination.
- `lib/weather/google.server.ts` adds a curated Google Routes request with `intermediates: [{ via: true, location: Hellisheiði lat/lon }]`.
- The route picker shows the resulting route as a selectable option, e.g. `Um Hellisheiði`.
- Final submit/weather sampling uses the selected route geometry, exactly like the existing `CURATED_VIA_THRENGSLAVEGUR` path.

Do not split the user journey into two visible legs (`origin -> Hellisheiði` and `Hellisheiði -> destination`). That would create unnecessary UI/product complexity and risk wrong totals, wrong route ids, and confusing labels.

## Existing code shape

Relevant current implementation:

- `lib/weather/google.server.ts`
  - `CuratedRouteRule` already supports `origin`, `destination`, `via`, and `labels`.
  - `CURATED_ROUTE_RULES` currently has one rule:
    - `capital-area-to-thorlakshofn-via-threngslavegur`
    - `CURATED_VIA_THRENGSLAVEGUR`
  - `getCuratedRouteOptions()` loops matching rules.
  - each matching rule makes one extra Google Routes request.
  - curated routes are appended and re-sorted by `durationS`.
- `components/weather/RouteSelectionStep.tsx`
  - currently maps `CURATED_VIA_THRENGSLAVEGUR` -> `routeOptionViaThrengslavegur`.
  - a second curated label needs an explicit mapping.
- `messages/is.json` and `messages/en.json`
  - currently contain `routeOptionViaThrengslavegur`.

## Proposed implementation

Add a new curated route rule to `CURATED_ROUTE_RULES`.

Suggested stable shape:

```ts
const SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS: Bounds = {
  minLat: 63.35,
  maxLat: 64.35,
  minLon: -21.25,
  maxLon: -13.0,
}
```

Add:

```ts
{
  id: 'capital-area-to-south-east-via-hellisheidi',
  logName: 'Hellisheiði',
  origin: { bounds: [CAPITAL_AREA_BOUNDS] },
  destination: {
    bounds: [SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS],
  },
  // Candidate only. Verify visually on localhost before finalizing.
  via: { lat: 64.0360, lon: -21.3920 },
  labels: ['CURATED_VIA_HELLISHEIDI'],
}
```

Important: Claude Code should verify and adjust the via coordinate on the actual Route 1/Hellisheiði road before treating it as final. The coordinate above is only a starting point from Codex, not a verified production coordinate.

## Matching scope

The v1 rule should be intentionally narrow:

- origin: capital area only, using the existing `CAPITAL_AREA_BOUNDS`.
- destination: south/east corridor where Route 1 over Hellisheiði is expected:
  - Hveragerði
  - Selfoss
  - Hella/Hvolsvöllur/Vík/Kirkjubæjarklaustur/Höfn corridor
  - other south-coast points inside the chosen bounds

Avoid overmatching:

- Do not replace or break the existing Þorlákshöfn rule.
- Do not force Hellisheiði for Akureyri/north routes.
- Do not force Hellisheiði for Þingvellir/Laugarvatn/Mosfellsheiði-style trips unless Stebbi explicitly confirms.
- Do not force Hellisheiði for Reykjanes/southwest origins where the best route may legitimately differ.
- Be careful with Egilsstaðir. If Stebbi wants Reykjavík -> Egilsstaðir to be forced over south/east rather than north, that should probably be a separate explicitly named rule after localhost testing.

The `minLon: -21.25` suggestion is deliberate: it should include Hveragerði/Selfoss and eastward destinations, while avoiding Þorlákshöfn so the existing Þrengslavegur-specific rule remains responsible for Þorlákshöfn.

## UI and message changes

Add label mapping in `RouteSelectionStep.tsx` before the generic fastest/default labels:

```ts
const label = ro.labels.includes('CURATED_VIA_HELLISHEIDI')
  ? tf('routeOptionViaHellisheidi')
  : ro.labels.includes('CURATED_VIA_THRENGSLAVEGUR')
    ? tf('routeOptionViaThrengslavegur')
    : ...
```

Add translations:

- `messages/is.json`: `"routeOptionViaHellisheidi": "Um Hellisheiði"`
- `messages/en.json`: `"routeOptionViaHellisheidi": "Via Hellisheiði"`

If this mapping is skipped, the curated route may incorrectly appear as `Fljótlegasta leið`, `Sjálfgefin Google-leið`, or `Önnur leið`, which would hide the point of the rule from Stebbi during localhost testing.

## Force vs selectable option

Stebbi used the word "þvinga", but Codex recommends v1 should still add a curated selectable route rather than silently removing all Google defaults.

Reason:

- It preserves debuggability.
- It lets Stebbi compare Google default vs curated route in localhost.
- It avoids hiding legitimate alternatives in edge cases.
- If the curated route is fastest, the current sorting will naturally place it first.

If Stebbi later wants true auto-selection or removal of bad default routes for a confirmed corridor, make that a separate product decision after this rule is proven.

## Tests Claude Code should add/update

Add tests near the existing curated Þrengslavegur tests in `lib/__tests__/weather-google.test.ts`.

Minimum coverage:

1. Capital area -> Selfoss/Hveragerði triggers one curated Hellisheiði request.
2. The curated request includes exactly one intermediate with `via: true`.
3. The intermediate lat/lon is close to the verified Hellisheiði via-point.
4. Distinct curated route gets label `CURATED_VIA_HELLISHEIDI`.
5. Geometry duplicate is skipped.
6. Failed/empty curated response is omitted without breaking normal routes.
7. Capital area -> Þorlákshöfn still triggers `CURATED_VIA_THRENGSLAVEGUR` and not `CURATED_VIA_HELLISHEIDI`.
8. Capital area -> Akureyri does not trigger `CURATED_VIA_HELLISHEIDI`.
9. Reykjanes/southwest origin -> Selfoss does not trigger this capital-area rule.
10. Route-selection label mapping shows `Um Hellisheiði`.

Also confirm existing final-submit curated route tests are still generic enough. If they are tied only to `CURATED_VIA_THRENGSLAVEGUR`, add a small sibling assertion or helper that proves a selected `CURATED_VIA_HELLISHEIDI` route id survives final submit and its geometry is used for weather sampling.

## API cost / diagnostics

Each matching curated rule creates one extra Google Routes request. Keep destination bounds narrow enough that this does not run for unrelated Icelandic routes.

Expected local diagnostics for matching routes:

```json
{
  "curatedAdded": true,
  "curatedRules": ["CURATED_VIA_HELLISHEIDI"]
}
```

For Þorlákshöfn:

```json
{
  "curatedAdded": true,
  "curatedRules": ["CURATED_VIA_THRENGSLAVEGUR"]
}
```

If both labels ever appear for Þorlákshöfn, the new bounds are too broad.

## Supabase / privacy / production notes

No SQL migration is expected.

No RLS/auth/grants changes are expected.

No route geometries, place names, raw coordinates, or Google payloads should be stored in analytics/admin. Existing usage metadata may count curated labels such as `CURATED_VIA_HELLISHEIDI`; that is acceptable because it is a generic label, not a raw user route.

Do not add API keys, route payloads, precise user origin/destination, or provider responses to logs beyond existing development diagnostics.

## Localhost checks for Stebbi

Stebbi should test on localhost at `/auth-mvp/vedrid`.

Primary positive tests:

1. Choose `Garðabær` or another capital-area origin.
2. Choose `Hveragerði`.
3. Expected:
   - route picker shows `Um Hellisheiði`.
   - the map follows Route 1 over Hellisheiði, not the strange northern detour.
   - terminal diagnostics include `CURATED_VIA_HELLISHEIDI`.
4. Select the `Um Hellisheiði` route and continue to the result.
5. Expected:
   - no `selected_route_unavailable`.
   - route/weather map follows the selected Hellisheiði geometry.

Repeat with `Garðabær -> Selfoss`.

Regression checks:

1. `Garðabær -> Þorlákshöfn`
   - Expected: `Um Þrengslaveg` still appears.
   - Expected: `Um Hellisheiði` should not appear unless Claude Code intentionally documents why both are needed.
2. `Garðabær -> Akureyri`
   - Expected: no `Um Hellisheiði` curated option.
3. `Keflavík` or `Grindavík -> Selfoss`
   - Expected: no capital-area Hellisheiði rule unless Stebbi separately wants southwest origins covered.
4. Saved/recent places with no placeId should still work through coordinate bounds.
5. Google placeId selections should also work when coordinates are present.

Do not test production API billing casually. This is safe on localhost with normal route testing, but each matching curated route adds a Google Routes request.

## Suggested next step

Claude Code should implement this as a small route-registry addition plus tests, then stop and hand off before release. The handoff should include screenshots or terminal diagnostics for at least:

- capital area -> Hveragerði/Selfoss, showing `CURATED_VIA_HELLISHEIDI`;
- capital area -> Þorlákshöfn, showing only the existing Þrengslavegur rule;
- capital area -> Akureyri, showing no Hellisheiði rule.

## Óvissa / þarf að staðfesta

The exact Hellisheiði via coordinate must be verified visually in localhost before commit. Codex did not verify the coordinate against the live map.

The destination bounds are a proposal. Claude Code should tighten them if local testing shows false positives, especially around Þingvellir/Laugarvatn or Þorlákshöfn.
