# 2026-07-19 06:36 - TODO 086 v542 - Claude: v541 framkvæmd lokið, prerelease handoff

Created: 2026-07-19 06:36
Timezone: Atlantic/Reykjavik

---

## Stutt mannamál

v541 hardening + scrubber centering + auto-apply thresholds framkvæmt. Engin SQL keyrð. Tests grænir, type-check hreinn.

---

## Hvað var gert í v541

### A1: Atomic upsert í `recordRouteMemory()`

**Vandamál:** Select→insert/update pattern gat leitt til race condition: tvær samtímis ferðir á sömu nýju leið gátu báðar séð ekkert row, önnur insert-aði, hin fékk unique violation og skildi eftir engra station rows.

**Fix:** Skipt út með `.upsert({...}, { onConflict: 'route_key' })`. Fields sem eiga EKKI að skrifast yfir við conflict (`usage_count`, `first_seen_at`, `created_at`) eru ekki í payload - DB defaults gilda á INSERT og þeir dálkar hrærast ekki á conflict UPDATE.

`usage_count` hækkar ekki lengur með hverri upsert - acceptable approximation per v541 handoff. Má laga seinna með SQL RPC.

### A2: Provider 0-station cleanup

**Vandamál:** Ef Vegagerðin cache var tiltækt en fann 0 stöðvar á leiðinni, voru gömlu Vegagerðarstöðvar látin lifa - þannig `/vedrid` sýndi síðasta non-empty set.

**Fix:** Bætt við `providersEvaluated: ReadonlyArray<'vedurstofan' | 'vegagerdin'>` í `RouteMemoryWriteInput`. Station replacement loop fer nú yfir `providersEvaluated` (ekki providers-in-stations). Þannig: provider evaluaður með 0 stöðvar = eyðir gömlum rows. Provider ekki available = rows í friði.

Travel route sendir:
- `['vedurstofan', 'vegagerdin']` þegar vegagerdin cache er fresh eða stale
- `['vedurstofan']` þegar vegagerdin unavailable

### A3: Route variant key frá `selectedRouteId`

**Vandamál:** Allar route variants (mismunandi leiðavalir) lentu í sömu `default` route-memory row og skrifuðu yfir hvort annað.

**Fix:** Travel route notar nú `selectedRouteId ?? undefined` sem `routeVariantKey` og passar það í bæði `buildRouteMemoryKey()` og `recordRouteMemory()`. Þannig `reykjavik--akureyri--some-route-id` og `reykjavik--akureyri--default` eru aðskilin rows. Lookup skilar variants; `/vedrid` notar nýjustu (index 0).

### A4: `routeLensResult` sync effect deps

**Vandamál:** Effect dependency var `[routeMemory.status]`. Þegar notandi fór úr leið A (resolved) í leið B (resolved), helst status `resolved`, effect keyrði ekki aftur, og panel label/query sat eftir frá leið A.

**Fix:** Dependency breytt í `[routeMemory, fromPlaceDraft, toPlaceDraft]`. Þar sem `setRouteMemory(...)` skapar alltaf nýtt object, keyrir effectið í hvert skipti sem routeMemory breytist - jafnvel þegar status er sami en IDs/label eru önnur. `eslint-disable` fjarlægt.

### A5: Provider access gating í lookup endpoint

**Vandamál:** `POST /api/teskeid/weather/route-memory/lookup` skilaði Vegagerðin station IDs án þess að athuga `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED`.

**Fix:** Lookup endpoint kannar nú `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED`. Ef sett: sækir user session og kannar `weather-provider-vegagerdin` feature access (`checkFeatureAccess`). Ef notandi hefur ekki access: `vegagerdinStationIds: []` í öllum variants. Sama gating og `/api/teskeid/weather/vegagerdin/current` notar.

### A7: `lib/iceland-routes/IcelandRoadmap.md`

Ný skrá. Skráir R0-R7 maturity levels:
- R0: Static segments (production)
- R1: Route families + corridor lens (transitional, being replaced)
- R2: Route observation / localStorage (production, local only)
- R3: Place normalization / city-level (production v539+)
- R4: Route-memory station sets / Supabase (code complete, needs sql/86)
- R5: Route-memory as primary `/vedrid` filter (code complete, needs sql/86)
- R6: Route variants + direction fallback (future)
- R7: Server-side route intelligence (future)

### B: Scrubber center-align

Bætt við `text-center` á:
- Vegagerðin group header label
- "Núna" sub-label
- Veðurstofan group header label
- Hvert dagsheiti á hægri hlið

Bætt við `items-center` á vinstri innri flex-col til að miðja Núna-label og knappinn lóðrétt.

### C.2: Auto-apply thresholds í alwaysOpen mode

Bætt við `useEffect` í `WeatherThresholdBar`:
```ts
useEffect(() => {
  if (!alwaysOpen) return
  const caution = parseFloat(draftCaution)
  const danger = parseFloat(draftDanger)
  if (valid && caution < danger) {
    setError(null)
    onApply({ cautionWindMs: caution, redWindMs: danger })
  }
}, [alwaysOpen, draftCaution, draftDanger, onApply])
```

