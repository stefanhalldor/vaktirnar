# TODO #70 - Hellisheiði hidden via-rule, tightened

Created: 2026-07-10 07:05  
Timezone: Atlantic/Reykjavik

Supersedes: `2026-07-10-0659-todo-070-v001-codex-hellisheidi-hidden-via-route-handoff.md`

## Context

Stebbi reported a route-fidelity problem in Ferðaveðrið: Google/Maps API sometimes routes users away from Hellisheiði when they are effectively driving west-to-east out of the Reykjavík/capital-area corridor. In these cases Route 1 over Hellisheiði is normally the right baseline route.

Stebbi tested a manual "dummy" Hellisheiði stop:

- Garðabær -> Hellisheiði follows Route 1.
- Hellisheiði -> Hveragerði follows the expected road onward.
- Hellisheiði -> Þorlákshöfn continues naturally toward Þrengslavegur.

Stebbi clarified the desired rule:

> Við búum alltaf til eitt suggestion með millilendingu, ósýnilega notandanum, á Hellisheiði þegar notandi er að fara í gegnum eða frá capital area á leiðinni til staðar sem er landfræðilega lengra til austurs en Hellisheiði og notandinn er að koma frá vestri/norðri í gegnum capital area.

## Codex sanity check

The idea is right, but do not implement "destination east of Hellisheiði" as the only condition. That would overmatch routes such as Akureyri or north/northeast routes, which are east-ish by longitude but should not be forced over Hellisheiði.

Use this product rule instead:

> Always create one extra route suggestion with a hidden via-point on Hellisheiði when the user is going from, or through, the capital-area corridor toward a destination that is both east of Hellisheiði and in the south/southeast Route 1 corridor where Hellisheiði is the normal outbound road from Reykjavík.

This should be an extra suggestion, not a silent replacement of every Google result.

## Non-negotiable behavior

1. Keep the user's visible origin and destination unchanged.
2. Add one hidden via-point on Hellisheiði server-side.
3. Show the resulting route as a route option labelled `Um Hellisheiði`.
4. If the user selects it, final submit/weather sampling must use that selected curated geometry.
5. Do not split the journey into visible `origin -> Hellisheiði -> destination` legs.
6. Do not store raw route geometry, origin/destination coordinates, place names, or Google responses in analytics/admin.

## Implementation direction

Reuse the existing curated route registry in `lib/weather/google.server.ts`.

Current registry already supports:

- `CuratedRouteRule`
- `origin`
- `destination`
- `via`
- `labels`
- duplicate geometry skipping
- non-fatal failure if the curated request returns no route

Add a new rule such as:

```ts
{
  id: 'capital-corridor-to-south-east-via-hellisheidi',
  logName: 'Hellisheiði',
  origin: {
    bounds: [
      CAPITAL_AREA_BOUNDS,
      WEST_NORTH_CAPITAL_APPROACH_BOUNDS,
    ],
  },
  destination: {
    bounds: [SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS],
  },
  // Candidate only. Claude Code must verify visually on localhost.
  via: { lat: 64.0360, lon: -21.3920 },
  labels: ['CURATED_VIA_HELLISHEIDI'],
}
```

The coordinate above is not verified by Codex. Claude Code must choose/verify a via-point that is actually on Route 1/Hellisheiði.

## Suggested matcher definitions

### Origin matcher

Keep existing:

```ts
const CAPITAL_AREA_BOUNDS: Bounds = { minLat: 63.95, maxLat: 64.25, minLon: -22.10, maxLon: -21.40 }
```

Add a deliberately limited "coming from west/north through capital area" matcher. It should cover obvious west/north approaches like Akranes/Borgarnes/Hvalfjörður/Mosfellsbær corridor only if local testing confirms they normally route through the capital-area/Hellisheiði path.

Example starting point only:

```ts
const WEST_NORTH_CAPITAL_APPROACH_BOUNDS: Bounds = {
  minLat: 64.20,
  maxLat: 64.85,
  minLon: -22.45,
  maxLon: -21.20,
}
```

Claude Code should tighten this if it catches too much. Do not let it reach Akureyri/north Iceland.

### Destination matcher

Do not use only longitude.

Use a south/southeast corridor bound that requires the destination to be:

- east of Hellisheiði/Hveragerði area, and
- still in the south/southeast driving corridor.

Example starting point only:

```ts
const SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS: Bounds = {
  minLat: 63.35,
  maxLat: 64.35,
  minLon: -21.25,
  maxLon: -13.0,
}
```

The `minLon: -21.25` is important because it should include Hveragerði/Selfoss and eastward south-coast destinations, while avoiding Þorlákshöfn so the existing Þrengslavegur-specific rule remains responsible for Þorlákshöfn.

## Important exclusions

Do not make this a broad "east of Hellisheiði" rule.

Must not trigger for:

- capital area -> Akureyri/north routes
- capital area -> Þingvellir/Laugarvatn/Mosfellsheiði routes unless Stebbi separately confirms
- Reykjanes/southwest origins unless they are explicitly added later
- Þorlákshöfn if the existing `CURATED_VIA_THRENGSLAVEGUR` rule already handles it
- arbitrary northeast/east Iceland routes unless the south-coast route is intentionally confirmed

