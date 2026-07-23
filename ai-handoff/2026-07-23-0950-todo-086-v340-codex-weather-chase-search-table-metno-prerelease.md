# 2026-07-23 09:50 - TODO 086 v340 - Codex Weather Chase Search/Table + Yr/met.no Prerelease

## Plan áfangans

1. Rýna núverandi `Elta veðrið` prufuhluta í nýja MapLibre-kortinu.
2. Fjarlægja neðra `Bæta við stað` carousel og hafa eina lifandi leit.
3. Láta leit sýna bæði Veðurstofu Íslands og Yr/met.no staði.
4. Þegar fleiri en þrír staðir eru valdir: snúa töflunni þannig að staðir séu í fyrsta dálki og tímar efst, með sticky staðardálki.
5. Leyfa Stebba að raða völdum stöðum.
6. Sækja Yr/met.no gögn lazy þegar slíkur staður er valinn, svo við sækjum ekki spár fyrir allt static staðasafnið.

## Hvað var gert

- `WeatherChasePanel` var endurbyggður sem sjálfstæðari samanburðarhluti:
  - ein leit með dropdown sem birtist á meðan slegið er inn
  - selected staðir eru ordered listi, ekki `Set`
  - valdir staðir hafa `upp`, `niður` og `fjarlægja`
  - >3 staðir rendera sem horizontal tafla með sticky staðardálki
  - <=3 staðir halda einfaldri lóðréttri samanburðarsýn
  - compact taflan notar nú öll tiltæk forecast-gögn, ekki bara fyrstu 5 daga
  - drawerinn notar sömu renderer-lógík og fær þannig sömu table hegðun
- Nýr read-through API endpoint var bætt við:
  - `GET /api/teskeid/weather/metno/point?lat=...&lon=...`
  - notar núverandi `fetchForecast()` helper fyrir met.no
  - validate-ar lat/lon innan Íslandsramma
  - skilar `HourPoint[]` til client
- `RoadMapPrototypeMap` tengir nú `Elta veðrið` við bæði:
  - Veðurstofu Íslands stöðvar úr núverandi `/vedurstofan/stations` gögnum
  - Yr/met.no staði úr `ROAD_MAP_PLACES`
- Yr/met.no staðir eru lazy-loaded þegar þeir eru valdir í panelnum.
- Bætt við þýðingum fyrir:
  - Yr/met.no provider label
  - `Færa upp`
  - `Færa niður`
  - breytt `Bæta við stað` yfir í `Niðurstöður` fyrir dropdown.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherWatchersComparison.tsx`
- `lib/weather/metno.server.ts`
- `lib/weather/types.ts`
- `lib/road-intelligence/roadMapPlaces.ts`
- `middleware.ts`
- `messages/is.json`
- `messages/en.json`

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/teskeid/weather/metno/point/route.ts`
- `messages/is.json`
- `messages/en.json`

## Skipanir keyrðar

- `rg ...` til að finna núverandi weather/Yr/met.no componenta og helpers.
- `Get-Content ...` til að lesa viðeigandi kafla í kóða, `WORKFLOW.md` og `Design.md`.
- `npm run type-check`

## Niðurstöður og exit codes

- `npm run type-check` lauk með exit code `0`.

## Hvað mistókst eða var sleppt

- Ég útfærði ekki enn fulla "sjá nálægar Veðurstofustöðvar hjá Yr gildum" UI-lógík.
  - Núverandi fyrsta skref sýnir bæði gagnaveitur í sömu leit, þannig að leit á t.d. `Akureyri` ætti að sýna bæði Yr/met.no stað og nærliggjandi/nefndar Veðurstofustöðvar ef þær passa við leitarstrenginn.
  - Næsta skref getur raðað Veðurstofu-niðurstöðum eftir fjarlægð frá Yr-stað sem notandi er að skoða.
- Ég bætti ekki persistence fyrir selected/röðuð staðaval notanda. Þetta er enn session/client state í prototype.
- Ég keyrði ekki browser automation eða dev server. Stebbi keyrir localhost sjálfur samkvæmt workflow.

## Ákvarðanir sem Codex tók

- Lazy-load Yr/met.no forecast aðeins þegar notandi velur Yr/met.no stað.
  - Ástæða: `ROAD_MAP_PLACES` er static listi og það væri óþarft að sækja forecast fyrir alla staði bara til að sýna dropdown.
- Halda Veðurstofu Íslands default selection eins og áður, því þau gögn eru þegar tiltæk úr overview station response.
- Nota `ROAD_MAP_PLACES` sem fyrsta Yr/met.no staðasafn.
  - Þetta gefur nothæfa fyrstu prufu án nýrrar search API hönnunar.
