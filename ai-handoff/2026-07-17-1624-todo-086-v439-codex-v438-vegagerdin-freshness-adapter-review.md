# Codex review — v438 Vegagerðin freshness adapter

Created: 2026-07-17 16:24  
Timezone: Atlantic/Reykjavik  
Source reviewed: `2026-07-17-1613-todo-086-v438-claude-b4b-b4c-vegagerdin-freshness-adapter.md`

## Stutt samantekt

v438 er í rétta átt: Vegagerðin er komin inn sem cache-only provider, án live-fetch, og ferskleiki cache vs. mælinga er aðgreindur. Það er gott og öruggt skref.

Ég myndi samt ekki halda áfram í route-matching eða stærri Vegagerðarvirkni fyrr en búið er að herða fjögur atriði:

1. Access-contract fyrir provider-gate má ekki krefjast óvart `vedrid` row þegar `WEATHER_ENABLED=All`.
2. API route á að skila client-safe DTO, ekki internal provider shape beint.
3. Vegagerðarspjaldið þarf allan notendatexta úr `messages/*` og má ekki sýna raw enum eins og `fresh`.
4. Provider strip/marker status þarf skýrari empty/stale framsetningu.

Þetta er ekki gagnaleki eða RLS-brot eins og staðan er núna. Þetta eru product-contract, API-boundary og UI-hardening atriði sem verða ódýrari að laga strax.

## Findings

### 1. Medium: Vegagerðin provider gate krefst bæði `vedrid` og provider-row

Í [app/api/teskeid/weather/vegagerdin/current/route.ts](../app/api/teskeid/weather/vegagerdin/current/route.ts:17) er restricted mode svona:

- sækja user
- `checkFeatureAccess(..., 'vedrid')`
- `checkFeatureAccess(..., 'weather-provider-vegagerdin')`
- banna ef annað hvort vantar

Vandinn er að weather base access-módelið er nú ekki lengur “allir innskráðir þurfa `vedrid` row”. Í [lib/weather/weatherBaseAccess.server.ts](../lib/weather/weatherBaseAccess.server.ts:20) segir contractið að `WEATHER_ENABLED=All` leyfi public og signed-in public-tier notendur án `vedrid`. Ferðaveðurs-route-ið fylgir því fyrir Veðurstofuna: það krefst provider-access þegar provider-gate er true, en ekki sér `vedrid` row í þeirri provider-check grein ([app/api/teskeid/weather/travel/route.ts](../app/api/teskeid/weather/travel/route.ts:247)).

Áhrif:

- Ef `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true` og Stebbi setur notanda bara á `weather-provider-vegagerdin`, þá getur endpointið samt skilað `403` ef notandinn er ekki líka með `vedrid`.
- Þetta er sérstaklega líklegt að verða ruglingslegt þar sem admin UI er með sér provider-lista.

Tillaga:

- Búa til eða endurnýta provider-access helper sem segir:
  - ef `WEATHER_ENABLED=off` -> lokað
  - ef provider access env er ekki `true` -> opið öllum sem mega sjá veðrið
  - ef provider access env er `true` -> signed-in user þarf bara provider feature row fyrir þann provider
- Bæta route-level unit tests fyrir `/api/teskeid/weather/vegagerdin/current`:
  - `WEATHER_ENABLED=All`, provider gate off/unset, signed-out -> 200/unavailable eða 200/ok
  - `WEATHER_ENABLED=All`, provider gate true, signed-out -> 401
  - `WEATHER_ENABLED=All`, provider gate true, signed-in með provider row en án `vedrid` -> 200
  - `WEATHER_ENABLED=All`, provider gate true, signed-in án provider row -> 403

### 2. Medium: API route skilar internal provider shape beint út á client

Í [app/api/teskeid/weather/vegagerdin/current/route.ts](../app/api/teskeid/weather/vegagerdin/current/route.ts:41) er response:

```ts
stations: payload.measurements
```

Og clientinn import-ar internal provider type í [components/weather/WeatherOverviewClient.tsx](../components/weather/WeatherOverviewClient.tsx:35).

Þetta lekur ekki user data núna, en þetta bindur public API contract beint við server-side normalized shape. Ef `VegagerdinCurrentMeasurement` fær seinna innri debugging/meta fields, raw source fields eða provider-specific gagnastrúktúr, þá fer það sjálfkrafa út á client.

Tillaga:

- Búa til `VegagerdinCurrentStationDto` eða provider-neutral current-observation DTO.
- API route mappar explicit:
  - `stationId`
  - `stationName`
  - `lat`
  - `lon`
  - `measuredAtIso`
  - `fetchedAtIso`
  - `meanWindMs`
  - `gustLast10MinMs`
  - `windDirectionDeg`
  - `windDirectionText`
  - `airTemperatureC`
  - `roadTemperatureC`
  - `dataQuality`
- Client notar DTO type, ekki server provider type.

