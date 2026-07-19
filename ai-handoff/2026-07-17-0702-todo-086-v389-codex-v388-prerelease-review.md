# 2026-07-17 07:02 - TODO-086 v389 - Codex review of v388 B0.6/B0.7 prerelease

Created: 2026-07-17 07:02  
Timezone: Atlantic/Reykjavik

Source reviewed: `2026-07-17-0659-todo-086-v388-claude-v387-v386-done-prerelease`

## Stutt niðurstaða

v388 er í rétta átt: Öxi fær nákvæmari evidence point frá Veðurstofustöðinni og provider-station matching fær sérstakt road-intelligence lag fyrir Google polyline sem sker of gróft yfir beygjur/firði.

Ég myndi samt ekki gefa þetta út óbreytt. Tvö atriði þurfa að lagast fyrst:

1. Öxi/evidence detection notar nálægð við route vertices, ekki nálægð við polyline segment.
2. Route-control gate matching notar líka nálægð við vertices, og reversed-route anchor order getur bjagað röð/ETA fixed-provider stöðva.

## Findings

### 1. High: Öxi evidence point getur enn misst leið sem fer yfir Öxi ef Google setur ekki vertex nálægt stöðinni

`lib/weather/routeCautions.ts:102` skilgreinir `routePassesNear()` sem:

```ts
return points.some(p => haversineM(p, target) <= radiusM)
```

Svo notar `present-near-corridor` þetta í `lib/weather/routeCautions.ts:244-252` fyrir bæði `corridorPoints` og `evidencePoints`.

Þetta mælir bara fjarlægð frá evidence point að decoded route vertices. Það mælir ekki fjarlægð að polyline segmentinu milli vertexa.

Afleiðing: Ef Google polyline fer raunverulega yfir/við Öxi stöðina, en næstu decoded punktar eru sitt hvoru megin við stöðina, getur 1.5 km evidence radius fallið falskt út. Þetta er sama undirliggjandi vandamál og við erum að leysa fyrir Veðurstofustöðvarnar: fixed point á að mätchast við línuna, ekki bara punkta á línunni.

Fix:

- Endurnýta segment projection lógíkina úr `lib/weather/providerRouteMatching.ts`.
- Best væri að draga út exportað helper, t.d. `distanceToPolylineM(point, polyline)` eða `routePassesWithinPolylineM(polyline, point, radiusM)`.
- Nota sama helper í `routeCautions.ts` fyrir `present-near-corridor`, sérstaklega `evidencePoints`.
- Bæta regression prófi þar sem route er bara tveir punktar beggja vegna Öxi stöðvarinnar, segmentið fer nálægt stöðinni, en hvorugur vertex er innan 1.5 km. Það próf ætti að faila núna og passa eftir fix.

### 2. Medium: Route-control gates nota líka vertex proximity og geta misst leið sem segment fer í gegnum gate

`lib/weather/routeControlPoints.ts:133-138` kveikir route-control anchors með:

```ts
const allGatesMatched = section.gates.every(gate =>
  result.some(p => haversineM(p.lat, p.lon, gate.lat, gate.lon) <= gate.radiusM)
)
```

Þetta er sami galli í annarri mynd. Eftir RDP einföldun geta punktar verið fáir, sérstaklega þegar Google chordar. Route segmentið getur farið í gegnum gate radius án þess að nokkur vertex sé innan radius.

Þetta getur þýtt að `ring-road-vik-skeidflotur` virki í sumum tilfellum en detti út eftir því hvernig Google skilar polyline. Þá verðum við aftur háð tilviljun í decoded punktum.

Fix:

- Nota sama `routePassesWithinPolylineM()` helper fyrir gate matching.
- Halda áfram að nota gates sem activation skilyrði, en gate matching á að vera "route line passes within gate radius", ekki "some point is within gate radius".
- Bæta prófi þar sem leið er chord frá vestur-endpointi til austur-endpoints og gate liggur nálægt segmentinu en ekki nálægt neinum vertex.

### 3. Medium: Reversed route injectar anchors í ranga röð

`lib/weather/routeControlPoints.ts:157-164` swappar `startIdx/endIdx` þegar leiðin er reverse, en anchors eru samt alltaf settir inn í registry röð:

```ts
if (startIdx > endIdx) [startIdx, endIdx] = [endIdx, startIdx]
...
...section.anchors,
```

Prófið í `lib/__tests__/routeControlPoints.test.ts:102-112` staðfestir bara að anchors birtist og endpoints varðveitast. Það staðfestir ekki að anchors séu í réttri ferðastefnu.

Afleiðing: Fyrir east-to-west route getur provider matching fengið polyline sem hoppar rangt í gegnum control section. Þar sem `matchProviderPointsToRoute()` reiknar `distanceFromOriginM` og `routeFraction` út frá polyline röð getur þetta bjagað röð veðurstöðva, ETA og "x km frá brottfararstað" fyrir Veðurstofuna og síðar Vegagerðina.

Fix:

- Halda utan um hvort route hafi verið reverse áður en idx eru swöppuð.
- Ef route fer í reverse direction, nota `section.anchors.slice().reverse()`.
- Bæta prófi sem sannar að reversed route skili anchors í reverse order og að matched station nálægt austari anchor komi fyrr en stöð nálægt vestari anchor.

