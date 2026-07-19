# 2026-07-18 18:27 - TODO 086 v521 - Codex: v520 review and lightweight route filter plan

Created: 2026-07-18 18:27  
Timezone: Atlantic/Reykjavik

## Stutt mannamál

v520 lítur vel út: Hólmavík ID-gallinn er lagaður, forecast-slot grouping er sameinað í helper, Vegagerðin fallback er komin í pure predicate með prófum, og targeted checks eru græn.

Næsta stóra hugmyndin er mjög góð: setja `Frá` / `Til` beint á `/vedrid` sem létt route-linsa sem filterar kortið niður á punkta á valdri leið. Þetta má gera án nýs Google Routes-kostnaðar ef og aðeins ef við notum cache/eigin IcelandRoadmap-grunn og köllum ekki sjálfkrafa í Google þegar cache miss verður.

## Findings

### Engin release-blocking findings í v520

Ég fann ekki augljósan blocker í v520 breytingunum. Þetta er ágætlega scoped og fer í rétta átt:

- `lib/iceland-routes/segments.ts` notar nú ASCII-safe `holmavik-sudurleid`.
- `lib/weather/forecastSlotHelpers.ts` fjarlægir duplicated day grouping milli scrubber og source selector.
- `lib/weather/vegagerdinFallback.ts` er pure helper sem er unit-testanlegur.
- `WeatherOverviewClient` heldur áfram að nota provider-neutral shell og source/time selector.

### Low: fallback er unit-testaður sem predicate, ekki integration flow

`lib/weather/vegagerdinFallback.ts` er vel testaður, en það er enn ekki component/e2e test sem sannar að `/vedrid` fer raunverulega úr `now` yfir í fyrsta Veðurstofu-slot þegar Vegagerðin er empty/restricted/error og forecast slot er til.

Þetta er ekki blocker, en gott regression-próf síðar þegar overview route-linsan kemur inn, því hún mun fjölga state-combinations á sama skjá.

## Staðfestingar sem ég keyrði

```bash
npm run type-check
# exit 0

npm run test:run -- lib/__tests__/iceland-routes-segments.test.ts lib/__tests__/vegagerdinFallback.test.ts lib/__tests__/windObservationStatus.test.ts
# exit 0
# 3 test files passed, 49 tests passed
```

Ég keyrði ekki localhost/browserpróf og engin SQL, migration, Supabase, Vercel, commit, push eða deploy.

## Design.md rýni

Þessi næsta breyting snertir UI/form/navigation og þarf að fylgja `Design.md`:

- `/vedrid` á áfram að vera mobile-first og ekki fá horizontal overflow.
- `Frá` / `Til` inputs þurfa minnst 16px texta á mobile svo Safari zoom-i ekki.
- Route-option val á að nota segmented/list-card mynstur sem er skýrt og touch-friendly.
- Ef route-linsan sækir cache eða bíður eftir resolution þarf sýnilegt pending state.
- `Ferðalagið` CTA á að vera áfram dýpri aðgerð, ekki ruglast við létta route-linsu.

## Route intelligence check

- Snertir: `/vedrid` overview, route cache, provider station filtering, route options, IcelandRoadmap R4/R5.
- Ný þekking á heima í `IcelandRoadmap.md` og `lib/iceland-routes/`, ekki inni í `WeatherOverviewClient` sem sérlausn.
- Lausnin þarf að vera provider-neutral: sama selected route á að filtera Vegagerð og Veðurstofu.
- Þarf líklega nýja route-lens contract/types í `lib/iceland-routes/` og mögulega cache-key helper.
- Privacy: ekki geyma raw heimilisföng eða persónulegar leiðir í þessum fasa. Ef áhugi er talinn, gera það segment-level aggregate.
- Kostnaður: cache-only route lens má ekki kalla í Google Routes sjálfkrafa.

## Svar við kostnaðarpælingunni

Já, þetta er hægt að gera án nýs Google Routes API-kostnaðar, en með mikilvægri afmörkun:

1. **Cache hit:** ef leið eða route-family er til í cache/eigin grunni, getum við filterað punktana án Google Routes.
2. **Canonical route:** ef `Frá/Til` passar við þekkta route-family í `lib/iceland-routes/`, getum við notað okkar eigin segment/control-point grunn.
3. **Cache miss:** ef notandi slær inn arbitrary heimilisfang/par sem við þekkjum ekki, þá er ekki hægt að reikna trausta leið án annaðhvort Google/geocoding eða eigin road graph.

Þess vegna ætti v1 að vera `cache-only`:

- leita í cache/eigin route families
- ef route finnst, filtera kortið
- ef route finnst ekki, sýna milda stöðu: „Þessi leið er ekki til í hraðskjánum enn. Opna Ferðalagið til að reikna hana.“
- Google Routes kall gerist bara ef notandi fer meðvitað í fulla `Ferðalagið` flæðið eða við höfum sérstaklega samþykkt cache-warm/fallback hegðun

Ath: Google Maps kortið sjálft getur enn haft venjulegan map/tile kostnað eins og núverandi `/vedrid`; þetta svar snýr að Routes API/reiknikostnaði.

## Næsta stóra framkvæmdarhandoff fyrir Claude Code

Claude Code, rýndu fyrst með `Workflow`-gleraugum. Ef engar blocking spurningar koma upp, má útfæra afmarkaða cache-only route-linsu á `/vedrid` án SQL-keyrslu, án production-breytinga, án commit/push/deploy og án sjálfvirkra Google Routes-kalla.