Þetta passar líka við markmiðið okkar: provider-neutral shell og adapterar sem megi endurnýta síðar fyrir Vegagerðina, Veðurstofuna og aðra gagnaveitur.

### 3. Medium: Vegagerðarspjaldið hardcode-ar notendatexta og sýnir raw enum

Í [components/weather/WeatherOverviewClient.tsx](../components/weather/WeatherOverviewClient.tsx:657) er `VegagerdinStationDetail` með hardcoded texta:

- `closeLabel="Loka"`
- `Átt`
- `Lofttemp.`
- `Vegatemp.`
- `Sótt kl.`
- `Mælingarferskleiki`
- raw enum í UI: `fresh`, `aging`, `stale`

Þetta brýtur vinnuregluna okkar að allur notendatexti eigi að vera í `messages/is.json` og `messages/en.json`. Það er líka ópússað að sýna notanda enskt enum.

Tillaga:

- Færa alla þessa strengi í `messages/is.json` og `messages/en.json`.
- Mappa `MeasurementFreshness` yfir í notendavænan texta, t.d.:
  - `fresh` -> `ný mæling`
  - `aging` -> `mæling að eldast`
  - `stale` -> `gömul mæling`
  - `unknown` -> ekki sýna eða `óþekktur mælitími`
- Nota sömu formattera fyrir tíma og dagssetningu og overview/Veðurstofan notar, ekki `slice(11,16)` sem long-term contract.

### 4. Medium/UX: Empty Vegagerðin provider verður grátt provider-item án skýringar

Í [components/weather/WeatherOverviewClient.tsx](../components/weather/WeatherOverviewClient.tsx:328) er `unavailableReason='empty'` þegar cache er tómt. En [components/weather/WeatherOverviewShell.tsx](../components/weather/WeatherOverviewShell.tsx:244) sýnir status texta bara fyrir `upcoming`, `restricted` og `error`.

Áhrif:

- Notandi gæti séð gráan “Vegagerðin” provider án útskýringar.
- Það lítur út eins og brotin virkni, sérstaklega þegar við erum að setja þetta í stærra Íslandskort.

Tillaga:

- Annaðhvort fela providerinn þegar cache er tómt, eða sýna skýrt:
  - `Engin mæligögn enn`
  - `Engin gögn í cache`
  - eða halda honum sem `Í vinnslu` þar til cron/live-fetch er virkt.

Ég myndi velja skýran status texta á meðan við erum að þróa, því það hjálpar við prófanir.

### 5. Low/Medium: Vegagerðar markers eru alltaf grænir þó mælingar séu stale

Í [components/weather/WeatherOverviewClient.tsx](../components/weather/WeatherOverviewClient.tsx:311) er `tone: 'ok'` fyrir alla Vegagerðar markers.

Þetta er ekki route-risk útreikningur, og gott að v438 blandar þessu ekki inn í brottfararscrubber. En á overview-korti getur grænn punktur samt lesist sem “allt í góðu” þó mælingarnar séu gamlar.

Tillaga:

- Nota `measurementFreshness` til að lita provider-layer status:
  - fresh -> grænt
  - aging -> gult eða mild warning
  - stale/unknown -> grátt eða muted
- Þetta á að merkja gagnagæði/ferskleika, ekki aksturshættu.

### 6. Low/Test gap: Nýi API route access-contractinn er ekki prófaður beint

Það eru góð próf fyrir parser, guard, feature-access API, SQL og middleware. En `rg` fann ekki route-level unit test fyrir `/api/teskeid/weather/vegagerdin/current`.

Þetta skiptir máli því við höfum brennt okkur á provider/env access samspili áður.

Tillaga:

- Bæta við sérstakri test-skrá eða viðeigandi kafla sem mock-ar:
  - `createClient().auth.getUser()`
  - `checkFeatureAccess`
  - `readVegagerdinCurrentFromCache`
- Prófa bæði open/graduated og restricted mode, eins og í finding #1.

## Staðfestingar sem ég keyrði

- `npm run type-check`  
  Niðurstaða: clean, exit code 0.

- `npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/sql-migration.test.ts`  
  Niðurstaða: 5 files passed, 447 tests passed, exit code 0.

Ég keyrði ekki fulla test suite og ekki localhost/browserpróf.

## Vinnumappa / scope athugun

`git status --short` sýnir margar ócommittaðar breytingar og nokkrar eyddar/ótracked handoff-skrár sem virðast ekki allar tengjast v438 beint. Ég snerti þær ekki.

Codex-rýnin hér beinist að v438 og þeim skrám sem tengjast Vegagerðar-adapterinum, provider shell og access-reglum.

## Næsta stóra framkvæmdaskref fyrir Claude Code

Taka eitt stærra hardening-skref áður en haldið er í Vegagerðar live-fetch eða route-matching:

### B4D — Vegagerðin adapter hardening og provider-neutral contract

