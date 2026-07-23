# 2026-07-22 23:05 - TODO 086 - v337 - Codex - zoom-aware overview density prerelease

## Plan áfangans

Útfæra prufufasa fyrir nýju hlutlausu veðurpunktana á forsíðu nýja MapLibre-kortsins:

1. Útþysjað: sýna samansafn/cluster af stöðvum í stað þess að teppaleggja Ísland með fullum spjöldum.
2. Millizoom: sýna compact veðurspjöld, aðallega vind/veðurtákn.
3. Innþysjað: sýna full veðurstöðvargildi og stöðvarheiti eftir því sem pláss leyfir.
4. Halda akstursleiðarmerkjunum óbreyttum og snerta ekki route-mode regression vandamálin í þessum áfanga.

## Hvað var raunverulega gert

- Bætt var við zoom-aware density fyrir overview station DOM-markera í `RoadMapPrototypeMap.tsx`.
- Overview markerar geyma nú metadata: provider, status, lat/lon, stationName, stutt overviewLabel og optional weather emoji.
- `updateOverviewMarkerVisibility()` notar nú skjá-grid/cell-culling:
  - `aggregate` undir zoom 5.8, cell 118 px.
  - `compact` frá zoom 5.8, cell 82 px.
  - `full` frá zoom 7.2, cell 70 px.
- Útþysjað birtist einn representative marker per cell:
  - Forecast-cluster notar veðurtákn ef þau eru til.
  - Vegagerðin/current notar wind fallback `💨`.
  - Label sýnir fjölda stöðva í hópnum.
- Millizoom felur neðri röð og stöðvarheiti til að minnka sjónrænt kraðak.
- Innþysjað sýnir fulla veðurkortið með hita/úrkomu eða vegahita og stöðvarheiti.
- Station count/pill count heldur áfram að telja raunverulegar stöðvar sem passa við active provider + filter, ekki bara fjölda sýndra representative markera.
- Density er endurreiknað á `zoom` og eftir `moveend`.
- Cleanup fyrir `requestAnimationFrame` var bætt við.

## Skrár sem voru skoðaðar

