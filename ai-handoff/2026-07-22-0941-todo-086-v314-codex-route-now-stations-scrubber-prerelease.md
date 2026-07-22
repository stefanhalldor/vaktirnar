# 2026-07-22-0941-todo-086-v314-codex-route-now-stations-scrubber-prerelease

Created: 2026-07-22 09:41  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Relevant TODO: 086 / Road Intelligence prototype

## Skilningur á samþykki

Stebbi gaf Codex skýrt framkvæmdarleyfi til að laga þessi atriði í nýja Road Intelligence kortinu:

- Kortið opnaðist ekki nógu skýrt á valinni `Núna` stöðu.
- Scrubberinn sýndi ekki brottfarartíma per klukkustund eftir `Núna`.
- Stöðvaheiti vantaði.
- Frá/Til merkingar vantaði við upphaf og lok ferðar.

Þetta leyfi náði yfir afmarkaðar kóðabreytingar í repo. Það náði ekki yfir commit, push, deploy, SQL/migration, env-breytingar eða production-aðgerðir.

## Plan áfangans

1. Herða route-only state eftir `Reikna ferð`, þannig að overview punktar leki ekki yfir route-kortið.
2. Tryggja að `Núna` sé virkt route-state og telji sýnilega route-stöðvar, ekki gamla fallback/overview punkta.
3. Láta scrubber fá næstu heilu klukkustundir þegar serverinn skilar bara einum candidate.
4. Sýna route labels betur: vindtölu sem aðal-label, stöðvaheiti sem sér label, og Frá/Til endpoint labels.
5. Nota Vegagerðina fyrir `Núna` jafnvel ef `/api/teskeid/weather/travel` skilar ekki `vegagerdinLayer`, með client-side fallback úr núverandi Vegagerðarstöðvunum sem kortið hefur þegar sótt.

## Hvað var gert

### 1. Client-side hourly route candidates

Í `components/weather/RoadMapPrototypeMap.tsx` var bætt við:

- `ROUTE_TIMELINE_INITIAL_SLOT_COUNT`
- `nextWholeUtcHourAfter()`
- `cloneRouteCandidateForDeparture()`
- `buildRouteTimelineCandidates()`

Ef serverinn skilar bara einum candidate fyrir route, býr clientinn nú til fyrstu heilu klukkustundirnar út frá sama route duration. Þetta gerir Veðurstofu provider-status útreikningnum kleift að fylla scrubberinn í stað þess að sýna strax error.

### 2. Sterkara route-only map state

Bætt var við `hideOverviewStationMarkers()` og hún kölluð þegar route weather layer visibility er uppfært í route mode.

Markmið: Þegar route hefur verið reiknuð eiga overview markerar ekki að birtast yfir route-punktunum. Þetta er sérstaklega mikilvægt þegar Stebbi sér enn "80 gamla punkta" eftir route calculation.

### 3. Vegagerðin fallback fyrir `Núna`

Bætt var við `buildClientVegagerdinRouteLayer()`.

Ef server response inniheldur ekki `vegagerdinLayer`, eða layerið er tómt, notar clientinn nú:

- `overviewVegagerdinData.stations`
- `travelPlan.route.auditPolylinePoints`
- `matchProviderPointsToRoute()`
- `VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M`

til að smíða sama `VegagerdinRouteLayer` shape og serverinn myndi skila.

Þetta er ekki nýtt API kall og skrifar engin gögn. Þetta notar bara current Vegagerðarstöðvar sem clientinn hefur þegar sótt fyrir overview-kortið.

### 4. Route labels og endpoint labels

Label hegðun var hert:

- Vindtala er áfram aðal-label.
- Stöðvaheiti er sér label undir/við hlið vindtölu.
- Fyrir litlar leiðir, 14 sýnilegir route labels eða færri, fela collision-reglurnar ekki stöðvaheitin.
- Endpoint labels eru nú sér markerar fyrir Frá og Til, með texta úr route-forminu ef hann er til, annars resolved place name.

### 5. Scrubber state

