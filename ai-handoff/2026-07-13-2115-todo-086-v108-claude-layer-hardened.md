# TODO 086 v108 - Claude: Veðurstofan layer hardening done

Created: 2026-07-13 21:15
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input: v107 Codex review

---

## Staða

Allar fjórar v107 hardening-leiðréttingar eru útfærðar. Ócommitað. type-check ok, 2400 prófanir standast.

---

## Breytingar

### 1. Timeout budget — `app/api/teskeid/weather/travel/route.ts`

Bætti við `VEDURSTOFAN_LAYER_BUDGET_MS = 1500` fasta og vafðinn product-table read í `Promise.race`:

```ts
const vedurstofanResults = layerEnabled && vedurstofanStationIds.length > 0
  ? await Promise.race([
      readVedurstofanProductForStations(vedurstofanStationIds),
      new Promise<null>(resolve => setTimeout(() => resolve(null), VEDURSTOFAN_LAYER_BUDGET_MS)),
    ]).catch(() => null)
  : null
```

Ef product table svarar ekki innan 1500ms: `vedurstofanResults = null`, baseline niðurstaðan kemur út óbreytt, engin `vedurstofanLayer` í svari.

### 2. Partial status + counts — `lib/weather/providers/vedurstofanBlend.ts`

`VedurstofanTravelLayer.status` stækkað í `'available' | 'partial' | 'unavailable'`.

Bætti við counts:
- `mappedStationCount`: fjöldi route points með gilda station mapping
- `availableStationCount`: ok status
- `staleStationCount`: stale status
- `unavailableStationCount`: vantar gögn eða unavailable status

Status rökfræði í travel route:
```ts
const layerStatus =
  layerPoints.length === 0 ? 'unavailable' :
  unavailableStationCount > 0 ? 'partial' :
  'available'
```

### 3. routePointId → `rwp_${routeIndex}` — `app/api/teskeid/weather/travel/route.ts`

Layer points nota nú `routePointId: \`rwp_${pf.routeIndex}\`` og `routeIndex: pf.routeIndex` til samræmis við rest of travel-weather system (`rwp_${pt.routeIndex}`).

### 4. Denied-access test + timeout test — `lib/__tests__/weather-travel-api.test.ts`

Tvær nýjar prófanir:

**elta-vedrid denied:**
```ts
mockCheckFeatureAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
// → product table not called, no vedurstofanLayer
```

**Product table timeout:**
```ts
mockFetchVedurstofan.mockReturnValue(new Promise(() => {})) // never resolves
// → vi.advanceTimersByTimeAsync(2000) → baseline 200, no vedurstofanLayer
```

---

## Þrjú gate-flags (skjölunin frá v107)

Þegar layer er virkt þarf öll þrjú:

1. `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true` (vercel env eða .env.local)
2. `WEATHER_ELTA_VEDRID_FLAG=true` (checkFeatureAccess krefst þess)
3. Per-user `elta-vedrid` access í `feature_access` töflunni

---

## Test results

```
type-check: exit 0
targeted: 2 files, 24 passed
full suite: 81 files, 2400 passed, 0 failed
```

---

## Response shape (lokagert)

```ts
// Layer disabled eða access denied:
{ stada, travelPlan, ... }

// Layer enabled, available:
{
  stada, travelPlan, ...,
  vedurstofanLayer: {
    experimental: true,
    status: 'available' | 'partial' | 'unavailable',
    mappedStationCount: number,
    availableStationCount: number,
    staleStationCount: number,
    unavailableStationCount: number,
    augmentedResult: DeterministicResult,
    points: Array<{
      routePointId: 'rwp_0' | 'rwp_1' | ...,
      routeIndex: number,
      stationId: string,
      stationName: string,
      distanceM: number,
      confidence: 'good' | 'ok' | 'weak',
      status: 'ok' | 'stale',
      atimeIso: string | null,
      forecastRows: [...]
    }>
  }
}
```

---

## Óframkvæmt (næsti fasi: UI)

Skv. v105/v107: UI toggle + disclaimer, eftir að Stebbi staðfestir API contract á localhost.

- Toggle row nálægt weather display controls
- Label: `Veðurstofan (í prófun)`
- Disclaimer þegar layer sýnt: `Veðurstofugögn eru í prófun. MET/Yr er áfram grunnspáin. Vegagerðin er ekki komin inn.`
- Toggle instant/client-side: `result` (baseline) vs `vedurstofanLayer.augmentedResult`

---

## Localhost próf fyrir Stebbi (v108)

### Flag-uppsetning:
```
VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true
WEATHER_ELTA_VEDRID_FLAG=true
(+ per-user elta-vedrid access)
```

### Prófanir:
1. Layer disabled: API svar hefur EKKI `vedurstofanLayer`, UI er nákvæmlega eins og áður
2. Layer enabled, route nálægt stöðvum: `vedurstofanLayer` til staðar í svarinu, `status` gæti verið `available`, `partial`, eða `unavailable`
3. Partial coverage (sumar stöðvar unavailable): `status === 'partial'`, `unavailableStationCount > 0`
4. Network tab: engin ný Google eða met.no köll við toggle
5. `travelPlan.routeWeatherPoints[n].vedurstofanStation` á að vera UNDEFINED (gamli kóðinn er fjarlægður)

Ekki testa production cron eða production Vercel env án samþykkis.

---

## Breyttar skrár (allar ócommitaðar)

```
M  app/api/teskeid/weather/travel/route.ts
M  lib/__tests__/weather-travel-api.test.ts
M  lib/weather/providers/vedurstofanBlend.ts
?? lib/__tests__/weather-vedurstofan-blend.test.ts
```
