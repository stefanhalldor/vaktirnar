# TODO 086 - v308 Codex now-route state hotfix prerelease

Created: 2026-07-22 08:33  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Status: Prerelease handoff for Claude Code review

## Skilningur á samþykki

Stebbi gaf Codex skýrt framkvæmdarleyfi: "Þú mátt framkvæma þessa breytingu og búa svo til prerelease handoff."

Þetta var túlkað sem leyfi til að laga v305 Road Intelligence route-map bugga sem Stebbi taldi upp:

- kort opnist hreint á `Núna`
- pillur telji actual visible route stations, ekki fallback/forecast punkta
- Vegagerðarstöðvar á valdri leið sýni vindtölu og stöðvarheiti
- scrubber sýni background texta á meðan forecast-slot staða er reiknuð
- prototype fallback textinn um "bráðabirgðaspá" hverfi úr notenda-UI

Þetta fól í sér kóðabreytingar og message-breytingar. Þetta fól ekki í sér commit, push, deploy, SQL, migration, env-breytingu eða production breytingu.

## Plan áfangans

1. Lesa `WORKFLOW.md`, `Design.md` og viðeigandi road-map kóða.
2. Finna af hverju `Núna` sýnir 80 í pillu á leið með 8 sýnilegar Vegagerðarstöðvar.
3. Aðskilja `Núna` route-layer frá forecast route-layer.
4. Láta pillu-counts fylgja virkum/sýnilegum route-layer.
5. Sýna compact vindtölu + stöðvarheiti á route-station labels.
6. Bæta við sér scrubber background-status fyrir forecast-slot reikning.
7. Keyra type-check og afmörkuð próf.
8. Skila prerelease handoff.

## Hvað var gert

### 1. `Núna` er nú sérstakt route weather mode

Í `components/weather/RoadMapPrototypeMap.tsx` bætti Codex við `RouteWeatherMode = 'now' | 'forecast'` og `routeWeatherModeRef`.

Nú á `Núna` að:

- sýna `VEGAGERDIN_ROUTE_STATIONS_LAYER_ID`
- fela `VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID`
- fela `TRAVEL_METNO_LAYER_ID`
- sýna Vegagerðar DOM labels
- fela Veðurstofu DOM labels

Þegar notandi velur forecast-slot í scrubber:

- sýnir kortið Veðurstofu route-stations
- felur Vegagerðar route-stations
- counts skipta yfir í Veðurstofu forecast status counts fyrir þann brottfarartíma

### 2. Pillur telja nú active route-layer

Codex bætti við `routeVisibleStatusCounts`.

Fyrir `Núna` eru counts nú:

- Vegagerðin route station counts ef Vegagerðin skilar stöðvum
- annars Veðurstofan route station counts
- aðeins fallback í `mapData.statusCounts` ef enginn provider layer er til

Þetta fjarlægir gamla merge-vandann þar sem `vegagerdinRender.statusCounts` og `vedurstofanRender.statusCounts` voru sameinuð. Sá merge skýrði líklega `Innan marka (80)` þegar sýnilegar Vegagerðarstöðvar voru aðeins um 8.

### 3. Fyrsti scrubber-slot er aftur `Núna`, ekki forecast-slot `idx=0`

`handleSelectCandidateIdx(0)` er nú meðhöndlað eins og `null`.

Það þýðir:

- `selectedCandidateIdx = null` er canonical `Núna`
- `Núna`-slot í scrubber opnar aftur Vegagerðin-current layer
- hægri ör í scrubber fer frá `Núna` yfir á næsta forecast-slot, ekki aftur á sama `idx=0`
- fyrsti slot er visually selected þegar `selectedIdx === null`

### 4. Forecast-slot bygging er aðskilin frá full-screen loader

Route calculation setur nú:

- fyrst aðeins fyrsta candidate í scrubber
- `routeBridgeStatus = 'success'`
- `routeForecastBuildStatus = 'loading'`
- síðan eru forecast-slot overrides reiknaðir async og full candidate list sett í scrubber

Þetta gerir scrubbernum kleift að sýna textann:

> Er að búa til stöðuna m.v. brottför á heila tímanum eins langt og spáin nær.

Athugið: þetta er UI/background split ofan á núverandi `/api/teskeid/weather/travel` svar. Þetta er ekki ný sér API-fyrirspurn fyrir næstu 24 klst. Candidate listinn kemur enn úr sama travel svari, en UI opnar ekki kortið á meðan allur timeline-state er fullkláraður.

### 5. Forecast notar Veðurstofu, Vegagerðin er `Núna`

Í background forecast-slot útreikningi er Vegagerðin ekki lengur notuð sem fast current floor fyrir alla framtíðarslota.

Codex sendir nú `vegagerdinStationCount: 0` og `vegagerdinStatusCounts: {}` inn í forecast-slot build þegar full timeline er byggð. Fyrsti slot fær samt `nowWorstStatus`, svo `Núna` helst tengt raungildum Vegagerðarinnar.