### 4. Medium: `verified: false` control section er virk í runtime

`lib/weather/routeControlPoints.ts:80-84` merkir fyrsta real section sem `verified: false`, en `augmentProviderMatchingPoints()` notar öll sections án þess að athuga `verified`.

Þetta er kannski í lagi á localhost meðan Stebbi er að sannreyna, en sem prerelease/release hegðun er þetta hættulegt: approximate anchors geta haft áhrif á hvaða Veðurstofustöðvar teljast á leiðinni og í hvaða röð þær birtast.

Fix options:

- Fyrir production: annaðhvort sleppa `verified: false` sections sjálfgefið, eða gera dev-only opt-in meðan verið er að staðfesta.
- Ef Stebbi hefur nú þegar staðfest section sjónrænt á localhost, þá má setja `verified: true`, en þá þarf líka að uppfæra commentið svo það sé ekki enn "PENDING LOCALHOST VERIFICATION".
- Ég myndi ekki láta óstaðfesta anchors fara í release án þess að þetta sé afdráttarlaust ákveðið.

### 5. Low: Skýrslutextinn segir að route-control hafi ekki áhrif á route caution detection, en v388 er líka að breyta route caution detection

`lib/weather/routeControlPoints.ts:15-19` segir réttilega að route-control sjálft hafi ekki áhrif á route caution detection. En v388 sameinar tvo fasa: B0.6 route-control og B0.7 Öxi caution evidence.

Þetta er ekki code bug, en í handoffum og comments þarf að vera mjög skýrt að:

- B0.6: providerMatchingPoints fyrir fixed providers.
- B0.7: routeCautions fyrir warning chips og curated-route trigger.

Annars verður auðvelt að rugla saman "Veðurstofustöð birtist á leið" og "leið fær Öxi warning og curated alternative".

## Staðfestingar sem ég keyrði

- `npm run type-check` -> pass
- `npm run test:run -- lib/__tests__/routeControlPoints.test.ts lib/__tests__/weather-route-cautions.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/providerRouteMatching.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/weather-provider-stations.test.ts` -> 6 files pass, 195 tests pass

Ég keyrði ekki fulla test suite og ekki localhost/browserpróf.

## Tillaga að næsta framkvæmdarskrefi fyrir Claude Code

Áður en release:

1. Búa til einn shared geometry helper fyrir route-line distance:
   - annaðhvort exporta projection helper úr `providerRouteMatching.ts`
   - eða búa til `lib/weather/routeGeometryDistance.ts`
   - helper á að mæla point-to-polyline-segment distance, ekki bara point-to-vertex.
2. Nota helperinn í:
   - `routeCautions.ts` fyrir `present-near-corridor` og `evidencePoints`
   - `routeControlPoints.ts` fyrir gate matching
3. Laga reversed-route anchor order.
4. Taka ákvörðun um `verified: false`:
   - ekki virkja í production fyrr en staðfest
   - eða merkja `verified: true` eftir sjónræna staðfestingu og uppfæra comment.
5. Bæta tests:
   - Öxi station evidence með segment-only route, no nearby vertex.
   - route-control gate með segment-only match, no nearby vertex.
   - reversed route anchor order / distance order.
   - núverandi tests halda áfram græn.

## Localhost checks for Stebbi

Eftir fix frá Claude Code:

1. Opna `/vedrid` á localhost.
2. Prófa `Höfn -> Egilsstaðir`.
   - Vænt: leiðin um Öxi fær "Varasamt með eftirvagna".
   - Vænt: alternative "Til að sleppa við Öxi" / leið um Reyðarfjörð birtist ef Google skilar Öxi sem default og engin base-route forðast Öxi.
3. Prófa `Egilsstaðir -> Höfn`.
   - Vænt: sama caution og sama alternative logic virkar í hina áttina.
4. Prófa `Reykjavík -> Egilsstaðir`.
   - Vænt: Vík/Skeiðflötur/Vatnsskarðshólar Veðurstofustöðvar nálægt alvöru vegi detta inn ef þær eru innan 1 km frá leiðarlínunni eftir control-point fix.
   - Vænt: met.no/Yr route points og grunnútreikningur breytist ekki óvænt.
5. Prófa reverse route `Egilsstaðir -> Reykjavík`.
   - Vænt: Veðurstofustöðvar í Vík/Skeiðflötur kafla raðast í rétta ferðastefnu og ETA/distance texti lítur eðlilega út.
6. Prófa route sem á ekki að triggera control section, t.d. `Selfoss -> Þorlákshöfn`.
   - Vænt: engin Vík/Skeiðflötur anchor áhrif og engar óvæntar Veðurstofustöðvar.

## Óvissa / þarf að staðfesta

- Ég staðfesti ekki raunveruleg Google polyline gögn í browser, bara las kóða og keyrði focused tests.
- Ég er ekki viss hvort `ring-road-vik-skeidflotur` anchors séu nægilega nákvæmir fyrir production. Commentin segja sjálf að þau séu approximate og pending verification.
- Ef Stebbi vill prófa þetta eingöngu á localhost fyrst, þá má v388 vera ágætis tilraunastaða. Fyrir production myndi ég laga findings 1-4 fyrst.