- `Design.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/windDisplayStatus.ts`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`

Ath: Í worktree voru fyrir ócommittaðar breytingar í fleiri skrám frá fyrri áföngum:

- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `messages/is.json`
- `messages/en.json`
- `.obsidian/workspace.json` (ótengt, ekki snert af Codex)

## Skipanir sem voru keyrðar

- `rg -n "OverviewStationMarker|createOverviewStationDotElement|updateOverviewMarkerVisibility|overviewVegagerdinMarkersRef|map\\.on\\('zoom|map\\.on\\('move|routeActiveRef|OVERVIEW_WEATHER_MARKER_COLOR" components/weather/RoadMapPrototypeMap.tsx`
- `git status --short`
- `rg -n "mobile|overflow|overlap|kort|map|lit|color|zoom|label" Design.md`
- `rg -n "type WindDisplayStatus|WIND_DISPLAY_STATUS|DEFAULT_OVERVIEW_VISIBLE|statusIsVisibleInFilter|displayWindStatus|WIND_STATUS" components/weather/RoadMapPrototypeMap.tsx lib components/weather -g "*.ts" -g "*.tsx"`
- `npm run type-check`
- `npm run test:run -- lib/__tests__/road-intelligence-route-slot-statuses.test.ts lib/__tests__/windObservationStatus.test.ts`
- `git diff -- components/weather/RoadMapPrototypeMap.tsx`

## Niðurstöður og exit codes

- `npm run type-check`: exit 0.
- `npm run test:run -- lib/__tests__/road-intelligence-route-slot-statuses.test.ts lib/__tests__/windObservationStatus.test.ts`: exit 0.
  - 2 test files passed.
  - 67 tests passed.
- `git status --short` sýndi áfram dirty worktree, m.a. ótengda `.obsidian/workspace.json`.

## Hvað mistókst eða var sleppt

- Engin browserprófun var keyrð af Codex. Stebbi keyrir localhost/dev server sjálfur samkvæmt verkefnisreglum.
- Engin Playwright/screenshot validation var keyrð.
- Þetta leysir ekki endanlega collision/label placement fyrir route-mode. Það er viljandi utan scope.
- Þetta býr ekki til raunverulegt geospatial cluster source í MapLibre. Þetta er létt DOM/cell-culling prufa.

## Ákvarðanir sem Codex tók

- Ekki nota status-liti í overview-punktunum, í takt við nýja litastefnu: litur á bara að birtast þegar hann hefur skýra merkingu.
- Ekki endurreikna marker-gögn við zoom; nota metadata sem var búið að reikna við marker creation.
- Ekki telja cluster sem stöð í pillum. Pillur eiga að vísa í raunveruleg eligible station count.
- Representative station í cluster er valin út frá verstu vindstöðu, svo alvarlegra svæði týnist síður við útþysjun.

## Áhætta sem er enn til staðar

- Cell-culling er heuristic. Það gæti enn verið of þétt eða of sparse í sumum viewportum/zoomum.
- Cluster anchor er representative station, ekki reiknaður centroid. Það er einfalt og öruggt fyrir prufu, en má bæta síðar.
- Forecast weather emoji mapping er einföld textaheuristic og gæti þurft fínstillingu.
- Þar sem þetta er DOM marker density en ekki MapLibre source/layer clustering gæti afköst þurft að skoða ef station count verður miklu stærra.

## Tillaga að næsta skrefi

1. Stebbi prófar á localhost og tekur screenshot af:
   - Ísland útþysjað.
   - Millizoom yfir Suðvesturlandi eða Norðurlandi.
   - Innþysjað yfir svæði með mörgum stöðvum.
2. Ef spacing er enn of þétt:
   - stilla cell-stærðir og zoom thresholds.
3. Ef hugmyndin smellur:
   - íhuga MapLibre source-level clustering fyrir overview til lengri tíma.

## Spurningar sem Claude/Codex eiga sérstaklega að rýna

- Eru zoom thresholds 5.8 og 7.2 rétt fyrir mobile?
- Á cluster útþysjað að sýna fjölda stöðva, sterkasta veður/vind-tákn, eða bara svæðis-tákn án talningar?
- Á innþysjað overview alltaf að sýna stöðvarheiti, eða bara við hover/click eftir ákveðinn station density?

## Supabase / SQL / production

- Engin SQL-skrá var skrifuð.
- Engin migration var keyrð.
- Engin RLS/grant/auth/policy/function breyting.
- Engin production breyting, deploy, push eða commit.
- Engin env breyting.

## Design.md samræmi

- Mobile-first: density minnkar overlap og teppalögð kort á farsíma.
- Litastefna: overview markers halda hlutlausum litum; status-litun helst í samhengi/filterum þar sem hún hefur merkingu.
- Overlap/overflow: markerarnir nota cell-culling til að draga úr texta- og marker-overlapi.

## Localhost checks for Stebbi

Opnaðu:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Prófaðu án þess að virkja akstursleið:

1. Veldu `Nústaðan hjá Vegagerðinni` / nústöðu.
   - Vænt: útþysjað ættu Vegagerðarstöðvar ekki að birtast sem stórt teppi af fullum spjöldum.
   - Vænt: þú sérð færri aggregate/compact markera eftir zoomi.
2. Veldu spátíma frá Veðurstofunni í scrubber.
   - Vænt: útþysjað ættu veðurtákn/cluster að birtast frekar en allir fullir punktar.
   - Vænt: við zoom inn birtast veðurstöðvargildi smám saman.
3. Zoomaðu frá öllu Íslandi niður á eitt svæði, t.d. Norðurland eða Suðvesturland.
   - Vænt: aggregate -> compact -> full marker hegðun.
   - Vænt: engin stór textaklessa yfir allt kortið útþysjað.
4. Prófaðu status filter-pillu.
   - Vænt: pillutalning segir fjölda raunverulegra stöðva sem passa filter, ekki fjölda cluster markera.
5. Virkjaðu akstursleið.
   - Vænt: route-mode markerar eiga að haga sér eins og fyrir breytinguna. Þessi breyting á ekki að breyta route weather markers.

Ekki þarf að prófa Supabase, migration, production, auth eða feature flag fyrir þessa breytingu.
