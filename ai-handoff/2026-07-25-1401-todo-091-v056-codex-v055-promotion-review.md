# TODO 091 v056 — Codex rýni á v055 promotion-plan

Created: 2026-07-25 14:01  
Timezone: Atlantic/Reykjavik

## Findings

### P1 — Stöðvaspjöld eru chat/provider-gated, ekki aðeins auth-gated

Claude lýsir ákvörðuninni sem „auth-only vs public read-only“ í
`v055:140-170`. Það er ekki full lýsing á núverandi access-contract.

Bæði full station pages kalla `checkChatAccess()` eftir session guard:

- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx:24-27`
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx:33-36`

`checkChatAccess()` krefst:

- innskráningar;
- `TESKEID_CHAT_ENABLED=true`;
- weather shell access;
- Veðurstofu provider access fyrir Veðurstofuspjaldið;
- mögulega Vegagerðar provider gate;
- mögulega weather-pulse gate.

Sjá `lib/chat/access.server.ts:20-66`.

Afleiðing: venjulegur innskráður notandi á promoted `/auth-mvp/vedrid` getur
smellt á punkt, farið á station route og verið redirectaður strax aftur á
`/auth-mvp/vedrid`. Það lítur út eins og dauður punktur. Að athuga aðeins
`isAuthenticated` í kortinu, eins og Valkostur A gerir ráð fyrir, leysir þetta
ekki.

**Krafist fyrir promotion:**

Ákveða eitt af tveimur raunhæfum contracts:

1. **Mælt með:** read-only station detail er weather capability, en chat/pulse
   er sér capability.
   - Extract-a provider-neutral read-only station loader/view.
   - Public og almennir weather users mega lesa opinber spá-/mæligögn.
   - Chat preview/thread/write controls birtast aðeins þegar full
     `checkChatAccess` leyfir.
   - Vegagerðar-client má ekki ræsa `/api/auth-mvp/vedurpuls/thread` fyrir
     public/read-only notanda.
2. Halda fullu station page chat-gated, en senda nákvæmt server-derived
   capability prop í kortið og sýna sign-in/unavailable CTA fyrir bæði public
   og innskráða notendur sem skortir chat/provider access.

Ekki búa bara til public routes sem rendera núverandi client components
óbreytt. `VegagerdinPulsClient` reynir að stofna thread við mount og
Veðurstofuspjaldið les chat preview. Það þarf explicit read-only mode eða
aðskilinn view component.

### P1 — Legacy prototype redirect target í v055 er rangur fyrir public

`v055:182-190` og scope-taflan við `v055:220` leggja til að halda
prototype-slóð public en redirecta hana á `/auth-mvp/vedrid`.

Núverandi middleware skilgreinir prototype exact route sem public
(`middleware.ts:75-77`). Óinnskráður notandi með gamlan bookmark myndi því:

1. komast inn á public prototype redirect;
2. vera sendur á auth route;
3. lenda í `/innskraning`.

Það brýtur public compatibility.

**Rétt contract:**

- Legacy `/auth-mvp/vedrid/road-map-prototype` redirectar á public `/vedrid`.
- Query string er varðveitt.
- Núverandi middleware canonicalize-ar síðan aðeins innskráðan notanda frá
  `/vedrid` á `/auth-mvp/vedrid` og varðveitir query
  (`middleware.ts:239-249`).
- EXACT_PUBLIC_PATHS entry þarf að haldast meðan legacy redirect er studdur.

Þetta gefur eina canonicalization-keðju fyrir public og auth án þess að page
þurfi að giska á session.

### P1 — v055 vantar transition-contract fyrir núverandi `/vedrid` query og auth-return flows

Claude segir að `WeatherOverviewClient` tilvísanir „hverfi sjálfkrafa“ og
þurfi enga lagfæringu (`v055:174-180`). Það er of þröngt.

Núverandi `/vedrid` contract inniheldur meðal annars:

- `?saveDefaults=...`;
- `?saveStatusFilterMode=...`;
- pending session key fyrir status filter mode;
- `?provider=...&stationId=...` deep-link semantics/tests;
- route draft og `/vedrid/ferdalagid`;
- gamlar station `returnTo=/vedrid?...` slóðir.

`RoadMapPrototypeMap` skilur annað save contract:

- `?saveWeatherChaseDefaults=1`;
- route restore með `context=route&view=...&restoreRoute=1`;
- það les ekki almennt `stationId`, `saveDefaults` eða
  `saveStatusFilterMode`.

Afleiðing: auth flow sem hófst rétt fyrir deploy, bookmark eða eldri station
back link getur lent á nýja skjánum með query sem er hljóðlega hunsað.

**Krafist áður en framkvæmd hefst:**

Búa til migration matrix fyrir hvert núverandi query/session contract:

- styðja tímabundið og þýða yfir í nýtt state;
- redirecta á viðeigandi legacy sub-route;
- eða afnema vísvitandi með skýru cleanup.

Ekki eyða `WeatherOverviewClient` route entry fyrr en þessi matrix er
samþykkt. Sérstaklega skal halda bæði `/vedrid/ferdalagid` og
`/auth-mvp/vedrid/ferdalagid` óbreyttum í fyrsta promotion commit.

### P1 — `basePath` eitt og sér er of óskýrt API

Tillaga v055 að einu `basePath` prop er rétt átt, en propinu er ætlað að bera
of margar ólíkar merkingar:

- canonical page path;
- route restore return;
- station back target;
- sign-in `next`;
- conditions-feed return;
- mögulega provider/station selection query.

Þetta eykur líkur á að public `/vedrid` sé notað þar sem auth destination eða
station-selection URL þarf að vera.

**Mælt API:**

Nota typed navigation contract, til dæmis:

```ts
type RoadMapNavigation = {
  canonicalPath: '/vedrid' | '/auth-mvp/vedrid'
  authenticatedPath: '/auth-mvp/vedrid'
}
```

Og helpers:

- `buildDriveReturnHref(view)`;
- `buildSignInReturnHref(intent)`;
- `buildStationReturnHref(provider, stationId, context)`.

`DriveJourneyPanel` fær síðan explicit `stationReturnTo`, ekki generic
`returnTo`.

Þetta er lítið aukið type-safety, ekki stór architecture-breyting.

### P2 — Prófaáætlun v055 er of almenn fyrir route promotion

`v055:239-249` nefnir full tests/build og browser check, en vantar targeted
automated coverage fyrir nýja contractið.

Claude Code þarf að bæta við:

- public `/vedrid` page test: renderar nýja kortið með public navigation props;
- authenticated `/auth-mvp/vedrid` page test: guard/access og auth props;
- legacy prototype redirect test með query varðveittu;
- middleware test:
  - public legacy link → public redirect target;
  - authenticated `/vedrid?...` → `/auth-mvp/vedrid?...`;
  - engin redirect loop;
- `pulseBack` tests fyrir `/vedrid` og `/auth-mvp/vedrid` sem `drive`;
- boundary tests fyrir `/vedrid-anything` og
  `/auth-mvp/vedrid-anything`;
- navigation helper tests fyrir public/auth, stationId og route restore;
- access tests fyrir valið station-detail contract, þar með talið:
  - public;
  - authenticated án chat;
  - authenticated án provider gate;
  - full pulse access.

Full Vitest suite ein og sér sannar ekki að prop threading og redirect target
séu rétt.

### P2 — CSS/layout niðurstaðan er rétt, en wording og cleanup þarf að vera nákvæmt

Claude hefur rétt fyrir sér að parent layouts þekja undirroutes samkvæmt
Next.js App Router inheritance:

- `app/vedrid/layout.tsx` þekur public weather tree;
- `app/auth-mvp/vedrid/layout.tsx` þekur auth weather tree og
  `road-map-prototype`.

MapLibre CSS + `viewportFit: cover` þurfa að flytjast þangað.

En `prototype/layout.tsx` má annaðhvort:

- eyða eftir að parent layout er komið;
- eða halda sem löglegum layout component.

Það má ekki „verða tómt“ í þeim skilningi að layout file sé skilin eftir án
default export. Einnig þarf build/browser check að staðfesta að CSS import sé
ekki tvítekið í nested layouts.

### P2 — Handoffið hefur rangt timestamp samkvæmt repo-reglu

Filename segir `2026-07-25-1355`, en inni í handoffinu stendur
`Created: 2026-07-25 14:30` (`v055:3`). Við Codex-rýni kl. 14:01 var sá tími
auk þess enn í framtíðinni.

Þetta brýtur hard rule í `WORKFLOW.md` um að keyra tímaskipun og nota sama
rauntíma í filename og `Created`.

Þetta hefur ekki runtime-áhrif, en Claude Code þarf að laga handoff-ferlið
fyrir næsta skjal og má ekki byggja audit trail á v055 timestampinu.

### P3 — Tvær staðhæfingar í v055 eru ónákvæmar

1. `v055:57-59` segir að return URL sé skrifuð í route snapshot.
   `persistRouteReturnSnapshot()` geymir Frá/Til, resolved hnit, thresholds og
   view (`RoadMapPrototypeMap.tsx:4293-4305`), ekki URL.
2. „Þrjár guaranteed regressions“ telur sign-in CTA sem sérstakt #3, en það er
   sami hardcoded-path galli og #2.

Þetta breytir ekki meginniðurstöðu Claude, en corrected implementation scope
á að byggja á raunverulegum contracts.

## Það sem Claude greindi rétt

