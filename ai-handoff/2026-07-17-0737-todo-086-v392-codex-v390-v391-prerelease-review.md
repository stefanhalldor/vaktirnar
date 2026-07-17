# 2026-07-17 07:37 - TODO-086 v392 - Codex review of v390/v391 prerelease

Created: 2026-07-17 07:37  
Timezone: Atlantic/Reykjavik

Sources reviewed:

- `2026-07-17-0815-todo-086-v390-claude-oxi-curated-route-fix`
- `2026-07-17-0735-todo-086-v391-claude-v389-findings-1-3`

## Stutt niðurstaða

v390/v391 eru tæknilega á réttri leið:

- Öxi-curated route var suppressed af of breiðum `corridorPoint`; `evidencePointsOnly` útskýrir vandann vel.
- Shared `pointToPolylineDistanceM()` helper er rétt átt fyrir bæði route cautions og fixed-provider route matching.
- Reversed anchor order er lagað hugmyndalega rétt.

En þetta er **ekki release-ready núna**:

- `npm run type-check` fellur.
- Focused test run fellur.
- `evidencePointsOnly` er notað þannig að curated route getur misst display warnings sem notandinn ætti að sjá.
- `verified: false` control section er enn virk í runtime.

## Findings

### 1. High: `npm run type-check` fellur á route-control testinu

`lib/__tests__/routeControlPoints.test.ts:123`, `:124`, `:128`

TypeScript villan:

```txt
Argument of type 'number' is not assignable to parameter of type '-21.8 | -21.6 | -21.3'.
```

Ástæðan er líklega að `anchorLons` erfist sem literal union úr `as const` synthetic section, en `p.lon` er almennt `number`. Þetta er bara test typing bug, en build/type-check er rauður og má ekki fara áfram.

Fix:

- Gerið `anchorLons` að `number[]`, eða enn betra `const anchorLonSet = new Set<number>(...)` og notið `anchorLonSet.has(p.lon)`.

### 2. High: Focused test run fellur í `pointToPolylineDistanceM` regression prófi

`lib/__tests__/providerRouteMatching.test.ts:323`

Villan:

```txt
expected 49016.84303871139 to be greater than 50000
```

Þetta er ekki product bug heldur of þröng test assertion. Prófið vill bara sanna að vertexarnir séu langt utan 6 km radius, en notar `> 50_000` þó raunfjarlægðin sé ~49 km.

Fix:

- Breyta assertion í eitthvað sem sannar rétta pointið án óþarfa nákvæmni, t.d. `> 40_000`, eða færa test endpointana lengra frá.
- Mikilvæga assertionið er `pointToPolylineDistanceM(...) < 6_000`; halda því.

### 3. Medium: `evidencePointsOnly` síar líka `cautions` sem fara með curated route í UI

`lib/weather/google.server.ts:366-385`

`fetchCuratedRoute()` reiknar nú:

```ts
const cautions = matchRouteCautions(allPoints, from, to, { evidencePointsOnly: true })
```

Þetta leysir suppression vandann fyrir `CURATED_AVOID_OXI`, en það þýðir líka að curated route-ið sjálft fær aðeins evidence-point-based present-near-corridor warnings. Broad/verified corridor warnings sem notandinn ætti mögulega að sjá geta horfið af curated route display.

Þetta er sérstaklega viðkvæmt því `fetchCuratedRoute()` er sameiginlegt fyrir allar curated route reglur, ekki bara Öxi.

Betri útfærsla:

1. Reikna **display cautions** venjulega:
   ```ts
   const displayCautions = matchRouteCautions(allPoints, from, to)
   ```
2. Reikna **validation cautions** sér fyrir suppression, og aðeins með sértækri validation policy:
   ```ts
   const validationCautions =
     rule.id === 'avoid-oxi-via-reydarfjordur'
       ? matchRouteCautions(allPoints, from, to, { evidencePointsOnly: true })
       : displayCautions
   ```
3. Return-a route með `displayCautions`, en nota `validationCautions` til að ákveða hvort eigi að suppressa.

Þannig höldum við UI warnings heilum en forðumst að Öxi avoidance route sé ranglega suppressed af 10 km approximate corridor.

### 4. Medium: `verified: false` route-control section er enn virk í runtime

`lib/weather/routeControlPoints.ts:72-104`, sérstaklega `verified: false` í `:84`.

Þetta er eftirstandandi v389 finding 4 og Claude Code staðfestir að það sé óleyst. Það þýðir að approximate Vík/Skeiðflötur anchors geta enn haft áhrif á hvaða Veðurstofustöðvar birtast og í hvaða röð þær birtast.