1. Búa til shared provider access helper fyrir provider-gates.
   - Nota sama contract fyrir Veðurstofuna og Vegagerðina eins langt og raunhæft er.
   - Ekki krefjast `vedrid` row þegar `WEATHER_ENABLED=All` gefur base weather access.
   - Provider-gate true á bara að krefjast provider-specific row fyrir innskráðan notanda.

2. Bæta route-level tests fyrir `/api/teskeid/weather/vegagerdin/current`.
   - Cover-a open mode, restricted mode, signed-out, signed-in með/án provider row.
   - Prófa `unavailable` response líka.

3. Búa til client-safe DTO fyrir Vegagerðar current measurements.
   - Explicit mapping í API route.
   - Client má ekki import-a server provider type.

4. Færa allan Vegagerðar user-facing texta í `messages/is.json` og `messages/en.json`.
   - Sérstaklega `closeLabel`, labels, freshness labels.
   - Ekki sýna raw enum í UI.

5. Laga provider strip empty/stale UX.
   - `empty` fær skýran status texta eða providerinn er falinn þar til cache er til.
   - `measurementFreshness` litar eða merkir layer sem gagnagæði, ekki aksturshættu.

6. Halda áfram að tryggja að Vegagerðin hafi engin áhrif á:
   - brottfararscrubber
   - worst point
   - selected point
   - `selectDecisiveProvider`
   - trip risk / route recommendation

7. Handoff eftir framkvæmd.
   - Ekki keyra live Vegagerðin fetch.
   - Ekki keyra SQL.
   - Ekki commit-a/push-a/deploy-a.

## Næstu fasar eftir B4D

### B4E — Live response verification, ekki rollout

Markmið: staðfesta raunverulega Vegagerðar API shape áður en cron/cache writer er tengdur.

Leiðir:

- Annaðhvort Stebbi límir inn sanitized sample response.
- Eða Claude Code biður sérstaklega um leyfi fyrir read-only external fetch með fullri leyfisbeiðni samkvæmt `WORKFLOW.md`.

Útkoma:

- Uppfæra parser ef live shape víkur frá fixture.
- Bæta testum með sanitized live fixture.
- Enn ekki nota live gögn í notendaflæði nema Stebbi biðji sérstaklega.

### B4F — Vegagerðin route layer, cache-only

Markmið: sýna Vegagerðarstöðvar/mælipunkta á route selection / overview með sömu provider-neutral shell og Veðurstofan.

Reglur:

- Nota sama `matchProviderPointsToRoute` grunn og provider shell.
- Nota Vegagerðina sem current-measurement layer, ekki forecast/risk layer.
- Púls/chat core á að vera endurnýtanlegt áfram, ekki sérsmíðað fyrir Vegagerðina.

### B5 — Vegagerðin inn í ferðaveður með varúð

Ekki byrja fyrr en B4D/B4E/B4F eru örugg.

Markmið:

- Vegagerðin birtist sem current road-condition evidence.
- Ekki láta Vegagerðina “trompa” forecast providers fyrr en product-reglur eru skýrar.
- Huga að því hvernig current hviður/vegahiti/vegaskilyrði birtast við hlið spár.

## Spurningar fyrir Stebba / Codex næst

1. Á Vegagerðin current layer að vera public þegar `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` er eytt, eða eigum við að halda honum per-user þar til live fetch/cache writer er staðfestur?
2. Á empty cache provider að sjást sem “í vinnslu” eða vera falinn alveg?
3. Eigum við að nota measurement freshness til að lita markers strax, eða bara texta fyrst?

## Localhost checks for Stebbi

Eftir B4D ætti Stebbi að prófa:

1. Opna `/vedrid` sem public notandi.
   - Ef Vegagerðin er ekki opin: engin skrýtin villa og provider strip má ekki líta brotið út.
   - Ef Vegagerðin er opin en cache tómt: skýr empty/í-vinnslu staða, ekki dularfullur grár provider.

2. Opna `/auth-mvp/vedrid` sem innskráður notandi án `weather-provider-vegagerdin`.
   - Með `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true`: notandi sér ekki Vegagerðina.
   - Met.no og Veðurstofan hegða sér óbreytt.

3. Opna `/auth-mvp/vedrid` sem innskráður notandi með `weather-provider-vegagerdin` en án private `vedrid` row.
   - Með `WEATHER_ENABLED=All`: notandi á að sjá Vegagerðina ef provider row er til.
   - Þetta er mikilvæga regression-prófið fyrir finding #1.

4. Ef cache fixture/gögn eru til:
   - Velja Vegagerðar marker á overview.
   - Detail spjald sýnir núverandi mælingu, ekki spá.
   - Texti er á íslensku, engin raw enum eins og `fresh`.
   - Gömul mæling er greinilega merkt sem gömul/að eldast, ekki bara græn.

5. Prófa mobile viewport.
   - Provider strip má ekki valda horizontal overflow.
   - Detail spjald á að vera læsilegt án zooms.
   - Close/marker selection á að virka án þess að notandi missi kortastöðu.

Ekki prófa live-fetch eða cron nema Stebbi biðji sérstaklega um það og gefi leyfi.