`calculateResolvedRoute()` notar nú `buildRouteTimelineCandidates()` og setur fyrst bara `Núna` inn á kortið, en byggir síðan hourly provider slot statuses í bakgrunni.

Ef Veðurstofu-layer er til, á `routeForecastBuildStatus` að fara í:

- `loading`: "Er að búa til stöðuna..."
- `ready`: hourly slots birtast

Ef Veðurstofu-layer vantar alveg er áfram sýnt error í scrubber, því þá er ekki hægt að reikna spátíma provider-megin.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `lib/weather/types.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/road-intelligence/vegagerdinRouteLayer.ts`
- `lib/weather/providerRouteMatching.ts`
- `lib/road-intelligence/travelBridgeMapData.ts`
- `lib/weather/providers/vegagerdinCurrentTypes.ts`

## Skrár breyttar

Beint í þessum áfanga:

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-22-0941-todo-086-v314-codex-route-now-stations-scrubber-prerelease.md`

Athugið: Eftir fyrri áfanga eru líka dirty breytingar í:

- `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`

Óskyld dirty breyting sem Codex snerti ekki:

- `.obsidian/workspace.json`

## Skipanir keyrðar

- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 Design.md`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `rg ...` og `Get-Content ...` til að lesa viðeigandi kóðasvæði
- `npm run type-check`
- `npm run test:run -- road-intelligence-route-slot-statuses`
- `git diff --check`
- `git status --short`
- `git diff --stat`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

## Niðurstöður skipana

- `npm run type-check`: exit 0
- `npm run test:run -- road-intelligence-route-slot-statuses`: exit 0, 25 tests passed
- `git diff --check`: exit 0, aðeins CRLF warnings
- `git status --short`: sýnir dirty `.obsidian/workspace.json` auk Road Intelligence breytinga og untracked handoff skjala

## Ekki gert

- Enginn commit.
- Enginn push.
- Enginn deploy.
- Engin SQL/migration keyrð eða skrifuð.
- Engin `.env.local` breyting.
- Engin production/Supabase/Vercel aðgerð.
- Enginn dev server ræstur, stöðvaður eða endurræstur.

## Áhætta og óvissa

- Confidence: medium-high fyrir state/hotfixið, en þarf browserprófun hjá Stebba því kortið er MapLibre DOM/state þungt.
- Client-side Vegagerðin fallback notar sama matching radius og serverinn. Þetta er gott sem vörn gegn tómu `vegagerdinLayer`, en Claude Code ætti samt að staðfesta af hverju server layerið var ekki sýnilegt hjá Stebba.
- Ef `overviewVegagerdinData` er ekki komið þegar route er reiknuð, getur fallbackið ekki smíðað `Núna` layer strax. Þá þarf hugsanlega að bíða eftir current-data eða refetcha áður en route calculation lýkur.
- Ef route hefur fleiri en 14 route labels, fela collision-reglur áfram einhver stöðvaheiti til að verja vindtölurnar. Fyrir langar leiðir gæti þurft betri label placement á næsta áfanga.
- Hourly candidates eru nú smíðaðir client-side þegar serverinn skilar bara einum candidate. Provider-status fyrir slotin er samt reiknaður úr Veðurstofu-layerinu, ekki úr MET/Yr candidate status.

## Route Intelligence Check

- Snertir route calculation á nýja Road Intelligence MapLibre prototype-inu.
- Breytingin er provider-neutral að hluta fyrir timeline slots, en `Núna` notar Vegagerðina sérstaklega, eins og product-stefnan segir.
- Engin ný route-gögn eru geymd.
- Engin Google-specific ný binding var bætt við.
- `matchProviderPointsToRoute()` og `VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M` voru endurnýtt í stað sérlausnar.
- `IcelandRoadmap.md` var ekki uppfært í þessum hotfix, því breytingin er UI/client fallback en ekki ný canonical route-knowledge regla.

## Tillaga að næsta skrefi fyrir Claude Code