Áður en release:

- Annaðhvort staðfestir Stebbi section sjónrænt og Claude Code setur `verified: true` með uppfærðum commentum.
- Eða `augmentProviderMatchingPoints()` sleppir `verified: false` sections í production / default runtime og leyfir þeim bara með skýru dev/test opt-in.

Ég myndi ekki release-a runtime með section sem segir sjálft `PENDING LOCALHOST VERIFICATION`.

### 5. Low: v391 filename og Created timestamp stemma ekki

Filename:

```txt
2026-07-17-0735-todo-086-v391-claude-v389-findings-1-3.md
```

Innihald:

```txt
Created: 2026-07-17 08:45
```

Þetta brýtur workflow-regluna um tíma í handoff. Ekki product blocker, en gott að passa sérstaklega áfram þar sem við erum komin með mjög mörg handoff og þurfum tímaröðina til að halda haus.

## Staðfestingar sem ég keyrði

- `npm run type-check` -> fail
  - `lib/__tests__/routeControlPoints.test.ts:123`
  - `lib/__tests__/routeControlPoints.test.ts:124`
  - `lib/__tests__/routeControlPoints.test.ts:128`
- `npm run test:run -- lib/__tests__/providerRouteMatching.test.ts lib/__tests__/routeControlPoints.test.ts lib/__tests__/weather-route-cautions.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/weather-provider-stations.test.ts` -> fail
  - 5 test files passed
  - 1 test failed: `providerRouteMatching.test.ts`
  - 204 passed, 1 failed

Ég keyrði ekki fulla suite og ekki localhost/browserpróf.

## Hvað er gott í v390/v391

- `pointToPolylineDistanceM()` er rétt sameiginlegt abstraction fyrir fixed-provider matching, route cautions og route-control gates.
- `routeCautions.ts` notar nú segment projection, ekki vertex proximity.
- `routeControlPoints.ts` notar nú segment projection fyrir gates.
- Reversed anchor order er lagað í rétta átt.
- Prófin bæta við gagnlegum regression cases fyrir segment-only detection.

## Tillaga að næsta framkvæmdarskrefi fyrir Claude Code

Laga í þessari röð:

1. Laga type-check villuna í `routeControlPoints.test.ts`.
2. Laga of þrönga assertionið í `providerRouteMatching.test.ts`.
3. Breyta `fetchCuratedRoute()` þannig að route display cautions og validation cautions séu aðskilin.
4. Taka ákvörðun um `verified: false` control sections:
   - annaðhvort production guard
   - eða staðfesta Vík/Skeiðflötur section og merkja `verified: true`.
5. Keyra:
   - `npm run type-check`
   - focused test runið hér að ofan
   - helst einnig `npm run test:run -- lib/__tests__/weather-google.test.ts` ef ekki þegar inni í focused run.

## Localhost checks for Stebbi

Eftir næsta fix:

1. Prófa `Höfn -> Egilsstaðir`.
   - Vænt: default route um Öxi fær "Varasamt með eftirvagna".
   - Vænt: "Til að sleppa við Öxi" birtist.
   - Vænt: avoidance route fær ekki Öxi caution ef hún fer um firðina.
2. Prófa `Egilsstaðir -> Höfn`.
   - Vænt: sama hegðun í reverse direction.
3. Prófa route þar sem Google gefur þegar base alternative sem forðast Öxi.
   - Vænt: ekki auka Google curated request ef base route forðast Öxi, en avoidance route fær rétta labelið.
4. Prófa `Reykjavík -> Egilsstaðir`.
   - Vænt: Veðurstofustöðvar í Vík/Skeiðflötur/Vatnsskarðshólar kafla birtast ef þær eru innan 1 km frá corrected providerMatchingPoints.
5. Prófa `Egilsstaðir -> Reykjavík`.
   - Vænt: sömu stöðvar birtast í réttri ferðastefnu.
6. Prófa `Selfoss -> Þorlákshöfn`.
   - Vænt: engin false positive frá Vík/Skeiðflötur control section.

## Óvissa / þarf að staðfesta

- Ég staðfesti ekki server logs eða Google live response, bara kóða og local tests.
- Ég veit ekki hvort Stebbi hefur sjónrænt staðfest `ring-road-vik-skeidflotur`; kóðinn segir enn að það sé pending.
- `evidencePointsOnly` sem validation policy er skynsamlegt fyrir Öxi, en þarf að vera þrengra scope-að svo það breyti ekki UI cautions á öðrum curated routes.