- Nota núverandi `fetchForecast()` met.no helper.
  - Þetta samnýtir núverandi cache og parse-lógík.

## Áhætta sem er enn til staðar

- Nýi met.no endpointinn notar `fetchForecast()`, sem les og skrifar í `weather_cache` með service-role helper eins og núverandi ferðaveður gerir. Þetta er ekki schema-breyting og engin migration var keyrð, en endpointið getur búið til cache rows þegar Yr/met.no staður er valinn.
- Endpointinn er ekki settur á public allowlist í `middleware.ts`.
  - Það er viljandi í þessari prufu þar sem nýja road-map prototype er innskráð/auth-mvp flæði.
  - Ef við viljum síðar sýna `Elta veðrið` á public `/vedrid` þarf explicit security review á public exposure.
- Dropdown sorting er basic text matching. Næsta betra skref er provider-aware ranking:
  - exact Yr place fyrst
  - nearby Veðurstofan stöðvar næst
  - aðrar matches þar á eftir.
- >3 taflan getur orðið mjög breið ef margar stöðvar og allir 3h tímar eru valdir í drawer. Hún er lárétt scrollanleg og sticky first column, en þarf mobile prófun.

## Tillaga að næsta skrefi

1. Prófa á localhost að dropdown, lazy Yr/met.no fetch og sticky tafla virki.
2. Ef það virkar: bæta provider-aware search ranking við `WeatherChasePanel`/parent:
   - þegar query passar við Yr-stað, sýna 3-5 næstu Veðurstofustöðvar sem "nálægar Veðurstofustöðvar".
3. Vista selected/röðuð staðaval niður á notanda síðar, líklega í preferences eða nýrri weather-chase table, þegar UX hefur verið staðfest.

## Spurningar fyrir Claude Code / Stebba

- Á `Elta veðrið` að vera innskráð-only í fyrstu production útgáfu, eða á það að verða public líka?
- Eigum við að setja provider-aware search í næsta skref eða fyrst staðfesta núverandi UX?
- Á default selection að vera Veðurstofu-stöðvar eins og nú, eða Yr/met.no staðir sem líkjast gamla `Fyrir þá sem eru að elta veðrið` betur?

## Supabase / gögn / RLS

- Engin SQL-skrá var skrifuð eða keyrð.
- Engin RLS/grant/policy breyting.
- Nýr endpoint notar núverandi met.no cache helper:
  - les úr `weather_cache`
  - getur upsertað cache row fyrir met.no punktaspá
  - snertir ekki notendagögn
  - ætti ekki að veikja auth eða RLS, en public exposure þarf sér rýni ef endpointinn verður public.

## Design.md athugun

- Viðeigandi kaflar voru lesnir: mobile-first, input, horizontal overflow/sticky controls.
- Leit notar 16px input texta til að forðast mobile zoom.
- Stóra taflan er með explicit `overflow-x-auto` og sticky staðardálk, frekar en að valda page-level horizontal overflowi.
- Controls eru inni í prototype overlay og ættu að virða mobile app upplifun; þarf samt localhost/mobile prófun.

## Localhost checks for Stebbi

1. Opna `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`.
2. Smella á `🌦️` takkann efst til vinstri.
3. Prófa leit:
   - skrifa `Akureyri`
   - vænt: dropdown birtist strax á meðan skrifað er
   - vænt: sjá bæði Yr/met.no niðurstöðu og Veðurstofu niðurstöðu ef station nafnið passar leitinni
4. Velja Yr/met.no stað:
   - vænt: staðurinn bætist við valda staði
   - vænt: stutt `Sæki spár...` eða taflan fyllist þegar forecast kemur
   - í terminal ætti að sjást kall á `/api/teskeid/weather/metno/point?...`
5. Velja 4+ staði:
   - vænt: taflan snýst þannig að staðir eru í fyrsta dálki
   - vænt: tímasetningar eru efst
   - vænt: staðardálkur helst fastur þegar skrunað er lárétt
6. Prófa röðun:
   - smella `↑` og `↓` á völdum stað
   - vænt: röð staða í töflunni breytist strax
7. Prófa að fjarlægja stað:
   - smella `×`
   - vænt: staðurinn hverfur úr chip-lista og töflu.
8. Regressions:
   - `🚗` aksturspanel má enn opnast og loka weather-chase overlay
   - `💬` Teskeiðarpúls má enn opnast og loka weather-chase overlay
   - MapLibre kortið sjálft á ekki að frjósa við það eitt að opna/loka `Elta veðrið`.

Ekki prófa production eða Supabase migration út frá þessu. Það var ekkert deployað og engin migration keyrð.
