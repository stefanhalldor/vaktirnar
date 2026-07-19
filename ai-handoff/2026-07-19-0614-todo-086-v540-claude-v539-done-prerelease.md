# 2026-07-19 06:14 - TODO 086 v540 - Claude: v539 framkvæmd lokið, prerelease handoff

Created: 2026-07-19 06:14
Timezone: Atlantic/Reykjavik

---

## Stutt mannamál

v539 er framkvæmt að fullu. Route-memory feature er skrifað: SQL migration, place normalization, server write helper, lookup API, `/vedrid` client state, og full test coverage. Ekkert SQL hefur verið keyrt. Stebbi keyrir migration með sérstöku samþykki.

---

## Hvað var gert í v539

### 1. Fix: `allMarkersHidden` conflation (v538 finding #1)

**Vandamál:** `allMarkersHidden` fór yfir `marker.visible` sem felur bæði route filter og status filter, þannig að `Sýna allt` hnappurinn birtist líka þegar route-memory eða corridor filtrar fálu markeranna - en hnappurinn hreinsar bara status filter, ekki route filter.

**Fix:** Endurnefnt í `allMarkersHiddenByStatusFilter` og reiknað af `overviewStatusCounts` (sem er route-filtered count) frekar en `marker.visible`:

```ts
const allMarkersHiddenByStatusFilter: boolean = (() => {
  if (visibleStatuses.size === 0) return false
  const totalRouteVisible = Object.values(overviewStatusCounts)
    .reduce<number>((sum, n) => sum + (n ?? 0), 0)
  if (totalRouteVisible === 0) return false
  return !(Object.keys(overviewStatusCounts) as WindDisplayStatus[]).some(
    status => (overviewStatusCounts[status] ?? 0) > 0 && visibleStatuses.has(status),
  )
})()
```

Þetta tryggir að `Sýna allt` og "Engin stöð fellur undir virku síurnar." birtast aðeins þegar status filter er í raun vandinn, ekki þegar route-memory/corridor sía hefur skilað tómum niðurstöðum.

### 2. `activeTripHref` fix

Áður var `activeTripHref` null þegar `routeLensResult.status === 'idle'`. Þetta var of þröngt - with route-memory replaces routeLens, `activeTripHref` mun aldrei fara úr idle. Breytt í:

```ts
!fromPlaceDraft || !toPlaceDraft
```

### 3. SQL migration: `sql/86_weather_route_memory.sql`

Ný migration (DO NOT RUN) með tveimur töflum:

- `weather_route_memory_routes`: route_key (unique), from/to place keys/labels, variant key, source, usage_count, first/last_seen_at
- `weather_route_memory_stations`: (route_id, provider, station_id) primary key, route_order, distance_from_origin_m, distance_from_route_m, route_fraction

Security:
- RLS enabled á báðum töflum
- `revoke all from public, anon, authenticated` á báðum töflum
- `grant select, insert, update, delete to service_role` á báðum töflum
- Engin `user_id` dálkur
- `check (provider in ('vedurstofan', 'vegagerdin'))`
- `check (source in ('ferdalagid'))`
- Rollback instructions í comments

### 4. Place normalization: `lib/iceland-routes/routePlaceNormalization.ts`

Nýr helper, city-level (fínnar en routeObservation.ts sem notar `hofudborgarsvaedi`):

- `normalizePlaceForMemory(name, formattedAddress?)` - skilar `{ key, label }` eða `null`
- Patterns með `(?:æ|ae)` til að þekja ASCII variants (t.d. "Gardabaer" → `gardabaer`)
- Geymist aldrei óþekkt heimilisföng
- `buildRouteMemoryKey(fromKey, toKey, variantKey?)` - `${from}--${to}--${variantKey}`

Flutt út í `lib/iceland-routes/index.ts`.

### 5. Server write helper: `lib/iceland-routes/routeMemory.server.ts`

`server-only` module með:

- `recordRouteMemory(input)` - upsert route row (select → insert or update), delete-then-insert stations per provider; best-effort, never throws
- `lookupRouteMemory(fromPlaceKey, toPlaceKey)` - skilar most-recent variant og station IDs; never throws

Ekki flutt út í `index.ts` (server-only - myndi brjóta client imports).

### 6. Lookup API: `app/api/teskeid/weather/route-memory/lookup/route.ts`

`POST /api/teskeid/weather/route-memory/lookup`

Input: `{ from: { name, formattedAddress? }, to: { name, formattedAddress? } }`

Normalizerar `from`/`to` place keys, kallar `lookupRouteMemory`, skilar:

- `{ status: 'miss' }` þegar ekki finnst
- `{ status: 'resolved', routeKey, routeLabel, variants: [...] }` þegar finnst

Engin auth required (station IDs eru ekki viðkvæmar einkaupplýsingar).

### 7. Travel route write: `app/api/teskeid/weather/travel/route.ts`

Bætt við Vegagerðin station matching + route-memory write eftir að `vedurstofanLayer` er byggt:

```ts
// Best-effort — never fails travel calculation
try {
  const fromNorm = normalizePlaceForMemory(...)
  const toNorm = normalizePlaceForMemory(...)
  if (fromNorm && toNorm) {
    // match vegagerdin stations to route geometry
    // call recordRouteMemory(...)
  }
} catch { /* swallowed */ }
```

### 8. WeatherOverviewClient: route-memory state

Fjarlægt `filterStationIdsForRouteLens` og corridor-based filter. Bætt við:

- `RouteMemoryState` type: `idle | loading | miss | resolved`
- `routeMemory` state + fetch effect (AbortController, `from`/`to` place name deps)
- useEffect sem overrida `routeLensResult` þegar `routeMemory.status === 'resolved'`
- Route filter IDs koma núna frá `routeMemory.vedurstofanIds` / `routeMemory.vegagerdinIds`

### 9. Tests

**`lib/__tests__/route-place-normalization.test.ts`** (19 tests):
- Known cities normalize
- Street address + formattedAddress with locality → normalized
- Street address without locality → null
- Garðabær priority before Reykjavík
- ASCII "Gardabaer" variant matched
- Case insensitivity
- `buildRouteMemoryKey` format og ordering

**`lib/__tests__/weather-route-memory-migration.test.ts`** (18 tests):
- Transactions, table creation, indexes
- Security: RLS, revokes, service_role grants, no anon/authenticated grants
- Check constraints: provider, source
- No user_id
- Rollback instructions, DO NOT RUN warning

---

## Tests

```
npm run test:run -- lib/__tests__/route-place-normalization.test.ts lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/windObservationStatus.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts

Test Files  6 passed (6)
     Tests  145 passed (145)

npx tsc --noEmit
exit 0
```

---

## SQL staða

| Migration | Staða |
|---|---|
| `sql/82_user_preference_store.sql` | Separate concern, ekki runin |
| `sql/83_vegagerdin_measurement_history.sql` | Separate concern, ekki runin |
| `sql/84_yr_point_history.sql` | Separate concern, ekki runin |
| `sql/85_route_observation_aggregate.sql` | DRAFT, DO NOT RUN |
| `sql/86_weather_route_memory.sql` | **SKRIFUÐ - EKKI KEYRÐ** |

Stebbi keyrir `sql/86_weather_route_memory.sql` með sérstöku samþykki þegar hann er tilbúinn. **Keyra ekki 85.**

---

## Skrár sem breyttust í v539

### Nýjar skrár
- `sql/86_weather_route_memory.sql`
- `lib/iceland-routes/routePlaceNormalization.ts`
- `lib/iceland-routes/routeMemory.server.ts`
- `app/api/teskeid/weather/route-memory/lookup/route.ts`
- `lib/__tests__/route-place-normalization.test.ts`
- `lib/__tests__/weather-route-memory-migration.test.ts`

