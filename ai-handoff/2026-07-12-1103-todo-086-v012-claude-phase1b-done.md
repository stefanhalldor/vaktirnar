# TODO 086 - Phase 1B done - Veðurstofan station mapping

Created: 2026-07-12 11:03
Timezone: Atlantic/Reykjavik
Author: Claude Code
Type: framkvæmdarhandoff / prerelease

## Hvað var samþykkt

Stebbi samþykkti Phase 1B: station mapping skeleton. Engar breytingar á route.ts, assessment.ts, UI eða Supabase.

## Hvað var gert

### Nýjar skrár

**`lib/weather/providers/vedurstofanStations.ts`**

Public API:

```ts
// Mapping fall: route point → næsta stöð + distance + confidence
mapRoutePointToVedurstofanStation(
  routePoint: { lat: number; lon: number },
  stations?: readonly VedurstofanStation[],
): StationMapping | null

// Route-level helper: route points → unique station IDs (deduped, 'unavailable' filtered)
getUniqueStationIdsForRoute(
  routePoints: ReadonlyArray<{ lat: number; lon: number }>,
  stations?: readonly VedurstofanStation[],
): string[]
```

Confidence levels:
- `good`: < 5 km
- `ok`: 5–15 km
- `weak`: 15–50 km
- `unavailable`: > 50 km

Curated stöðvalisti með 3 stöðvum:

| Station | ID | Coordinates | Verified |
|---|---|---|---|
| Hellisheiði | 31392 | 64.0188, -21.3424 | ✓ (live probe) |
| Egilsstaðaflugvöllur | 571 | 65.2833, -14.4017 | Partial (ID confirmed, coords approx) |
| Höfn í Hornafirði | 5544 | 64.2500, -15.2167 | Partial (ID confirmed, coords approx) |

`getUniqueStationIdsForRoute` útbýr deduplicated lista yfir station IDs sem þarf að sækja fyrir leið -- þetta er Phase 1C batch-fetch input.

**`lib/__tests__/weather-vedurstofan-stations.test.ts`**

19 tests.

Meðal þeirra:

```ts
// Lon sign guard — kemur í veg fyrir "Iceland east of Greenwich" bug
it('all station longitudes are negative', () => {
  for (const station of VEDURSTOFAN_STATIONS) {
    expect(station.lon).toBeLessThan(0)
  }
})

// Known coordinate test
it('Hellisheiði has correct WGS84 coordinates', () => {
  expect(hellish.lat).toBeCloseTo(64.0188, 3)
  expect(hellish.lon).toBeCloseTo(-21.3424, 3)  // NEGATIVE
})
```

Prófar: list integrity, verified coordinates, confidence levels (good/ok/weak/unavailable), nearest-station selection, deduplication, route spanning tvo stations.

## Hvað var EKKI gert

- Engar breytingar á `route.ts`, `assessment.ts`, `travel.ts`, `metno.server.ts`
- Engar breytingar á UI eða components
- Engar Supabase eða SQL breytingar
- Engar feature flags
- Engin fetch eða network calls
- Phase 1C (fetch/cache/batch wrapper)

## Tests og type-check

```
Tests:  19 passed (19)   [weather-vedurstofan-stations]
tsc:    no errors
```

## Stöðuvarlisti þarf að stækka

Núverandi 3 stöðvar dekka aðeins örfá svæði. Áður en Phase 1C er sett í notkun þarf að bæta við stöðvum sem deka:

- Reykjavík/Garðabær (31475 — ID líklega rétt, coords þurfa staðfestingu)
- Selfoss, Vík (leið 1 suðurland)
- Akureyri (leið 1 norðurland)
- Norðfjörður / Seyðisfjörður (leið 92/93)

Þetta er Content-verk (handvirk skoðun á station pages), ekki kóðaverk.

## Localhost checks for Stebbi

Phase 1B breytir engu í `/vedrid`. Engar localhost prófanir þarf.

## Næsta skref

Phase 1C: fetch/cache/batch wrapper bakvið server-only flagg.

Þarf sérstakt framkvæmdarleyfi: "Claude Code, framkvæmdu Phase 1C."
