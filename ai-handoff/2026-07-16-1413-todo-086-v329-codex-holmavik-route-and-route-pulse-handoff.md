---
title: "v329 Codex handoff - Gegnum Hólmavík leið og Safnpúls per ferðaleið"
created: 2026-07-16 14:13
timezone: Atlantic/Reykjavik
todo: todo-086
agent: codex
type: implementation-handoff
---

## Samhengi

Stebbi bendir á mikilvægt product/öryggisatriði:

> Þegar farið er til Ísafjarðar þá gefur þjónustan bara upp eina leið og sú leið er varasöm fyrir bíla með eftirvagna.
>
> Þegar farið er til Ísafjarðar, og líklega allra Vestjarða norðar og vestar en Hólmavík, skulum við alltaf gefa notandanum möguleika á að fara í gegnum Hólmavík fyrst.
>
> Bætum þessu við sem auka leið þegar Google Maps stingur ekki sjálfkrafa upp á að fara í gegnum Hólmavík. Skýrum `Gegnum Hólmavík`.
>
> Svo langar mig að draga fram Safnpúlsi per ferðaleið. Þá drögum við saman safnpúlsi með öllum veðurstöðvum Veðurstofunnar sem eru á valdri leið og setjum hann undir `Mest krefjandi á leiðinni` spjaldið.
>
> Látum hann sýna nýjustu þrjár færslurnar frá hverri og einni veðurstöð í þeirri röð sem veðurstöðvarnar eru á leiðinni.

Codex skilningur:

1. Fyrir ákveðnar Vestfjarðaleiðir á að bæta við curated route option sem setur Hólmavík sem via-point, þegar Google gefur ekki sjálft upp slíka leið.
2. Í niðurstöðu á `/vedrid` á að birta route-scoped Safnpúls undir mest krefjandi Veðurstofu-/leiðarspjaldinu, byggðan á þeim Veðurstofustöðvum sem eru þegar tengdar valdri leið.
3. Safnpúlsinn á að vera í sömu röð og stöðvarnar koma fyrir á leiðinni, ekki global nýjustu skilaboð.