Egilsstaðir is ambiguous. If Stebbi wants Reykjavík -> Egilsstaðir to be forced through the south/east corridor, add that as a separate explicitly named rule after testing. Do not accidentally include it through a broad latitude/longitude rectangle.

## Label/UI changes

Add explicit route label mapping in `components/weather/RouteSelectionStep.tsx`.

Curated labels should win before fastest/default labels:

```ts
const label = ro.labels.includes('CURATED_VIA_HELLISHEIDI')
  ? tf('routeOptionViaHellisheidi')
  : ro.labels.includes('CURATED_VIA_THRENGSLAVEGUR')
    ? tf('routeOptionViaThrengslavegur')
    : idx === 0
      ? tf('routeOptionShortest')
      : ro.isDefault
        ? tf('routeOptionDefault')
        : tf('routeOptionOther')
```

Add translations:

- `messages/is.json`: `"routeOptionViaHellisheidi": "Um Hellisheiði"`
- `messages/en.json`: `"routeOptionViaHellisheidi": "Via Hellisheiði"`

## Tests Claude Code should add/update

Use the existing curated Þrengslavegur tests in `lib/__tests__/weather-google.test.ts` as the pattern.

Minimum test cases:

1. Capital area -> Hveragerði triggers `CURATED_VIA_HELLISHEIDI`.
2. Capital area -> Selfoss triggers `CURATED_VIA_HELLISHEIDI`.
3. Origin in west/north approach bound -> Selfoss triggers `CURATED_VIA_HELLISHEIDI` only if the chosen origin bound is intentionally part of the rule.
4. Curated Hellisheiði request has exactly one intermediate and `via === true`.
5. Curated Hellisheiði request uses the verified Hellisheiði coordinate.
6. Distinct curated route receives `CURATED_VIA_HELLISHEIDI`.
7. Duplicate geometry is skipped.
8. Empty/failed curated response is omitted without breaking normal Google route options.
9. Garðabær/capital area -> Þorlákshöfn triggers `CURATED_VIA_THRENGSLAVEGUR`, not `CURATED_VIA_HELLISHEIDI`.
10. Capital area -> Akureyri does not trigger `CURATED_VIA_HELLISHEIDI`.
11. Capital area -> Þingvellir/Laugarvatn does not trigger `CURATED_VIA_HELLISHEIDI`.
12. Route picker maps `CURATED_VIA_HELLISHEIDI` to `Um Hellisheiði`.
13. Final-submit regression: selecting a `CURATED_VIA_HELLISHEIDI` route id does not produce `selected_route_unavailable` and uses the selected curated geometry for weather sampling.

## Diagnostics expected on localhost

For a matching south/east route:

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

If both labels appear for Þorlákshöfn in v1, the new destination bounds are too broad.

## API cost / production risk

Every matching curated rule adds one extra Google Routes request.

That is acceptable for a narrowly matched rule, but dangerous if the matcher is too broad. Claude Code should prefer stricter bounds and explicit tests over a clever generic geography rule.

No SQL migration is expected.

No RLS/auth/grants changes are expected.

No production data changes are expected.

No API keys or raw provider payloads should be logged.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost.

Positive checks:

1. `Garðabær -> Hveragerði`
   - Expected: route picker shows `Um Hellisheiði`.
   - Expected: map follows Route 1 over Hellisheiði.
   - Expected terminal diagnostics include `CURATED_VIA_HELLISHEIDI`.
2. `Garðabær -> Selfoss`
   - Same expected result.
3. If Claude Code includes west/north approach origins:
   - test one confirmed origin such as Akranes/Borgarnes to Selfoss/Hveragerði.
   - Expected: one `Um Hellisheiði` suggestion, not a broken or duplicated route.

Regression checks:

1. `Garðabær -> Þorlákshöfn`
   - Expected: `Um Þrengslaveg`.
   - Expected: no `Um Hellisheiði` unless Claude Code explicitly explains and Stebbi accepts both.
2. `Garðabær -> Akureyri`
   - Expected: no `Um Hellisheiði`.
3. `Garðabær -> Laugarvatn` or `Þingvellir`
   - Expected: no `Um Hellisheiði`.
4. `Keflavík/Grindavík -> Selfoss`
   - Expected: no Hellisheiði rule in v1 unless Stebbi explicitly approves southwest-origin coverage.
5. Select the `Um Hellisheiði` option and continue to result.
   - Expected: no `selected_route_unavailable`.
   - Expected: route/weather map follows the selected curated route geometry.

Do not do broad production-style route sweeps casually. This uses Google Routes requests.

## Suggested next step

Claude Code should implement the tightened rule as a small route-registry change with tests and then stop for handoff/review before release.

The Claude handoff should include:

- the final verified Hellisheiði coordinate;
- exact origin/destination bounds used;
- which routes were tested on localhost;
- terminal diagnostics for at least Hveragerði/Selfoss, Þorlákshöfn, Akureyri, and Þingvellir/Laugarvatn.

## Óvissa / þarf að staðfesta

The exact Hellisheiði via coordinate is still unverified by Codex.

The west/north approach bounds are conceptually right but easy to overmatch. Claude Code should either keep v1 to `CAPITAL_AREA_BOUNDS` only, or add the approach bounds with strict tests and a clear explanation.

The destination bounds must not accidentally include north/northeast routes.
