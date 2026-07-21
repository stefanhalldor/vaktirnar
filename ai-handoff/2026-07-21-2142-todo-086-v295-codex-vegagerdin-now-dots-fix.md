# 2026-07-21 21:42 - todo-086 v295 - Codex: Vegagerdin Nuna dots fix

Created: 2026-07-21 21:42
Timezone: Atlantic/Reykjavik

## Plan afangans

1. Greina af hverju `Nuna` gildi Vegagerdarinnar sjast ekki sem punktar a nyja MapLibre kortinu.
2. Staðfesta hvort vandinn se i API/gognum, filteri, GeoJSON eða layer-order.
3. Framkvaema litla afmarkada lagfaeringu ef root cause er skyr.
4. Keyra type-check, build og diff-check.
5. Skila handoff fyrir Stebba og Claude Code.

## Greining

Skjamyndin synir að neðri pillurnar telja Vegagerdarstodvar rett: `Innan marka (167)` og `Othaegilegt (15)`.
Thad thydir að client fetch a `/api/teskeid/weather/vegagerdin/current` virkar og flokkunin virkar.

Liklegasta root cause var layer-order:

- `triggerSegmentLoad()` fyrir `road-segments` byrjar async a map load.
- Overview station layerarnir eru buinir til sirna i sama `load` handler.
- Ef `road-segments` bætist vid eftir station layerana getur line-layerinn lent ofan a station dots.
- Vegagerdarstodvar liggja yfirleitt a veglinum, þannig breidar graenar veglinur geta hulið graena punkta alveg.

Codex bætti lika varnarlegri hnitunormaliseringu:

- Pillutalningar geta virkað þó hnit se strengir/numeric-like fra API/history fallback.
- MapLibre GeoJSON þarf raunveruleg finite number hnit.
- Nu eru `lat/lon` normaliseruð i `number` og ogild hnit sleppt ur map source.

## Hvad var raunverulega gert

Breytt i `components/weather/RoadMapPrototypeMap.tsx`:

- Bætti við `toFiniteCoordinate()` helper til að normalisera hnit áður en þau fara i GeoJSON.
- Bætti við `bringWeatherLayersToFront()` helper sem flytur weather layers efst i MapLibre layer-order:
  - `station-markers`
  - `overview-vedurstofan-stations`
  - `travel-bridge-weather-points`
  - `vedurstofan-route-stations`
  - `vegagerdin-route-stations`
- Overview Vegagerdin source notar nu `flatMap` og sleppir stodvum ef hnit eru ekki finite.
- Overview Vedurstofan source gerir sama.
- Eftir hverja overview source uppfaerslu er weather layerum lyft efst.
- `updateOverviewLayerVisibility()` lyftir weather layerum lika efst eftir visibility breytingu.
- `fetchAndRenderSegments()` lyftir weather layerum efst bæði þegar `road-segments` source er uppfaert og þegar layerinn er fyrst buinn til.
- Gamla handvirka route-only `moveLayer` blokkin var skipt ut fyrir sama sameiginlega helper.

## Skrar sem voru skodadar

- `WORKFLOW.md`
- `Design.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/providers/vegagerdinCurrentTypes.ts`
- `app/api/teskeid/weather/vegagerdin/current/route.ts`
- `lib/weather/providers/vegagerdinCurrent.server.ts`
- `components/weather/WindStatusFilterPills.tsx`

## Skrar sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-21-2142-todo-086-v295-codex-vegagerdin-now-dots-fix.md`

Athugid: `.obsidian/workspace.json` er dirty i git status en Codex snerti hana ekki. Hun a ekki að fara med i commit nema Stebbi vilji það serstaklega.

## Skipanir sem voru keyrdar