- MapLibre CSS og `viewportFit` þurfa parent layouts.
- Hardcoded prototype paths þarf að fjarlægja úr
  `RoadMapPrototypeMap` og `DriveJourneyPanel`.
- `/vedrid` og `/auth-mvp/vedrid` eiga að flokkast sem `drive` í
  `pulseBack` eftir promotion.
- Session storage keys eru path-neutral.
- `window.location.pathname` save-flow nýja componentsins aðlagast canonical
  route sjálfkrafa.
- Promotion þarf product-ákvörðun um station detail experience.
- Engin SQL, migration eða RLS breyting ætti að þurfa.

## Corrected promotion plan

### Áfangi 0 — ákvarðanir áður en kóði er snertur

1. Ákveða station detail contract:
   - read-only weather detail fyrir alla weather users + gated chat (mælt með);
   - eða full chat-gated page með capability-aware CTA.
2. Samþykkja compatibility matrix fyrir:
   - `saveDefaults`;
   - `saveStatusFilterMode`;
   - provider/station deep links;
   - `routeDraft`;
   - station return URLs;
   - legacy prototype URL.
3. Staðfesta að standalone `ferdalagid` routes haldist í fyrsta rollout.

### Áfangi 1 — typed navigation og layouts

1. Bæta parent MapLibre layouts fyrir public/auth weather trees.
2. Introduce-a typed navigation contract/helper.
3. Parameterize-a öll hardcoded prototype path literals.
4. Uppfæra `DriveJourneyPanel` með explicit station return prop.
5. Uppfæra `pulseBack` og targeted tests.

### Áfangi 2 — station access

1. Extract-a read-only station data/view frá chat capability ef sá valkostur
   er samþykktur.
2. Halda thread/write APIs auth + chat gated.
3. Aldrei kalla thread creation í public/read-only mode.
4. Prófa provider-gated og chat-disabled states.

### Áfangi 3 — route promotion og compatibility

1. Láta public/auth weather pages rendera sama map page wrapper.
2. Halda `WEATHER_ENABLED` kill switch og auth canonicalization.
3. Legacy prototype redirect → `/vedrid`, query varðveitt.
4. Bæta tímabundnum query translators/cleanup samkvæmt matrix.
5. Halda standalone trip routes.

### Áfangi 4 — staðfesting og rollout

1. Targeted page/middleware/navigation/access tests.
2. Type-check, full Vitest, production build, diff-check.
3. Localhost browser matrix fyrir public/auth, 360-530 px + desktop.
4. Deploy aðeins með skýru leyfi.
5. Vercel Ready + production smoke check.
6. Halda legacy redirect að minnsta kosti einn release cycle.

## Security / auth / privacy

- Ekki veikja `checkChatAccess` eða opna thread/message write APIs.
- Public station detail má aðeins lesa nú þegar opinber provider-gögn og
  public preview; engin falin messages, netföng eða user context.
- Middleware `/vedrid` prefix er public, þannig að hver ný public subroute
  verður að hafa eigin weather-enabled/provider validation.
- Engin SQL eða migration er nauðsynleg.
- Session restore heldur áfram að vera tab-local og TTL-afmarkað.

## Route intelligence check

Promotion breytir canonical UI/navigation en ekki route graph, segments,
station matching eða provider data. `IcelandRoadmap.md` þarf ekki uppfærslu.
Compatibility við route-memory/routeDraft þarf þó að vera skýr svo núverandi
leiðaþekking glatist ekki úr product flow.

## Localhost checks for Stebbi

Eftir corrected implementation:

1. Public `/vedrid` í `WEATHER_ENABLED=All`.
2. Authenticated `/vedrid` canonicalize-ar með query varðveittu.
3. Legacy prototype bookmark með route restore query:
   - public → `/vedrid?...`;
   - auth → `/auth-mvp/vedrid?...`.
4. Station click fyrir:
   - public;
   - auth án chat;
   - auth án provider access;
   - full pulse user.
5. UI-back og browser/device-back varðveita route context.
6. Pending login flow frá gömlu `saveDefaults` og nýju
   `saveWeatherChaseDefaults`.
7. Provider/station deep link og station return link.
8. `/vedrid/ferdalagid` og auth counterpart.
9. `WEATHER_ENABLED=off`, `Authenticated`, `All`.
10. MapLibre CSS/sizing, safe-area, no overflow við 360, 390, 460, 530 px og
    desktop.
11. Console án hydration, 401 loops, `map_not_ready` eða thread creation í
    read-only mode.

## Verdict

**Ekki framkvæma v055 óbreytt.**

Claude fann mikilvæga CSS/path blockers, en plan þarf að leiðrétta fyrir
station chat/provider access, public legacy redirect og transition-contract
gamla `/vedrid`.

Eftir að Stebbi hefur tekið station-detail og compatibility ákvarðanir er
promotion öruggt sem 3-4 litlir áfangar. Confidence: hátt.
