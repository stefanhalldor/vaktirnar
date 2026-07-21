# TODO 086 / v288 - Codex handoff: gulltryggja route-station matching í nýja Road Intelligence kortinu

## Samhengi

Stebbi prófaði nýja Road Intelligence kortið með leiðinni Akureyri -> Egilsstaðir. Nýja kortið sýndi í raun bara "núgildið" og virtist ekki sýna Vegagerðarstöðvarnar á þessari löngu leið. Gamla `/vedrid` sýndi hins vegar 5 stöðvar innan marka og 1 óþægilega á sömu leið.

Stebbi leiðrétti líka mikilvæga vöruhugsun: nýja kerfið á ekki að endurtaka veikleika gamla Google/polyline-minnisins. Þegar notandi hefur valið leið á nýja grunninum eigum við að vita hvaða akstursleið er í notkun og matcha veðurstöðvar gegn þeirri leið almennilega. Markmið næsta skrefs er því ekki bara að laga eitt label-bug, heldur að gera það gulltryggt að við missum ekki af veðurstöð sem er nálægt valdri akstursleið.

Codex breytti ekki app-kóða í þessari rýni. Þetta er framkvæmdarhandoff fyrir Claude Code.

## Hvað Codex skoðaði

- `ai-handoff/2026-07-21-1545-todo-086-v287-claude-vegagerdin-density-pill-labels.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `lib/weather/providerRouteMatching.ts`
- `lib/weather/routeControlPoints.ts`
- `components/weather/WeatherOverviewClient.tsx`
- `IcelandRoadmap.md`
- `Design.md`

Skjámyndir Stebba liggja í `C:\Users\Lenovo\Pictures\Screenshots`, sem er utan workspace. Codex opnaði þær ekki, en kóðalega rótin er nógu skýr til að ramma næsta skref.

## Findings

### 1. Nýja kortið og gamla kortið nota ekki sama station-truth

Gamla `/vedrid` notar exact route-memory station IDs úr `weather_route_memory_*` og filterar provider markers eftir þeim.

Nýja Road Intelligence kortið býr hins vegar til `vegagerdinLayer.points` í `app/api/teskeid/weather/travel/route.ts` með:

- `matchProviderPointsToRoute(...)`
- `routePolyline = routeGeometry.providerMatchingPoints ?? routeGeometry.points`
- `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000`

Þetta þýðir að nýja kortið getur misst stöðvar ef route geometry/chord/simplification liggur ekki nógu nálægt stöðvunum, jafnvel þó gamla route-memory hafi þær rétt.

### 2. v287 label-density getur falið Vegagerðarstöðvar sem Stebbi vill sjá

Í `RoadMapPrototypeMap.tsx` er density regla nú beitt á Vegagerðar route labels:

- ef `validPoints.length <= 6` -> label á allt
- annars -> label bara á fyrsta, síðasta og slæm statuses

Þetta er rangt fyrir Vegagerðargildi á valdri leið. Stebbi vill sjá vindtölurnar strax á þeim Vegagerðarstöðvum sem tilheyra leiðinni, svipað og umferdin.is.

### 3. `nalgast-othaegindi` vantar í always-label listann

`ROUTE_LABEL_ALWAYS_STATUSES` inniheldur nú:

- `haettulegt`
- `nalgast-haettumork`
- `othaegilegt`

Það vantar `nalgast-othaegindi`. Í simple mode getur þessi staða birst sem appelsínugul/óþægileg í samantekt, en verið ekki merkt á kortinu eftir density.

### 4. Click-popup notar label-ref sem data source

Click handler fyrir route station circles finnur station detail með því að leita í `routeVegagerdinLabelMarkersRef` eða `routeVedurstofanLabelMarkersRef`.

Það þýðir að ef punktur fær ekki label vegna density, þá getur GeoJSON punkturinn verið á kortinu en ekki opnað rétt popup. Data registry og label registry þurfa að vera aðskilin.

### 5. Route-control lagið er enn svæðisbundið

`lib/weather/routeControlPoints.ts` virðist nú bara hafa control sections fyrir Vík/Mýrdalssvæðið. Það hjálpar ekki Akureyri -> Egilsstaðir.

Við eigum samt ekki að búa til fleiri handskrifaða Google-control-point sérlausn sem lokamarkmið. Þetta á að færast yfir í provider-neutral route/segment matcher samkvæmt `IcelandRoadmap.md`.

## Mikilvæg stefna fyrir næsta skref

Ekki laga þetta bara með því að hækka `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M` global úr 1 km í 3-5 km.

Það getur minnkað false negatives en eykur false positives, sérstaklega þar sem vegir liggja nálægt hvor öðrum eða í fjörðum. Slík breyting væri acceptable sem tímabundin debug-tilraun, en ekki sem vöru- eða architecture-lausn.

Rétta lausnin er:

1. Route station membership byggist á þeirri leið sem nýja kortið er raunverulega að sýna.
2. Matcherinn vinnur gegn route segment chain / canonical route geometry, ekki bara sparse provider polyline.
3. Vegagerðarstöðvar á valdri leið birtast allar sem current wind labels nema Stebbi samþykki sérstaklega öðruvísi density.
4. Ef gögn eru óviss, sýnum fleiri nálægar stöðvar frekar en að missa stöð sem gæti skipt máli fyrir notanda.

## Tillaga að framkvæmd fyrir Claude Code

### Phase A - Client hotfix sem má framkvæma fyrst

Markmið: tryggja að ef API skilar réttum Vegagerðarpunktum, þá sjáist þeir allir og séu smellanlegir.

1. Í `components/weather/RoadMapPrototypeMap.tsx`:
   - Ekki beita 6-punkta label-density á Vegagerðar route labels.
   - Sýna `createVegagerdinRouteLabel(point)` fyrir alla `validPoints` á valdri route.
   - Halda Veðurstofu-density sér, því Veðurstofuspár geta verið þéttari og ekki allar núgildi.

2. Bæta `nalgast-othaegindi` í `ROUTE_LABEL_ALWAYS_STATUSES`.

3. Aðskilja data refs frá label refs:
   - bæta við t.d. `routeVegagerdinPointsRef`
   - bæta við t.d. `routeVedurstofanEntriesRef`
   - setja þessi refs í `renderVegagerdinStations` / `renderVedurstofanStations` áður en label-density er reiknuð
   - click handlers eiga að leita í fullum data refs, ekki label-marker refs

4. `clearRoute...` og unmount þurfa að tæma bæði label refs og data refs.

5. Prófa TypeScript og viðeigandi unit tests.

Þessi fasi leysir rendering/click regression, en ekki endilega station-matching false negatives frá API.

### Phase B - Server/data fix: ekki missa stöðvar á Akureyri -> Egilsstaðir

Markmið: `vegagerdinLayer.points` á nýja kortinu skili að minnsta kosti sömu route-relevant Vegagerðarstöðvum og gamla `/vedrid` fyrir Akureyri -> Egilsstaðir.

1. Bæta við debug/diagnostic sem er öruggt og privacy-safe:
   - í dev eða response metadata má telja:
     - fjölda Vegagerðarstöðva í cache
     - fjölda candidates innan route bbox
     - fjölda matched innan strict threshold
     - fjölda included með fallback/safety rule
   - Ekki logga raw addresses, user ID eða full route geometry.

2. Bera saman fyrir Akureyri -> Egilsstaðir:
   - nýja `vegagerdinLayer.points.length`
   - gamla route-memory `vegagerdinStationIds`
   - stöðvanöfn og distance-from-route

3. Ef nýja layerið skilar færri stöðvum:
   - ekki stoppa við client hotfix
   - laga matching sjálft

### Phase C - Gulltryggur route-station matcher

Markmið: sameiginlegur matcher fyrir Road Intelligence sem má endurnýta í `/vedrid`, `/ferdalagid` og síðar segment-state.

Setja nýjan kjarna undir `lib/iceland-routes/` frekar en að troða meiri sérlausn í `app/api/.../route.ts`.

Tillaga að skrá:

- `lib/iceland-routes/routeStationMatching.ts`

Hann ætti að taka:

- selected route geometry eða route segment chain
- provider stations með `provider`, `stationId`, `lat`, `lon`
- provider-specific policy, t.d. Vegagerðin vs Veðurstofan

Og skila:

- `stationId`
- `provider`
- `distanceFromRouteM`
- `distanceFromOriginM`
- `routeFraction`
- `matchConfidence`: `strict | buffered | route-memory-fallback | segment-associated`
- `matchReason`

Lágmarkslógík:

1. Densify route geometry fyrir matching:
   - tryggja að bil milli route points sé ekki of langt fyrir station matching
   - t.d. max segment gap 250-500 m fyrir matching, ekki endilega fyrir render

2. Tvö þrep:
   - strict threshold, t.d. 1 km
   - safety buffer fyrir Vegagerðarstöðvar, t.d. 2-3 km, en með route-order og bbox checks

3. Station inclusion policy:
   - ef stöð er strict -> include
   - ef stöð er buffered og er nálægt valdri akstursleið/segment chain -> include
   - ef gamla route-memory segir að þessi exact route hafi stöð og hún er enn innan sanity radius frá nýju route chain -> include með `route-memory-fallback`

4. False-positive varnir:
   - ekki taka stöðvar bara af því þær eru innan stórs bbox
   - ekki hækka threshold global án route/segment sanity
   - reverse direction þarf að gefa sama station set í öfugri röð

5. Provider-neutral API:
   - Vegagerðin og Veðurstofan mega hafa mismunandi display/density
   - station matching core á ekki að vera bundinn við UI component eða provider-specific rendering

### Phase D - Route-memory sem audit/fallback, ekki canonical Google-truth

Gamla route-memory er gagnlegt til að finna regression: "gamla kerfið fann 6 stöðvar, nýja finnur 1".

En nýja long-term truth á að vera Road Intelligence route/segment matcher, ekki Google raw polyline né varanleg Google route content.

Í transition má nota route-memory þannig:

- read-only fallback/audit fyrir known from/to route
- ef nýi matcherinn skilar færri stöðvum en route-memory fyrir sömu normalized from/to, flagga mismatch í dev diagnostics
- mögulega include-a route-memory stöðvar ef þær standast sanity check gegn nýju route chain

Ekki vista raw Google geometry. Ekki auka privacy surface.

## Tests sem Claude Code ætti að bæta við

1. `RoadMapPrototypeMap` eða helper unit:
   - Vegagerðin route labels: ef 8 Vegagerðarpunktar koma inn, þá eru 8 labels búin til eða sýnileg.
   - `nalgast-othaegindi` fær always-label ef density gildir fyrir annað provider.

2. Matcher tests:
   - Akureyri -> Egilsstaðir fixture með stöðvum nálægt leið og einni rétt utan strict 1 km en innan safety buffer.
   - Nearby off-route station sem má ekki fylgja með.
   - Reverse Egilsstaðir -> Akureyri skilar sama station set í öfugri route order.
   - Densified route finnur stöð sem sparse chord missir.

3. API contract test:
   - `/api/teskeid/weather/travel` notar nýja routeStationMatching helper fyrir Vegagerðin.
   - Response inniheldur `vegagerdinLayer.points` með fullu station seti og `mappedPointCount`.

## Design check

Codex las `Design.md`. Fyrir Phase A/B þarf sérstaklega að passa:

- mobile-first overlay: labels mega ekki valda óstjórnlegu horizontal overflow
- labels þurfa að vera þétt en læsileg
- status-litur má ekki vera eina merkingin; vindtala og station popup hjálpa
- controls og status pillur mega ekki fara undir mobile browser chrome

Ef allar Vegagerðarstöðvar eru sýndar sem labels á löngum leiðum og það verður of þétt á map viewport, þá á næsta refinement að vera zoom-aware collision/density sem forgangsraðar en týnir ekki station data. Fyrst er correctness mikilvægari en fegurð.

## Route Intelligence check

- Leið/route-family: Akureyri -> Egilsstaðir, Norðurland/Austurland, líklega Route 1/Mývatn/Möðrudalsöræfi/Jökuldalur corridor.
- Ný þekking á heima í `IcelandRoadmap.md` / `lib/iceland-routes/`, ekki bara í `RoadMapPrototypeMap.tsx`.
- Lausnin á að vera provider-neutral í matching-kjarna, með provider-specific rendering.
- Líklega þarf canonical route family / segment fixture fyrir Akureyri -> Egilsstaðir og tests.
- Privacy: engin user ID, engin raw address, engin raw Google geometry í persistent storage.
- Google má vera provider/fallback, en station membership á að verða afleidd Teskeiðarþekking.

## Supabase / SQL / production

Engin SQL er hluti af þessu handoffi.

Ekki keyra migrations.
Ekki breyta RLS.
Ekki deploya.
Ekki commit-a/push-a nema Stebbi biðji sérstaklega um það.

Ef Claude Code ákveður að nota route-memory sem fallback/audit þarf það fyrst að vera read-only. Ef nýtt persistence/cache layer verður lagt til þarf sér SQL-handoff og Stebba samþykki.

## Localhost checks for Stebbi

Prófa á localhost, ekki production:

1. Opna `/auth-mvp/vedrid/road-map-prototype` sem notandi með `road-intelligence-v1`.
2. Slá inn `Akureyri` -> `Egilsstaðir`.
3. Reikna leið.
4. Vænt niðurstaða eftir Phase A+B:
   - allar Vegagerðarstöðvar sem tilheyra leiðinni sjást með vindtölum strax
   - status pillur undir/í route panel telja sömu stöðvar og eru sýnilegar á leiðinni
   - ef gamla `/vedrid` sýnir 5 innan marka + 1 óþægilega, nýja kortið má ekki sýna færri route-relevant Vegagerðarstöðvar
   - smellur á hvaða route station punkt sem er opnar rétt popup/detail
5. Prófa reverse:
   - `Egilsstaðir` -> `Akureyri`
   - sama station set, öfug röð
6. Prófa status filter:
   - Simple: `Innan marka`, `Óþægilegt`, `Hættulegt`
   - Nánar: allar nákvæmar pillur
   - filter má fela sjónrænt, en má ekki eyða data þannig click/summary ruglist
7. Prófa mobile breidd 390-546 px:
   - route panel, labels og controls mega ekki valda horizontal overflow
   - map má enn pan/zoom-a eðlilega

Ekki prófa production eða keyra SQL fyrir þetta án sérstakrar beiðni.

## Spurningar fyrir Claude Code að rýna sérstaklega

1. Er núverandi `routeGeometry.providerMatchingPoints` í nýja Road Intelligence flæðinu raunverulega road-accurate fyrir Akureyri -> Egilsstaðir, eða er hún enn Google/simplification-dependent?
2. Er hægt að fá station setið úr núverandi route segment chain / Vegagerðin road layer í stað þess að treysta á polyline projection?
3. Hvar á `routeStationMatching.ts` best heima svo hann nýtist bæði prototype map og seinna `/ferdalagid` replacement?
4. Hver er minnsti öruggi safety buffer fyrir Vegagerðarstöðvar sem minnkar false negatives án þess að búa til false positives?
5. Eigum við að nota route-memory sem tímabundið audit/fallback fyrir known routes þar til segment matcherinn er fullkominn?

## Tillaga Codex að næsta concrete skrefi

Claude Code ætti að framkvæma Phase A strax, því það er afmarkað og lagar augljósa client regression.

Síðan ætti Claude Code að framkvæma Phase B/C í sama eða næsta áfanga:

- byggja provider-neutral matcher helper
- setja Akureyri -> Egilsstaðir fixture/tests
- tengja `/api/teskeid/weather/travel` Vegagerðin layer við helperinn
- skila handoff með raunverulegum counts fyrir Akureyri -> Egilsstaðir

Ekki láta málið stoppa við að "kortið lítur betur út". Success criteria er að nýja kortið sýni rétta route station membership.