Notandi þarf ekki lengur að smella á "Nota mörk" - kortaliturinn uppfærist sjálfkrafa þegar gildi eru gild. Apply-hnappur er ennþá til (kóðinn hreyfist ekki á honum) en hann er redundant. C.3 handoff minnir á að skipta honum út fyrir "Vista sem sjálfgefin vindmörk".

---

## Tests

```
npm run test:run -- (6 files)
Tests  145 passed (145)

npx tsc --noEmit
exit 0
```

---

## SQL staða

Óbreytt frá v540:

| Migration | Staða |
|---|---|
| `sql/86_weather_route_memory.sql` | SKRIFUÐ - EKKI KEYRÐ |
| `sql/85_route_observation_aggregate.sql` | DRAFT, DO NOT RUN |
| `sql/82_weather_user_preferences.sql` | Separate concern, ekki keyrð |

---

## Skrár sem breyttust í v541

- `lib/iceland-routes/routeMemory.server.ts` — atomic upsert, providersEvaluated
- `app/api/teskeid/weather/travel/route.ts` — selectedRouteId as variant, vegagerdinAvailable flag, providersEvaluated
- `components/weather/WeatherOverviewClient.tsx` — routeLensResult effect deps fix
- `app/api/teskeid/weather/route-memory/lookup/route.ts` — Vegagerðin access gating
- `lib/iceland-routes/IcelandRoadmap.md` — ný skrá
- `components/weather/WeatherSourceTimeSelector.tsx` — center-align
- `components/weather/WeatherThresholdBar.tsx` — auto-apply in alwaysOpen

---

## Verkefni sem eru eftir (v542+)

### Ekki gert í v541 pass

**A6: Tests fyrir routeMemory writer/lookup**

Prófin sem v541 handoff óskaði eftir eru ekki skrifuð. Þau þurfa Supabase mock sem er ekki trivially til í þessum test setup. Tillaga:

- `vitest.setup.ts` bæta við global `vi.mock('@/lib/supabase/admin', ...)` pattern
- Skrifa `lib/__tests__/route-memory-writer.test.ts` með:
  - upsert kallar `getAdmin().from(...).upsert(...)` með réttum payload
  - 0-station provider eyðir rows án þess að insertar
  - selectedRouteId verður routeVariantKey
  - write error er swallowed
- Handler test fyrir `/api/teskeid/weather/route-memory/lookup`

**C.3-C.4: "Vista sem sjálfgefin vindmörk" og threshold preferences API**

Þetta þarf:
1. `sql/82_weather_user_preferences.sql` keyrð (aðskilið leyfi)
2. `GET /api/teskeid/weather/preferences/thresholds` - sækir saved thresholds
3. `PUT /api/teskeid/weather/preferences/thresholds` - vistar thresholds
4. UI: "Vista sem sjálfgefin vindmörk" takki í alwaysOpen threshold bar
5. Login redirect flow með returnTo + pending thresholds í sessionStorage

Þetta er stærsta eftirstandandi verkefnið. Leggja til að Codex skili v543 handoff fyrir þetta.

**D: Vegagerðin pulse cameras**

`VegagerdinCurrentStationDto` og `vegagerdinCurrentTypes.ts` hafa engar camera/image fields. Upstream payload sem `/api/teskeid/weather/vegagerdin/current` notar er cache af Vegagerðin mælingum - ekki beinn tengill á Vegagerðin API. Fyrst þarf að athuga hvort Vegagerðin API gefur camera URLs í structured form (ekki HTML scraping). Þetta er research task áður en eitthvað er kóðað.

**SQL: route-memory migration keyra**

Stebbi þarf að keyra `sql/86_weather_route_memory.sql` með sérstöku leyfi. Þar til þá virkar route-memory lookup ekki í production (skilar miss). Þetta er áætlað eftir Codex review á v542.

---

## Localhost checks eftir SQL 86

Sama og í v540 handoff:

1. Áður en SQL keyrð: `/vedrid` crashi ekki; route-memory skilað sem miss.
2. Eftir SQL 86: Opna `/ferdalagid`, reikna Reykjavík → Akureyri. Staðfesta að travel result virkar.
3. Velja sama normalized Frá/Til á `/vedrid`. Expected: nákvæmar stöðvar úr `/ferdalagid`, ekki corridor cloud.
4. Velja aðra route option (selectedRouteId != null). Expected: aðskilin route-memory row, variant ID synleg í routeKey.
5. Miss flow: leið sem hefur ekki verið reiknuð → engar giskunar-stöðvar, miss UI.
6. Status filter empty → "Sýna allt" virkar (allMarkersHiddenByStatusFilter).
7. Vegagerðin access-gating: ef WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true, lookup skilar vegagerdinStationIds: [] fyrir notendur án access.

---

## Prerelease álit

v541 hardening er tiltækt til útgáfu. Kóðabreytingarn eru backwards-compatible: ef sql/86 er ekki keyrð, lookup skilar miss gracefully og `/vedrid` sýnir miss-state eða ófiltrað kort. Engin breyting á SQL schema þetta pass.

Næsti Codex review (v543) gæti fokúsað á C.3-C.4 (threshold save) eða D (camera research), eftir því hvað Stebbi prioriteerar.