## Skoðað af Codex

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `lib/weather/google.server.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `components/weather/RouteSelectionStep.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/VedurstofanPointCard.tsx`
- `components/weather/VedurstofanPulseInline.tsx`
- `components/chat/ChatPreviewList.tsx`
- `app/api/auth-mvp/vedurpuls/feed/route.ts`
- `lib/chat/repository.server.ts`
- `lib/chat/types.ts`
- `messages/is.json`
- `messages/en.json`

## Findings / vörumat

### P1 - Þetta á ekki að vera UI-only route hack

`lib/weather/google.server.ts` er þegar með `CURATED_ROUTE_RULES` fyrir sérleiðir, m.a. Hellisheiði og Hringinn.

Hólmavík-leiðin ætti að fara inn í sama kerfi:

- nýtt `CURATED_VIA_HOLMAVIK` label
- nýtt via-point nálægt Hólmavík / réttri veglínu
- duplicate-filter svo við sýnum ekki auka leið ef Google base route fer nú þegar í gegnum Hólmavík
- UI label í `RouteSelectionStep`: `Gegnum Hólmavík`

Þetta heldur route-logic á server/provider-laginu og UI þarf bara að birta nýja labelið.

### P1 - Hólmavík via þarf visual verification áður en þetta fer út

Via-point þarf að vera staðsett þannig að Google Routes API snappar leiðina rétt:

- ekki of langt inn í bæ ef það veldur óþarfa króki
- ekki á rangri veglínu
- helst á eða rétt við eðlilega leið um Hólmavík á leið til Ísafjarðar

Claude Code má setja inn proposed coordinate, en Stebbi þarf að sannreyna á localhost kortinu að `Gegnum Hólmavík` fari raunverulega rétta leið áður en útgáfa fer fram.

### P2 - Skilgreina destination scope varlega

Stebbi nefnir Ísafjörð og líklega Vestfirði norðar og vestar en Hólmavík.

Ekki gera þetta of vítt strax þannig að allar Vestfjarðaleiðir fái óþarfa route request.

Tillaga:

- byrja með destination bounds sem ná yfir norður/vestur Vestfirði, þar með Ísafjörð
- hafa `minFastestRouteDistanceM` svo regla triggerist ekki fyrir local stuttar leiðir
- duplicate-filter ef base Google leið fer nú þegar nálægt Hólmavík
- logga curated diagnostic í dev eins og núverandi curated routes gera

Mögulegt nafn:

```ts
const WESTFJORDS_NORTH_WEST_BOUNDS: Bounds = { ... }
const HOLMAVIK_VIA = { lat: ..., lon: ... } // verify visually
```

Ekki treysta á bounds sem endanlega landfræðilega sannleika. Þessi regla þarf vörulegt localhost test með nokkrum dæmum.

### P2 - Safnpúls per leið á ekki að nota global feed óbreytt

Núverandi `WeatherPulseFeed` í `/auth-mvp/vedrid/elta-vedrid` er global feed yfir allar Veðurstofustöðvar.

Nýi Safnpúlsinn á `/vedrid` þarf að vera route-scoped:

- input: station IDs á valdri ferðaleið
- röð: `routeFraction` eða `distanceFromOriginM` hækkandi
- output: nýjustu þrjár færslur fyrir hverja stöð
- birting: undir `Mest krefjandi á leiðinni` spjaldinu

Þetta á ekki að ruglast saman við global Safnpúlsinn í `/elta-vedrid`.

### P2 - Ekki gera N client fetch í hvert spjald ef hægt er að forðast það

`VedurstofanPulseInline` sækir preview per station:

```txt
GET /api/teskeid/weather/vedurpuls/stations/[stationId]/preview
```

Fyrir route-scoped Safnpúls væri klaufalegt ef clientinn kallaði á 10-30 preview endpoints í einu. Betra:

- nýtt server endpoint/helper sem tekur afmarkaðan stationId lista
- skilar grouped preview eftir stationId
- hámarkar fjölda stationIds og limit per station
- notar public-safe DTO, ekki netföng, ekki user IDs, ekki private metadata

Mögulegt endpoint:

```txt
POST /api/teskeid/weather/vedurpuls/route-preview
Body: { stationIds: string[], limitPerStation: 3 }
```

Það má líka vera authenticated/public-compatible read-only endpoint eins og single-station preview, því preview er nú þegar sýnilegt public þegar skilaboð eru til.

Öryggisreglur:

- validate-a öll `stationIds` gegn Veðurstofu registry / þekktum station IDs
- max stationIds, t.d. 40 eða 60
- max limitPerStation = 3 fyrir þetta endpoint
- enginn client-supplied `domain` eða `targetType`
- skila aðeins message preview sem núverandi public preview má skila

## Tillaga að áfanga A - `Gegnum Hólmavík` curated route

### A1. Bæta við route label og textum

Í `messages/is.json`:

```json
"routeOptionViaHolmavik": "Gegnum Hólmavík"
```

Í `messages/en.json`:

```json
"routeOptionViaHolmavik": "Via Hólmavík"
```

Í `components/weather/RouteSelectionStep.tsx`:

- bæta við label checki fyrir `CURATED_VIA_HOLMAVIK`
- setja það ofar en generic `routeOptionOther`
- ekki brjóta núverandi Hellisheiði/Hringurinn label röðun

### A2. Bæta við curated route rule

Í `lib/weather/google.server.ts`:

- skilgreina Vestfjarða destination bounds
- skilgreina `HOLMAVIK_VIA`
- bæta við route rule, t.d.

```ts
{
  id: 'westfjords-north-west-via-holmavik',
  logName: 'Vestfirðir / Hólmavík',
  origin: { bounds: [...] },
  destination: { bounds: [WESTFJORDS_NORTH_WEST_BOUNDS] },
  minFastestRouteDistanceM: 180_000,
  vias: [HOLMAVIK_VIA],
  labels: ['CURATED_VIA_HOLMAVIK'],
}
```

Athugasemd um origin:

- Fyrsta örugga útgáfa má miða við höfuðborgarsvæðið ef það er það flæði sem Stebbi er að prófa fyrst.
- Ef við viljum styðja fleiri upprunastaði þarf annað hvort breiðari origin bounds eða smá útvíkkun á matcher til að hægt sé að segja “destination í Vestfjörðum og origin ekki þegar á sömu Hólmavík/Ísafjarðarleið”.
- Ekki opna þetta of vítt án test cases.

### A3. Duplicate filter

Svipað og `shouldSkipCuratedHellisheidi`:

- skilgreina proximity threshold við Hólmavík, t.d. 5-10 km
- ef einhver base route fer nú þegar nálægt `HOLMAVIK_VIA`, sleppa curated Hólmavík route
- ef curated geometry er sama og existing route, núverandi `existingIds` grípur það líka

### A4. Tests

Bæta regression tests ef núverandi test structure leyfir:

- `RouteSelectionStep` birtir `Gegnum Hólmavík` fyrir `CURATED_VIA_HOLMAVIK`
- static/domain test fyrir `CURATED_VIA_HOLMAVIK` rule í `google.server.ts`
- duplicate-filter test ef helper er exportaður eða hægt að prófa án mikils refactors

## Tillaga að áfanga B - route-scoped Safnpúls

### B1. Finna station IDs og röð

Í `/vedrid` niðurstöðu eru Veðurstofustöðvar nú þegar tengdar leiðinni, m.a. í:

- `vedurstofanLayer.points`
- `vedurstofanAssessments`
- `providerOverlayPoints`

Safnpúls per leið á að nota sömu stöðvar og eru raunverulega á valdri leið.

Röðun:

1. Sorta eftir `routeFraction` ef til.
2. Annars eftir `distanceFromOriginM`.
3. Fallback: núverandi röð í `vedurstofanLayer.points`.

Deduplicate-a station IDs svo sama stöð komi ekki tvisvar.

### B2. Nýtt batch preview API eða server helper

Mælt:

```txt
POST /api/teskeid/weather/vedurpuls/route-preview
```

Input:

```ts
{
  stationIds: string[]
  limitPerStation?: 3
}
```

Output:

```ts
{
  stations: Array<{
    stationId: string
    messages: PreviewMessageDto[]
  }>
}
```

Athuga:

- Endpoint má ekki búa til threads.
- Endpoint má ekki krefjast innskráningar ef þetta er bara public preview, en má samt nota sömu public-safe fields og single-station preview.
- Ef `stationIds` inniheldur óþekkt ID, annað hvort sleppa því eða skila 400. Mæli með 400 í fyrstu útgáfu svo villur finnist.

Repository útfærsla:

- Best: helper sem finnur threads fyrir target IDs og sækir nýjustu þrjú messages per thread.
- Ef það er gert með loop server-side, setja strangt max stationIds svo það verði bounded.
- Ekki gera N client fetch frá UI.

### B3. UI component

Búa til route-scoped component, t.d.

```txt
components/weather/VedurstofanRoutePulseSummary.tsx
```

Props:

```ts
stations: Array<{
  stationId: string
  stationName: string
  routeFraction?: number | null
  distanceFromOriginM?: number | null
}>
returnTo?: string
```

Birting:

- staðsetning: undir `Mest krefjandi á leiðinni` spjaldinu
- title: `Safnpúls á leiðinni` eða `Nýjast frá stöðvum á leiðinni`
- fyrir hverja stöð í leiðarröð:
  - stöðvarheiti
  - nýjustu þrjár færslur
  - CTA: `Sjá fleiri skilaboð eða segja frá aðstæðum`
  - CTA fer á full pulse URL fyrir viðkomandi stationId með réttu `returnTo`

Ef engin skilaboð eru á neinni stöð:

- public: fela component alfarið, til samræmis við fyrri ákvörðun um tóma public pulse preview
- authenticated: má annað hvort fela component eða sýna mjög compact empty state með CTA á fyrstu/viðeigandi stöð. Ég myndi byrja á að fela til að halda niðurstöðunni hreinni, nema Stebbi vilji sérstaklega hvetja innskráða notendur til að skrifa á route-level.

### B4. Ekki rugla þessu saman við fullan Safnpúls

Núverandi `WeatherPulseFeed` í `/elta-vedrid` er global.

Route-scoped Safnpúls í `/vedrid` er ekki global og á ekki að sýna random stöðvar utan leiðarinnar.

Ef component/heiti verða endurnýtt:

- `WeatherPulseFeed` = global safnpúls í stöðvakönnun
- `VedurstofanRoutePulseSummary` = safnpúls fyrir valda ferðaleið

## Tillaga að sequencing

Mæli með að Claude Code taki þetta í tveimur PR-ish skrefum, eða tveimur litlum framkvæmdum:

1. `Gegnum Hólmavík` curated route
   - minna yfirborð
   - auðvelt að localhost-prófa með Reykjavík → Ísafjörður
   - þarf Google Routes API en engin SQL
2. Route-scoped Safnpúls
   - snertir chat API/repository og result UI
   - þarf meiri auth/public-preview yfirferð

Ef Stebbi vill taka bæði í sama skrefi má það, en þá þarf Claude Code að skila mjög skýru prerelease handoffi með tveimur aðskildum köflum.

## Próf sem Claude Code ætti að keyra

Lágmark eftir route breytingu:

```bash
npx tsc --noEmit
npx vitest run lib/__tests__/weather-public.test.ts
npx vitest run lib/__tests__/travelAuditMap.helpers.test.ts
```

Eftir pulse/API breytingu:

```bash
npx tsc --noEmit
npx vitest run lib/__tests__/vedurpuls-preview.test.ts
npx vitest run lib/__tests__/vedurpuls-feed.test.ts
npx vitest run lib/__tests__/vedurpuls-api.test.ts
```

Ef nýr batch endpoint/helper er bætt við, bæta við focused tests fyrir:

- validates station IDs
- max limit/station count
- groups messages per station
- public-safe response
- no thread creation

## Localhost checks for Stebbi

### A. Hólmavík route option

1. Opna `/vedrid`.
2. Velja `Reykjavík` sem frá.
3. Velja `Ísafjörður` sem til.
4. Bíða eftir leiðarmöguleikum.
5. Vænt:
   - Google default/fastest route sést eins og áður.
   - Auka leið birtist ef Google gaf ekki sjálft Hólmavík-leið.
   - Auka leið heitir `Gegnum Hólmavík`.
   - Kortið sýnir leið sem fer raunverulega um Hólmavík.
   - Leiðin er ekki duplicate ef Google base route fer nú þegar um Hólmavík.

Prófa líka:

- Reykjavík → Bolungarvík
- Reykjavík → Súðavík
- Reykjavík → Patreksfjörður eða annar staður sem ætti mögulega ekki að triggera regluna, til að passa að scope sé ekki of vítt
- Hólmavík → Ísafjörður, ef mögulegt, til að passa að við búum ekki til kjánalega duplicate route

### B. Safnpúls per ferðaleið

Setup:

- Veðurstofan þarf að vera sýnileg í niðurstöðu.
- Það þurfa að vera einhver púlsskilaboð á a.m.k. einni stöð sem lendir á leiðinni.

Skref:

1. Opna `/vedrid`.
2. Reikna leið með Veðurstofustöðvum.
3. Fara í niðurstöðu.
4. Skoða undir `Mest krefjandi á leiðinni`.

Vænt:

- Safnpúls birtist undir spjaldinu.
- Hann sýnir aðeins stöðvar á valdri leið.
- Stöðvar eru í leiðarröð frá brottfararstað til áfangastaðar.
- Hver stöð sýnir mest þrjú nýjustu skilaboð.
- CTA á stöð fer í fullan púls með réttu `returnTo`.
- Public notandi sér preview ef skilaboð eru til, en ekki tómt noise ef ekkert er til.
- Innskráður notandi getur farið í fullan púls og aftur í ferðalagið sitt án þess að missa route state.

### C. Regression checks

- `/auth-mvp/vedrid/elta-vedrid` global `Safnpúls` virkar áfram.
- Veðurstofuspjöldin sjálf sýna áfram inline pulse rétt.
- Public notandi fær ekki compose box.
- Authenticated notandi fær compose box þar sem við á.
- Route option loading og route result persistence brotnar ekki.

## Öryggi / gögn / kostnaður

- Engin SQL migration ætti að þurfa fyrir Hólmavík route.
- Safnpúls route-preview ætti ekki að þurfa SQL ef núverandi chat tables duga.
- Ekki veikja RLS.
- Ekki skila email, user id eða private metadata í public preview.
- Hólmavík curated route bætir við Google Routes API kalli aðeins þegar rule matchar. Það er beinn kostnaðar-/quota punktur, en scope er þröngt og líklega ásættanlegt.
- Ekki setja þetta á allar leiðir eða of vítt destination scope án mælingar.

## Óvissa / þarf að staðfesta

- Nákvæm `HOLMAVIK_VIA` hnit þarf að staðfesta sjónrænt á korti.
- Destination bounds fyrir “Vestfirðir norðar og vestar en Hólmavík” þarf product staðfestingu eftir fyrstu localhost prófanir.
- Það þarf að ákveða hvort route-scoped Safnpúls eigi að fela sig alveg þegar engin skilaboð eru til fyrir innskráða notendur líka. Codex mælir með að fela í fyrstu útgáfu til að halda niðurstöðu hreinni.