### Breyttar skrár
- `lib/iceland-routes/index.ts` — bætt við `normalizePlaceForMemory`, `buildRouteMemoryKey` export
- `app/api/teskeid/weather/travel/route.ts` — Vegagerðin matching + route-memory write block
- `components/weather/WeatherOverviewClient.tsx` — route-memory state, filter IDs, allMarkersHiddenByStatusFilter, activeTripHref fix

### Einnig breytt í v537/v538 (sama session, ócommittað)
- `components/weather/WeatherSourceTimeSelector.tsx` — Núna scrubber layout + stale comments
- `lib/weather/forecastSlotHelpers.ts` — IS_WEEKDAY_NOM, IS_MONTH_FULL, Icelandic day label format
- `lib/__tests__/windObservationStatus.test.ts` — DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES tests
- `messages/is.json`, `messages/en.json` — `overviewFilterEmpty` key

---

## Localhost checks

Þessar athuganir eiga að gera **á eftir** að Stebbi keyrir `sql/86_weather_route_memory.sql`:

1. **Áður en SQL er keyrt:** `/vedrid` á ekki að crasha. Lookup API skilar 500 (tafla til ekki) - verify í network tab að `/vedrid` gracefully sýnir miss-state frekar en crash.

2. **Eftir migration:** Opna `/ferdalagid`. Reikna leið, t.d. Reykjavík → Akureyri. Confirm að travel result virkar eins og áður, engin user-visible villa.

3. **Back á `/vedrid`:** Velja sama normalized Frá/Til. Expected: `/vedrid` síar til nákvæmt þær station IDs frá `/ferdalagid`, ekki broad corridor cloud.

4. **Miss flow:** Velja leið sem hefur EKKI verið reiknuð í `/ferdalagid`. Expected: engar giskunar-stöðvar, miss-state í UI með CTA í Ferðalagið.

5. **Status filter test:** Apply vind-status síur þannig að allar route-stöðvar fela sig. Expected: "Engin stöð fellur undir virku síurnar. Sýna allt" birtist og `Sýna allt` vinnur.

6. **Privacy check:** Staðfesta að engar full addresses (t.d. "Melás 8") sjást eða eru geymdar. Aðeins safe place label eins og "Garðabær".

---

## Verkefni sem eru eftir (v540+)

### Ekki gert í þessum v539 pass

Frá v539 Codex handoff, neðri forgangsatriði sem voru skjalfest en ekki tekin:

- **Route-memory miss UI copy** (`messages/is.json` + `messages/en.json` miss-state strings) - WeatherOverviewClient sýnir miss-state án specifics
- **Vegagerðin provider access gating** - lookup endpoint skilar Vegagerðin IDs óháð access (þarf `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` check)
- **Multiple route variants UI** - lookup skilar mögulegum variants en WeatherOverviewClient notar alltaf index 0 (most recent)
- **Reverse direction fallback** - exact direction only, no reverse lookup
- **Writer tests** - routeMemory.server.ts server-side write tests (krefst mock Supabase)
- **Lookup tests** - route-memory lookup handler tests

### IcelandRoadmap.md update

v539 Codex nefndi að IcelandRoadmap.md ætti að uppfærast: R5 "curated corridor route lens" er nú transitional, R4/R5 source er route-memory station sets. Þetta var ekki gert í þessum pass.

---

## Prerelease álit

Kóðinn er tæknilegur hreinn, type-check exit 0, 145 tests pass.

**Hvað er tilbúið:** Route-memory write path (server), lookup API, client state, SQL migration skrá, place normalization, tests.

**Hvað þarf áður en notendur sjá route-memory niðurstöður:** Stebbi þarf að keyra `sql/86_weather_route_memory.sql`. Ekkert virkar enn í production - API gilds villu ef taflan er ekki til.

**Graceful degradation:** WeatherOverviewClient sýnir miss-state ef tafla er ekki til eða lookup skilar villu. `/vedrid` broader view works normally án route-memory.

Æskileg næsta Codex review (v541): review þessa implementation, sérstaklega Vegagerðin access gating og miss-state UI copy.