- `Get-Content -Encoding UTF8 'WORKFLOW.md' | Select-Object -First 220`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'Design.md' | Select-Object -First 220`
  - Exit code: 0
- `rg ... components/weather/RoadMapPrototypeMap.tsx`
  - Exit code: 0
- `Get-Content ... RoadMapPrototypeMap.tsx`
  - Exit code: 0
- `Get-Content ... vegagerdinCurrentTypes.ts`
  - Exit code: 0
- `Get-Content ... app/api/teskeid/weather/vegagerdin/current/route.ts`
  - Exit code: 0
- `npm run type-check`
  - Exit code: 0
- `git diff --check`
  - Exit code: 0
  - Aðeins CRLF warnings fyrir `.obsidian/workspace.json` og `RoadMapPrototypeMap.tsx`.
- `npm run build`
  - Exit code: 0
  - Build tokst.
  - Komu fyrirliggjandi lint warnings i odrum skram: `app/s/[sessionId]/page.tsx`, `components/landing/Avatar.tsx`, `components/weather/IcelandOverviewMap.tsx`, `TravelAuditMap.tsx`, `WeatherOverviewClient.tsx`.
  - Engin ny warning ur `RoadMapPrototypeMap.tsx`.
- `git status --short`
  - Exit code: 0
  - Synir `.obsidian/workspace.json` og `components/weather/RoadMapPrototypeMap.tsx` dirty.

## Hvad var ekki gert

- Enginn dev server var raestur.
- Engin browser/localhost prof voru keyrd af Codex.
- Engin SQL migration skrifud eða keyrd.
- Enginn commit.
- Enginn push.
- Enginn deploy.
- Engar env, Vercel, Supabase eða production breytingar.

## Akvardanir Codex tok

- Lagfaeringin er i map-rendering layer, ekki API layer, þvi API/pillutalningar syndu að data var til.
- Weather layer-order er nu sameiginlegt helper-mynstur frekar en ad hoc `moveLayer` fyrir route-only layers.
- Hnit eru normaliserud varnarlega, þo TypeScript contract segi `number`, þvi runtime/history fallback ma ekki geta gert MapLibre source osynilegan.
- Ekki var bætt við meiri UI texta eða controls.

## Ahaetta sem er enn til stadar

- Þetta þarf að staðfesta i browser: `Nuna` punktarnir eiga að sjast eftir reload og eftir að road-segments hafa hlaðist.
- Ef MapLibre layer-order breytist aftur i næstu skrefum þarf að nota `bringWeatherLayersToFront()` eftir allar addLayer adgerdir sem geta lent yfir weather dots.
- Station count notar enn fjolda allra Vegagerdarstodva, ekki fjolda valid GeoJSON features. Ef invalid hnit koma einhvern tima fra API gæti count verið aðeins hærra en punktar. Nu ætti það samt ekki að gerast i eðlilegu Vegagerdin payload.

## Design.md / mobile app-upplifun

Design.md var lesið. Breytingin fylgir reglunum þannig:

- Engin ny UI surface eða ny controls voru buin til.
- Kortið helst primary app surface.
- Lagfaeringin minnkar rugling: pillur og kort eiga nu að segja somu sogu.
- Enginn ny hardcode-adur notendatexti var settur i component.
- Engin breyting a input/font/mobile zoom hegðun.

## Route intelligence check

- Snertir Road Intelligence prototype a `/auth-mvp/vedrid/road-map-prototype`.
- Snertir ekki route matching, canonical segments eða route station matching logik.
- Lausnin er provider-neutral fyrir weather layer-order: bæði overview Vegagerdin, overview Vedurstofan og route weather layers eru lyft efst.
- Þetta er ekki ny þekking sem þarf i `IcelandRoadmap.md`; þetta er rendering/hardening i MapLibre component.

## Tillaga ad næsta skrefi

Claude Code eða Stebbi ætti að profa þetta a localhost/prod preview:

1. Staðfesta að `Vegagerdin / Nuna` punktar birtist eftir hard reload.
2. Staðfesta að punktarnir birtist áfram eftir að vegkaflar/road-segments klara að hlaðast.
3. Staðfesta að skipta yfir i Veðurstofu spátima syni Veðurstofu punkta.
4. Staðfesta að reiknuð leið feli overview punkta og syni route station punkta.
5. Staðfesta að `Hreinsa` route komi aftur i rétt overview mode.

## Spurningar fyrir Claude Code

- Vill Claude Code færa `bringWeatherLayersToFront()` i litið reusable MapLibre utility seinna ef fleiri kort fara að nota svipað layer-order mynstur?
- Ætti `stationCount` að telja valid GeoJSON features frekar en raw station count til að vera 100% samhljoma kortinu?
- Þarf route weather layer rendering að kalla helperinn eftir oll framtidar `addLayer` skref, ekki bara segment load?

## Fyrir Supabase / SQL / production

- Engin SQL.
- Engin RLS breyting.
- Engin auth/grants breyting.
- Engin production breyting.
- Engin notendagögn snert.
- Enginn beinn kostnaður.

## Localhost checks for Stebbi

Forsendur:

- Stebbi keyrir dev server sjalfur.
- Stebbi er innskradur notandi með `road-intelligence-v1`.
- `ROAD_INTELLIGENCE_V1_ENABLED=true` er i local env.

Prófa:

1. Opna `/auth-mvp/vedrid/road-map-prototype`.
2. Velja `Vegagerdin / Nuna` i scrubber ef það er ekki þegar valið.
3. Staðfesta að Vegagerdin punktar sjast a kortinu strax eða innan sekundu eftir að road-segments klara að hlaðast.
4. Zooma inn a Reykjavik eða Akureyri:
   - punktar eiga að liggja ofan a vegakerfi/vegkoflum, ekki hverfa undir grænum veglinum.
5. Smella a punkt:
   - popup með vind, vindhviðu og lofthita a að opnast.
6. Smella a `Fela vegakerfi` og `Fela vegfærð`:
   - punktar eiga ekki að hverfa nema filter/pillur feli þá.
7. Skipta i Veðurstofu spátima:
   - Vegagerdin punktar hverfa og Veðurstofu punktar birtast.
8. Skipta aftur i `Nuna`:
   - Vegagerdin punktar birtast aftur.
9. Reikna leið, t.d. `Akureyri -> Egilsstadir`:
   - overview punktar eiga að felast.
   - route station/route weather punktar eiga að vera ofan a route/vegkoflum.
10. Hreinsa route:
   - overview punktar eiga að koma aftur.

Regression sem þarf að passa:

- Enginn horizontal overflow a mobile.
- Bottom strip ma ekki hylja status-pillur eða gera kortid onotanlegt.
- `.obsidian/workspace.json` a ekki að fara með i commit nema meðvituð ákvörðun.