Þetta fylgir vörustefnunni sem Stebbi setti: Vegagerðin = nústaða, Veðurstofan = spágildi.

### 6. Route station labels sýna nú stöðvarheiti

`createRouteWindLabelElement()` sýnir nú:

- efri línu: vindgildi (`m/s`)
- neðri línu: stöðvarheiti, truncated ef þarf

Labelið er compact tveggja lína spjald með max-width svo það valdi síður overflowi.

### 7. Simple/detailed filter lagað í `DepartureHeatmap`

`DepartureHeatmap` notaði áður exact status matching í slot filtering. Það virkaði illa þegar parent var í `simple` mode, því simple-pillur innihalda status-grúppur.

Codex bætti við `slotStatusIsVisible()` sem notar `toSimpleWindDisplayStatus()` þegar mode er `simple`.

Þetta á að laga ósamræmi þar sem pillur virtust ekki stjórna slot-row rétt eða tæmdu ranglega slot-listann.

### 8. Fallback prototype texti falinn

`routeScrubberSubtitle('fallback')` skilar nú tómum streng.

Textinn:

> Tímalínan notar bráðabirgðaspá þar til íslensk route-gögn finnast.

á því ekki lengur að birtast notanda í þessu route-map flowi.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/road-intelligence/routeSlotStatuses.ts`
- `package.json`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`

Ótengd dirty skrá var til fyrir/á meðan: `.obsidian/workspace.json`. Codex snerti hana ekki.

## Skipanir sem voru keyrðar

- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 Design.md`
- `git status --short`
- `rg ... components/weather/RoadMapPrototypeMap.tsx messages/... lib/road-intelligence`
- `git diff --check`
- `npm run type-check`
- `npm run test:run -- road-intelligence-route-slot-statuses weather-travel`
- `npm run test:run -- road-intelligence-route-slot-statuses`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `Get-Date -Format "yyyy-MM-dd HH:mm"`

## Niðurstöður og exit codes

- `npm run type-check`: exit 0
- `git diff --check`: exit 0
- `npm run test:run -- road-intelligence-route-slot-statuses`: exit 0, 25 tests passed
- `npm run test:run -- road-intelligence-route-slot-statuses weather-travel`: exit 1

Prófið sem féll var ekki í breyttum UI kóða. Það var `lib/__tests__/weather-travel-api.test.ts` og féll þar sem local test env vantaði `SUPABASE_SERVICE_ROLE_KEY`; API-testið náði því ekki að byggja `vegagerdinLayer` og assertion `expect(body.vegagerdinLayer).toBeDefined()` féll.

## Hvað mistókst eða var sleppt

- Codex ræsti ekki localhost/dev server og gerði ekki browser-próf, samkvæmt repo-reglum.
- Engin full e2e staðfesting var gerð á kortinu í browser.
- Ekki var byggt nýtt incremental backend API sem sækir næstu 24 klst sérstaklega. Núverandi UI sýnir fyrstu 24 og `Sækja fleiri spátíma`, en candidates koma enn úr sama `/travel` svari.
- Ekki var commit-að, push-að, deploy-að eða keyrt SQL.

## Ákvarðanir sem Codex tók

- `Núna` á að telja og sýna Vegagerðarstöðvar fyrst, vegna þess að Stebbi vill Vegagerðina fyrir raungildi.
- Forecast-slot visual state á að nota Veðurstofu route layer þegar hann er til.
- Vegagerðin current má ekki vera föst framtíðarspá fyrir alla brottfarartíma.
- Fallback texti um bráðabirgðaspá er of tæknilegur og var falinn.
- Fyrsta slot í scrubber er notað sem UI fyrir `Núna`, en canonical selected state er áfram `selectedCandidateIdx = null`.

## Áhætta sem er enn til staðar

- MapLibre DOM marker labels með stöðvarheitum geta skarast á mjög þéttum leiðum. Fyrir Vegagerðin route mode var það samt meðvitað tradeoff því Stebbi vill sjá allar vindtölur á leiðinni.
- Forecast background split er enn client-side scheduling ofan á sama API response. Ef við viljum raunverulega létta á API með `load more`, þarf sér endpoint eða query-param síðar.
- Ef Vegagerðin skilar engum route-stations en Veðurstofan skilar mörgum, `Núna` fellur yfir í Veðurstofu forecast layer. Það er fallback-hegðun, ekki endanlegt product ideal.
- `routeSlotStatuses.ts` heldur enn eldri helper-contracti í comments um Vegagerðina sem current floor fyrir alla slots. Codex breytti ekki helper-contractinu sjálfu heldur sniðgekk það í RoadMapPrototypeMap call site fyrir nýja product behaviorið. Claude Code ætti að rýna hvort comment/API eigi að uppfæra í næsta skrefi.

## Route intelligence check

- Snertir Road Intelligence route-map flow á `/auth-mvp/vedrid/road-map-prototype`.
- Breytingin er UI/client-state breyting, ekki ný route-gagna persistence.
- Lausnin bindur `Núna` við Vegagerðin current observations og forecast við Veðurstofu forecast, sem er provider-aware en ekki Google-specific.
- Engin ný route-gögn eru vistuð og engin privacy-áhætta bættist við.
- `IcelandRoadmap.md` var ekki uppfært þar sem þetta er hotfix á route-map UI state, ekki ný canonical route-segment regla eða ný station-matching regla.

## Design.md check

- Textar voru settir í `messages/is.json` og `messages/en.json`.
- Labels eru compact og hafa max-width/truncate til að minnka overflow áhættu.
- Enginn nýr stór UI pattern var kynntur.
- Mobile áhætta er helst label-density/overlap á korti, sem þarf browser-próf hjá Stebba.

## Tillaga að næsta skrefi

Claude Code ætti að rýna diffið með sérstakri áherslu á:

1. Hvort `Núna` layer visibility virki rétt í MapLibre eftir route calculation.
2. Hvort `routeVisibleStatusCounts` uppfærist rétt þegar:
   - route opnast
   - filter-pilla er valin
   - `Núna` er valið aftur
   - forecast slot er valið
3. Hvort first-slot/null mapping í `DepartureHeatmap` valdi óvæntri hegðun í öðrum consumerum.
4. Hvort route-slot helper comment eða tests þurfi að uppfæra vegna product-ákvörðunarinnar: Vegagerðin núna, Veðurstofan forecast.

## Spurningar fyrir Claude Code

- Er öruggara að extract-a shared helper fyrir `statusIsVisibleInFilter` í stað þess að hafa sambærilega lógík í `DepartureHeatmap`?
- Á `RouteSlotStatusSource` að skiptast í `nowSource` og `forecastSource` svo `providers` verði ekki tvírætt?
- Þurfum við að halda `routeBridgeSummary.statusCounts` sem now-counts eða bæta skýrum `nowStatusCounts` field við type-ið?

## Supabase / auth / production

- Engin SQL skrifuð.
- Engin SQL keyrð.
- Engar RLS, grants, auth, policy, function eða production-gagna breytingar.
- Engin env/secrets breyting.
- Enginn deploy, push eða commit.

## Localhost checks for Stebbi

Opna:

`http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Setup:

- Stebbi keyrir dev server sjálfur.
- `ROAD_INTELLIGENCE_V1_ENABLED=true` í local env.
- Innskráður notandi þarf að hafa `road-intelligence-v1` feature access.

Prófa:

1. Slá inn `Akureyri` til `Egilsstaðir`.
2. Smella `Reikna`.
3. Vænt: full-screen Teskeið-loader hverfur þegar `Núna` er tilbúið.
4. Vænt: kort opnast á `Núna`; aðeins Vegagerðar route-stations sjást sem weather points.
5. Vænt: allar Vegagerðarstöðvar á valdri leið sýna vindtölu og stöðvarheiti.
6. Vænt: pillutalning undir korti leggur saman sömu Vegagerðarstöðvar og sjást á kortinu, ekki 80 ef aðeins 8 stöðvar eru á leið.
7. Vænt: scrubber sýnir fyrst `Núna`; meðan forecast slots eru byggð á að birtast texti um að verið sé að búa til stöðuna m.v. brottför á heila tímanum.
8. Þegar forecast slots birtast, smella hægri ör eða forecast-slot.
9. Vænt: kort skiptir yfir í Veðurstofu forecast route stations og pillutalning fylgir þeim sýnilega forecast-layer.
10. Smella aftur á `Núna`.
11. Vænt: kort skiptir aftur yfir í Vegagerðin current route stations og pillur telja þær.
12. Prófa að haka bara við `Hættulegt`.
13. Vænt: bæði map layer og DOM labels filterast í samræmi við pillurnar.
14. Staðfesta að textinn `Tímalínan notar bráðabirgðaspá...` birtist ekki lengur.

Regressions að passa:

- Overview `/auth-mvp/vedrid` má ekki missa núverandi Vegagerðin/Veðurstofan punktasýn.
- `Einfalt`/`Nánar` pillur mega ekki hætta að virka í gamla `/vedrid` eða ferðaveður heatmap.
- Labels mega ekki valda láréttu overflowi á mobile.
- Engin Supabase/production gögn eru snert í þessum localhost prófum.

## Óvissa / þarf að staðfesta

Confidence: medium-high fyrir state/counts bugfix út frá kóðalestri og type-check.  
Confidence: medium fyrir visual MapLibre label/visibility hegðun þar sem Codex keyrði ekki browserpróf.

Stærsta óvissan er hvort MapLibre layer visibility og DOM Marker visibility raðist rétt í öllum timing-tilvikum eftir að `renderVedurstofanStations()` og `renderVegagerdinStations()` keyra hvor á eftir öðrum. Localhost browser-próf hjá Stebba eða Claude Code þarf að staðfesta það.