1. Rýna hvort client-side fallbackið eigi að vera tímabundið eða hvort travel API eigi alltaf að tryggja `vegagerdinLayer` áður en client fær success.
2. Prófa route calculation í browser með:
   - Akureyri -> Egilsstaðir
   - Ísafjörður -> Reykjavík
   - Akranes -> Akureyri
3. Staðfesta að:
   - Kortið opnist á `Núna` með route-only Vegagerðarstöðvum.
   - Pillutalning sé sama talning og sýnilegir `Núna` route-punktar.
   - Stöðvaheiti sjáist á litlum station-settum.
   - Frá/Til labels birtist.
   - Scrubber sýni fyrst `Núna`, svo heilu klukkustundirnar þegar background build klárast.
4. Ef enn sjást 80 punktar strax eftir route calculation, leita sérstaklega að:
   - hvort `vegagerdinLayer.points.length` er 0,
   - hvort `overviewVegagerdinData` er ekki komið þegar route er reiknað,
   - hvort `routeWeatherModeRef.current` endar óvart í `forecast`,
   - hvort overview markers eru endursmíðaðir eftir `routeActiveRef.current = true`.

## Spurningar fyrir Claude Code að rýna

- Er client-side Vegagerðin fallback rétt staðsettur í componentinum, eða ætti hann að fara í reusable helper undir `lib/road-intelligence/`?
- Eigum við að láta `calculateResolvedRoute()` bíða eftir `overviewVegagerdinData` ef server `vegagerdinLayer` vantar, svo `Núna` sé aldrei fallback-laust?
- Ætti `visibleCandidateLimit` að vera 25 svo notandi sjái `Núna + 24 klst`, eða er núverandi 24 nóg?
- Ætti serverinn að skila `timelineCandidates` óháð MET/Yr þannig að client þurfi ekki að synthesize-a candidate lista?

## Localhost checks for Stebbi

Opna:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Setup:

- Vera innskráður með `road-intelligence-v1`.
- `ROAD_INTELLIGENCE_V1_ENABLED=true` í local env, eins og Stebbi er með.
- Dev server er keyrður af Stebba, ekki Codex.

Prófa:

1. Slá inn `Akureyri` -> `Egilsstaðir` og ýta á `Reikna`.
2. Vænt niðurstaða:
   - Drawer lokast.
   - Kort opnast á leiðinni.
   - `Núna` slot er valið.
   - Kortið sýnir Vegagerðarstöðvar á leiðinni, ekki 80 MET/Yr route-punkta.
   - Pillutalning undir korti passar við sýnilegu `Núna` route-stöðvarnar.
   - Vindtala sést hjá route-stöðvum.
   - Stöðvaheiti sést þar sem ekki er of mikil þétting.
   - Frá og Til labels sjást við upphaf/lok leiðar.
3. Bíða í nokkrar sekúndur eftir background scrubber build.
4. Vænt niðurstaða:
   - Texti um að verið sé að búa til stöðu m.v. heila tíma birtist á meðan.
   - Síðan birtast fleiri hourly slots í scrubbernum.
5. Smella á næsta hourly slot.
6. Vænt niðurstaða:
   - Kortið skiptir yfir í Veðurstofu forecast route-stöðvar fyrir þann brottfarartíma.
   - `Núna` heldur áfram að sýna Vegagerðina þegar smellt er aftur á `Núna`.
7. Endurtaka með `Ísafjörður` -> `Reykjavík`.

Regression sem þarf að passa:

- Overview `/auth-mvp/vedrid/road-map-prototype` án route á áfram að sýna overview stations og filters.
- `Hreinsa` á að hreinsa route og koma overview markers/place labels aftur.
- Status pills eiga að filtera sýnilega route-stöðvar í bæði `Núna` og hourly forecast mode.
- Kortið á ekki að frjósa meðan `Leita að fleiri leiðum...` er í gangi.

Öryggi/gögn:

- Ekki keyra SQL, ekki breyta feature flags í Supabase, ekki deploya og ekki prófa production rollout nema Stebbi gefi sérstakt leyfi.