### Markmið

Bæta við lightweight `Frá` / `Til` leiðarvalsmöguleika á `/vedrid` sem filterar kortið niður á punkta á valdri leið þegar leiðin er til í cache eða eigin IcelandRoadmap route-grunni.

Þetta er ekki full ferðaveðurútreikningur. Þetta er route-linsa fyrir overview-kortið.

### Scope

1. Halda v520 breytingum óbreyttum nema rýni sýni raunverulegan galla.
2. Búa til reusable route-lens domain contract í `lib/iceland-routes/`, t.d.:
   - `OverviewRouteLensQuery`
   - `OverviewRouteLensResult`
   - `CachedRouteOptionSummary`
   - `RouteLensResolutionStatus`
3. Búa til cache-only resolver sem:
   - notar bara núverandi cache/eigin route family gögn
   - kallar aldrei sjálfkrafa í Google Routes
   - skilar `cache_miss` ef leið finnst ekki
4. Búa til UI component fyrir `/vedrid`, t.d. `OverviewRouteLensPanel`, sem:
   - hefur `Frá` og `Til`
   - sýnir route options ef cache/eigin grunnur skilar fleiri en einni leið
   - sýnir skýrt cache miss og CTA í `Ferðalagið`
   - veldur ekki mobile zoom/overflow
5. Tengja selected route við map layer filtering:
   - sama route filter gildir fyrir Vegagerð og Veðurstofu
   - status filter pills undir korti telja aðeins punkta eftir route-filter
   - ef enginn route filter er virkur sýnir `/vedrid` áfram allt Ísland eins og núna
6. Nota/reuse-a existing provider marker map layer og WindStatusFilterPills; ekki búa til sér status-lógík.
7. Uppfæra `IcelandRoadmap.md` ef nýr route-lens fasi/contract bætist við.
8. Bæta við targeted tests fyrir pure resolver/filter-lógík, án browser/dev server.

### Mikilvæg mörk

- Ekki kalla Google Routes úr overview route-lens nema Stebbi samþykki það sérstaklega.
- Ekki skrifa eða keyra migration í þessu skrefi.
- Ekki geyma raw `from/to` sem persónuleg route history.
- Ekki flytja fulla `/ferdalagid` útreikninga inn á `/vedrid`.
- Ekki tvítaka route-option UI eða provider matching ef til eru reusable helpers frá ferðalaginu.

### UX ákvörðun

Route-linsan á að vera létt:

- Hún svarar: „Hvaða punktar á landinu skipta mig líklega máli fyrir þessa leið?“
- Fulla CTA-ið `Ferðalagið` svarar áfram: „Hvenær er best að leggja af stað og hvernig er veðrið á leiðinni?“

### Cache miss UX

Ef route finnst ekki í cache/eigin grunni:

- halda Íslandskortinu ófilteruðu
- sýna róleg skilaboð undir inputs
- bjóða `Ferðalagið` CTA með `from/to` prefill ef hægt er
- enginn sjálfvirkur Google-kostnaður

### Route option UX

Ef fleiri en ein leið finnst:

- sýna route option cards/pills svipað og fyrsta skrefið í `Ferðalagið`
- notandi velur route option
- kortið filterast eftir völdu route option
- selected route má síðar fara inn í URL state, en byrja má með client state ef það heldur scope niðri

## Suggested implementation order

1. Inventory existing route/cache helpers and current `/ferdalagid` route option types.
2. Define route-lens types in `lib/iceland-routes/`.
3. Implement pure `resolveOverviewRouteLensCacheOnly(...)` with fixtures/tests.
4. Implement pure `filterProviderMarkersForRouteLens(...)` with tests.
5. Add `OverviewRouteLensPanel` UI above map/source selector or between source selector and thresholds, whichever reads best on mobile.
6. Wire result into `WeatherOverviewClient` and recompute status counts after route filtering.
7. Add copy in `messages/is.json` and `messages/en.json`.
8. Type-check and targeted tests.
9. Handoff immediately.

## Localhost checks for Stebbi

1. Open `/vedrid` as public and authenticated user at 360, 390, 460 px widths.
2. Confirm initial load still shows all Iceland points when no route-lens query is active.
3. Enter a cached/known route, e.g. `Reykjavík` → `Akureyri` if available in cache/fixtures.
4. Confirm map filters to points on that route only, and both Vegagerð and Veðurstofan obey the same route filter.
5. Toggle `Núna` / forecast slots and confirm route filter stays active.
6. Toggle wind-status pills and confirm counts reflect the filtered route, not all Iceland.
7. Try a route that is not cached. Expected: no Google call, clear cache-miss message, map remains usable, `Ferðalagið` CTA can continue the journey.
8. Test route options if multiple are returned: switching option changes filtered points.
9. Confirm no mobile horizontal overflow and inputs do not trigger zoom.

## Óvissa / þarf að staðfesta

- Ég staðfesti ekki hvaða route cache tables/helpers eru þegar til í kóðanum. Claude Code þarf að inventory-a það áður en nýr contract er valinn.
- Ef existing cache geymir Google-derived route geometry þarf að passa Google API skilmála áður en það verður notað sem almennur route cache.
- Ef við viljum styðja arbitrary heimilisföng án Google þarf það að færast í eigin IcelandRoadmap graph/geocoder fasa, ekki fela það inni í `/vedrid` UI.
