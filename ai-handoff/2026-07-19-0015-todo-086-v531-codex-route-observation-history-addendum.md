# 2026-07-19 0015 - RouteObservation history addendum for v530

Send this alongside:

- `2026-07-19-0015-todo-086-v530-codex-v529-prerelease-review.md`

## Short version

Do not try to make `/vedrid` perform full trip-weather route calculation without Google cost right now.

Instead, let `/ferdalagid` remain the accurate route-calculation surface, and let `/vedrid` use a privacy-safe history of route observations that `/ferdalagid` has already produced.

That gives `/vedrid` a cheap, useful “big picture” route lens:

- dropdown uses normalized route families that Teskeið has seen before
- selected route family filters the overview map to the stations previously matched to that route
- no Google call is needed on `/vedrid`
- no raw Google route result is persisted
- no exact home address should be shown or stored as a route-family label

## Product decision

`/vedrid` is the big-picture weather map.

`/ferdalagid` is the exact trip-weather calculation with departure time, route alternatives, Google Routes, provider matching and detailed travel context.

So on `/vedrid`:

- do not turn the scrubber into `Brottför` yet
- do not promise exact route-specific travel weather unless the user opens `/ferdalagid`
- allow lightweight route filtering based on route families Teskeið already knows
- show the filtered station set as “stöðvar sem hafa áður komið upp á þessari leið” or similar product language

## Why this is safer

Google Routes policies restrict caching/storage of most Routes content. Place IDs are an exception, but raw route geometry, steps, route content, durations and directions should not become Teskeið’s canonical route system without separate terms/privacy review.

So the route-learning layer must store provider-neutral, derived Teskeið knowledge only:

- normalized route family
- canonical area keys
- station IDs that Teskeið’s own provider matching selected
- route segment/caution IDs from `lib/iceland-routes/`
- aggregate counters

Do not persist:

- raw Google polyline
- route steps
- Google route labels as canonical Teskeið labels
- raw Google duration/distance as cached route facts
- typed street address like `Melás 8`
- exact user route history tied to user identity

## Proposed model

Create or plan a small RouteObservation layer under the IcelandRoadmap umbrella.

Suggested concepts:

```ts
type RouteObservationSource = 'ferdalagid_google_routes'

type RouteObservation = {
  id: string
  source: RouteObservationSource
  routeFamilyKey: string
  routeFamilyLabel: string
  fromAreaKey: string
  fromAreaLabel: string
  toAreaKey: string
  toAreaLabel: string
  vedurstofanStationIds: string[]
  vegagerdinStationIds: string[]
  routeSegmentIds: string[]
  routeCautionIds: string[]
  createdAtIso: string
}
```

Important: this is illustrative. Claude Code should fit the actual types/table names to existing conventions.

## Normalization rule

The key product rule:

`Melás 8 -> Akureyri` must not become a public route-family label.

It should normalize to something like:

- `Garðabær -> Akureyri`
- `Höfuðborgarsvæðið -> Akureyri`
- or another existing/local area taxonomy if one already exists

Pick the simplest useful first version:

1. If Google/Places selected result has locality/municipality data already available in our existing place object, use that.
2. If not, derive a coarse area from coordinates using a small local mapping helper.
3. If no safe/coarse area is found, do not create a public route observation for that query.

Do not store full `formattedAddress` as route-family identity.

## `/ferdalagid` intake flow

After `/ferdalagid` has successfully calculated a route and provider matching has produced station sets:

1. Normalize `from` and `to` into coarse area keys.
2. Build or update a route-family key.
3. Store the ordered station IDs selected for that route:
   - Veðurstofan station IDs
   - Vegagerðin station IDs
4. Store segment/caution IDs detected by IcelandRoadmap.
5. Increment aggregate route-family usage counts.
6. Fail silently/non-blockingly if observation write fails.

This must not block the user from seeing trip weather.

## `/vedrid` route lens behavior

Replace the idea of “full route calculation on `/vedrid`” with a lightweight observed-route lens:

1. `Frá` and `Til` inputs show a dropdown/autocomplete from observed normalized route families.
2. When the user selects a known route family, `/vedrid` filters the map to the station IDs stored for that route family.
3. It should clearly be a big-picture filter, not an exact new trip calculation.
4. If no observed route family exists, show a helpful empty state:

   “Við eigum ekki þessa leið í stóru myndinni ennþá. Reiknaðu ferðaveðrið til að fá nákvæma niðurstöðu.”

5. CTA can still send the user to `/ferdalagid` for exact calculation.

## Data and privacy guardrails

This must be privacy-first:

- no user ID required for public route-family aggregation
- no exact street addresses in public route labels
- no raw from/to query text in aggregate route-family tables
- no raw Google route content
- if individual observation rows are kept, consider short retention or aggregate-first design
- if a query cannot be safely normalized, skip observation storage

If Claude Code thinks storing individual observations creates privacy ambiguity, prefer an aggregate-only table:

- `route_family_key`
- `from_area_key`
- `to_area_key`
- `station_ids`
- `segment_ids`
- `usage_count`
- `last_seen_at`

## Suggested phases

### Phase R0 - Decision and naming

- Confirm the names: `RouteObservation`, `RouteFamily`, `RouteIntelligenceObservation`, or similar.
- Confirm where this belongs under `lib/iceland-routes/`.
- Confirm whether SQL is needed now or whether first version can be in local fixtures/types only.

### Phase R1 - Schema/types

- Add provider-neutral types in `lib/iceland-routes/`.
- If implementation is approved, write a SQL migration for route-family aggregate storage.
- Do not run SQL without Stebbi’s explicit permission.

### Phase R2 - Intake from `/ferdalagid`

- After provider matching, call a small `recordRouteObservation()` helper.
- Make it best-effort and non-blocking.
- Add tests proving raw addresses and raw Google route content are not persisted.

### Phase R3 - `/vedrid` observed-route dropdown

- Add dropdown based on observed route families.
- Selecting a known family filters existing station layers by observed station IDs.
- No Google call from `/vedrid` for this lightweight filter.

### Phase R4 - Upgrade path

- Later, when IcelandRoadmap becomes strong enough, route families can be powered by Teskeið’s own canonical segments instead of historical observations.
- This keeps the door open to a real Teskeið route engine without pretending we have it today.

## Route Intelligence Check

- Route family touched: all route-family and route-lens work in `/vedrid` and `/ferdalagid`.
- Roadmap impact: yes, this belongs in `IcelandRoadmap.md` and `lib/iceland-routes/`.
- Provider neutrality: yes, store station IDs, segment IDs and cautions, not Google raw route content.
- Cache key needed: yes, normalized route-family key, not raw from/to address.
- Privacy risk: medium if full addresses are stored; low if normalized area keys and aggregate counts are used.
- Google storage risk: avoid raw route content; only keep derived Teskeið observations and allowed identifiers after review.

## Acceptance criteria

- `/ferdalagid` can record route observations without affecting trip-weather UX.
- Observation write failures do not break route calculation.
- Stored/public route labels do not include street addresses.
- `/vedrid` route dropdown can use observed route families without Google calls.
- Selecting a route family filters station markers to known Veðurstofan/Vegagerðin station IDs.
- The UI does not imply that `/vedrid` performed a fresh exact route calculation.
- Tests cover normalization and no raw address/route-content persistence.

## Localhost checks for Stebbi

After implementation:

1. In `/auth-mvp/vedrid/ferdalagid`, calculate a common route, e.g. Reykjavík -> Akureyri.
2. Return to `/vedrid`.
3. Start typing Reykjavík/Akureyri in the lightweight route fields.
4. Expected: the observed route family appears in the dropdown.
5. Select it.
6. Expected: map filters to stations that were on the calculated route.
7. Confirm the page does not call Google just to apply this observed-route filter.
8. Test a private-ish address, e.g. a home street address, into `/ferdalagid`.
9. Expected: any route family shown later on `/vedrid` is normalized to a coarse area, not the exact street address.
10. Confirm exact trip weather still requires `/ferdalagid`.

Do not run SQL, migrations, production jobs, deployment, or commits unless Stebbi explicitly asks for that separately.
