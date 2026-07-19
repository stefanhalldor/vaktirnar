# 2026-07-19 06:38 - TODO 086 v542 - Codex handoff: route-memory map picker fyrir /vedrid

Created: 2026-07-19 06:38
Timezone: Atlantic/Reykjavik

Related:

- `2026-07-19-0614-todo-086-v540-claude-v539-done-prerelease`
- `2026-07-19-0623-todo-086-v541-codex-v540-review-and-next-handoff`
- `2026-07-18-2350-todo-086-v527-claude-v525v526-done-prerelease`
- `IcelandRoadmap.md`

---

## Mannamálsmarkmið

Stebbi vill færa `/vedrid` frá því að vera fyrst og fremst textabox-innsláttur yfir í kortadrifið route-memory val:

1. Notandi sér hvaða `Frá` staðir eru til í route-memory.
2. Notandi velur `Frá` stað á korti eða úr skýrum lista.
3. Þá birtast bara þeir `Til` staðir sem eru raunverulega til frá þessum `Frá` stað.
4. Þegar `Frá` og `Til` eru valin, filterar `/vedrid` kortið niður á nákvæmlega þær Veðurstofu- og Vegagerðarstöðvar sem `/ferdalagid` hefur áður vistað fyrir þá leið.
5. Ef notandi vill nákvæma brottfararútreikninga, þá fer hann áfram í `Ferðalagið`.

Þetta er miklu betra product-flow en að notandi þurfi að handvelja úr textaboxi án þess að vita hvaða leiðir eru til í cache.

---

## Stebbi copy / upplifun

Setja texta ofan við núverandi `Frá` svæði, eða í sama info/control box og vindmörkin:

> Teskeið.is getur hjálpað þér að áætla hvenær best sé að leggja af stað miðað við spágögn Veðurstofunnar og met.no (Yr) ásamt nústöðu veðurstöðva Vegagerðarinnar.

Síðan:

- Spurning: `Hvaðan ertu að fara?`
- Aðgerð: `Nota núverandi staðsetningu`
- Þegar `Frá` er valið:
  - Spurning: `Hvert ertu að fara?`
  - Sýna bara destination staði sem eru til í route-memory frá völdum `Frá`.
- Neðst:
  - Texti ca.: `Til að reikna nákvæmt ferðalag sem tekur mið af því hvar þú ert á hverjum stað á leiðinni skaltu nota Ferðalagið.`
  - CTA: `Ferðalagið`

Allur texti á að fara í `messages/is.json` og `messages/en.json`, ekki hardcode.

---

## Product-afstaða

Þetta á að vera **cache/route-memory first**, ekki Google Routes first.

`/vedrid` er stóra yfirlitsmyndin. Þar þarf ekki að reikna nýja Google route þegar notandi er bara að skoða stöðu landsins eða algengar leiðir. Ef leið er ekki til í route-memory, á UI að segja það skýrt og bjóða notanda að reikna hana í `Ferðalagið`.

Þetta gefur Stebba líka gott workflow:

1. Búa til helstu leiðir í `/ferdalagid`.
2. Route-memory vistar provider station sets.
3. `/vedrid` route-picker sýnir þær leiðir strax.
4. Stebbi getur prófað kortið og byggt upp helstu leiðirnar með raunverulegri notkun.

---

## Skýrt scope fyrir Claude Code

Þetta handoff er **framhaldsplan**, ekki deployment- eða migration-leyfi.

Claude Code má framkvæma þetta aðeins ef Stebbi sendir þetta með `Workflow` og engar blocking spurningar vakna.

Þetta má fela í sér kóðabreytingar og að skrifa/breyta migration-skrá ef handoffið krefst þess.

Þetta felur ekki í sér:

- að keyra SQL/migration
- commit
- push
- deploy
- Vercel/env breytingar
- production data breytingar

---

## Implementation proposal

### 1. Route-memory aggregate endpoints

Byggja ofan á `sql/86_weather_route_memory.sql` route-memory módelið.

Ný eða útvíkkuð endpoints:

- `GET /api/teskeid/weather/route-memory/places`
  - skilar normalized `from` stöðum sem eiga route-memory records
  - label, key, canonical coords ef til, count, latest_used_at
- `GET /api/teskeid/weather/route-memory/destinations?from=...`
  - skilar `to` stöðum sem eru til frá völdum `from`
  - label, key, canonical coords ef til, count, latest_used_at
- núverandi lookup heldur áfram:
  - `POST /api/teskeid/weather/route-memory/lookup`
  - skilar exact station IDs fyrir valið from/to/variant

Ef gagnamagn er lítið má hafa eitt endpoint sem skilar route-memory graphinu í einu, en API contract á að vera provider-neutral og ekki binda UI við SQL shape.

### 2. Canonical place registry

Búa til eða útvíkka `lib/iceland-routes/routePlaces.ts` eða sambærilega skrá:

- `placeKey`
- display label
- aliases
- approximate public coords
- optional region

Mikilvægt: ekki geyma raw heimilisföng eða private from/to texta. Route-memory á að byggja á normalized public-ish place keys eins og `reykjavik`, `akureyri`, `gardabaer`, `isafjordur`, ekki `Melás 8`.

### 3. Map-based Frá/Til picker component

Extract-a reusable component, ekki sérlausn inni í `WeatherOverviewClient`:

Tillaga:

- `components/weather/RouteMemoryMapPicker.tsx`

Eða, ef hún á að verða víðari:

- `components/iceland-routes/RouteMemoryMapPicker.tsx`

Props hugmynd:

```ts
type RouteMemoryMapPickerProps = {
  fromPlaces: RouteMemoryPlace[];
  destinations: RouteMemoryPlace[];
  selectedFromKey?: string;
  selectedToKey?: string;
  onSelectFrom: (placeKey: string) => void;
  onSelectTo: (placeKey: string) => void;
  onUseCurrentLocation?: () => void;
  loading?: boolean;
  emptyState?: React.ReactNode;
};
```

Mynstur:

- Fyrst sýna `Hvaðan ertu að fara?`
- Kort/listi yfir available `Frá`.
- `Nota núverandi staðsetningu` reynir browser geolocation.
- Ef geolocation tekst:
  - finna næsta canonical route-memory `from` stað eða sýna 2-5 nálæga staði til staðfestingar
  - ekki velja nákvæm heimilishnit sem route-memory key
- Þegar `Frá` er valið:
  - sýna `Hvert ertu að fara?`
  - kort/listi yfir valid `Til` staði
- Þegar bæði eru valin:
  - kalla route-memory lookup
  - filtera main overview map niður á exact station IDs

### 4. UX state rules

- Áður en `Frá` er valið: sýna landsyfirlit með default filters.
- Eftir `Frá` val: route picker sýnir bara valid destinations.
- Eftir `Frá` + `Til`: main map sýnir exact provider stations úr route-memory.
- Ef route-memory miss:
  - ekki falla aftur í 1km/corridor gisk nema það sé merkt sem "bráðabirgðaniðurstaða"
  - betra: sýna empty state og CTA í `Ferðalagið`
- Ef route hefur fleiri variants:
  - v1 má velja nýjustu variant
  - en UI/contract þarf að varðveita variant möguleikann svo næsta skref geti sýnt t.d. `Gegnum Hólmavík`, `Til að sleppa við Öxi`

### 5. Directionality

Claude Code þarf að taka skýra afstöðu í handoff:

- Discovery UI má sýna reverse route sem mögulega leið ef station-set er til í hina áttina.
- En exact route-memory lookup á ekki að þykjast vita station order ef bara reverse route er til.
- Fyrir `/vedrid` yfirlit gæti station-set union í reverse átt verið ásættanlegt v1, því `/vedrid` er ekki brottfarartíma-útreikningur.
- Fyrir `/ferdalagid` þarf áfram direction-specific niðurstöðu.

Tillaga v1:

- `/vedrid` route picker má sýna reverse routes sem `tiltækar úr gagnagrunni`, en merkja internal source.
- Ef bara reverse exists: nota station IDs sem unordered overview-set, ekki route-order.

### 6. Current location

`Nota núverandi staðsetningu` má ekki kalla Google.

V1:

- Browser geolocation fær lat/lon með leyfi notanda.
- Client/server finnur næsta canonical route-memory place út frá okkar eigin place registry.
- Ef næsti staður er ekki öruggur, sýna lista: `Veldu næsta stað`.

Privacy:

- ekki vista raw geolocation
- ekki senda raw location í route-memory write
- aðeins nota til að velja public normalized place key

### 7. Design.md check

Þetta snertir layout, map UI, inputs, navigation og mobile.

Fylgja þarf sérstaklega:

- mobile-first 360/390/460 px
- enginn láréttur overflow
- input text minnst 16 px
- touch targets minnst 40x40 px
- loader/pending state þegar destinations eða lookup sækjast
- ekki setja kort inni í kort að óþörfu
- CTA `Ferðalagið` má vera sýnilegur en ekki ýta meginupplifun út af skjánum

### 8. IcelandRoadmap update

Uppfæra `IcelandRoadmap.md` R4/R5:

- route-memory graph verður grunnur fyrir `/vedrid` map picker
- `/vedrid` notar ekki Google-kall til að velja leið í overview mode
- `/ferdalagid` heldur áfram að vera authoritative source fyrir exact station sets
- þetta er transitional leið þar til eigið routing prototype í R6 verður tilbúið

Route Intelligence Check:

- Snertir route-memory, overview map, route families, station matching, place normalization.
- Ný þekking á heima í `lib/iceland-routes/` og `IcelandRoadmap.md`.
- Lausnin á að vera provider-neutral.
- Ekki geyma raw Google route geometry eða private addresses.

---

## Suggested implementation order

1. Klára v541/v540 hardening fyrst:
   - atomic route-memory write
   - provider 0-station replacement
   - route variant key
   - provider gating
   - tests

2. Bæta aggregate read endpoints:
   - route-memory places
   - destinations for selected from
   - tests for auth/gating/empty DB

3. Bæta canonical place coords registry:
   - byrja lítið með staðina sem Stebbi prófar fyrst
   - Reykjavík, Akureyri, Ísafjörður, Höfn, Egilsstaðir, Þorlákshöfn, Vík, Hella, Garðabær

4. Útfæra `RouteMemoryMapPicker` component:
   - fyrst listi + simple map markers ef map reuse er einfalt
   - ekki flækja í fancy dual-map fyrr en data contract er stöðugt

5. Tengja við `/vedrid`:
   - ef no route-memory data: fallback í current country overview
   - ef from selected: destination picker
   - ef from+to selected: exact station filter

6. Bæta current-location:
   - browser geolocation
   - nearest canonical place suggestions
   - no persistence of raw location

7. Localhost polish:
   - mobile layout
   - empty states
   - route-memory populated vs empty
   - no Google request in `/vedrid` route picker

---

## Migration guidance

Þetta byggir á `sql/86_weather_route_memory.sql`.

Ekki keyra migration sjálfkrafa.

Stebbi þarf að keyra 86 sérstaklega áður en route-memory graph getur haft raunveruleg production gögn.

Ef Claude Code þarf að breyta 86 vegna aggregate endpoints eða missing indexes:

- skrifa migration eða leiðrétta ókeyrða migration ef hún hefur ekki farið í production
- útskýra nákvæmlega hvað breytist
- ekki keyra SQL
- taka fram áhrif á RLS/grants/auth/production

`82`, `83`, `84` eru tengdar öðrum verkum en ekki forsenda fyrir map picker nema Claude Code sjái sérstaka ástæðu.

`85` er áfram DRAFT / DO NOT RUN.

---

## Localhost checks for Stebbi

Áður en SQL 86 er keyrt:

1. Opna `/vedrid`.
2. Expected: route picker sýnir graceful empty state eða segir að engar vistaðar leiðir séu til.
3. Country overview map á að halda áfram að virka.
4. Engin Google route request á að fara af stað bara við að opna `/vedrid`.

Eftir að Stebbi keyrir 86 með sérstöku leyfi:

1. Opna `/vedrid/ferdalagid`.
2. Reikna 2-3 leiðir, t.d.:
   - Reykjavík -> Akureyri
   - Reykjavík -> Ísafjörður
   - Höfn -> Egilsstaðir
3. Fara á `/vedrid`.
4. Expected:
   - `Hvaðan ertu að fara?` sýnir þessa from staði.
   - Þegar Reykjavík er valin birtast Akureyri/Ísafjörður sem destinations ef þær voru reiknaðar.
   - Þegar route er valin sýnir kortið bara exact station set sem `/ferdalagid` vistaði.
   - Ekki birtast allar landsstöðvar ef route er active.
5. Prófa public og innskráðan notanda:
   - public má sjá route-memory overview ef provider access leyfir
   - provider sem er gated má ekki leka station IDs eða details

Current location:

1. Smella `Nota núverandi staðsetningu`.
2. Leyfa location.
3. Expected: appið stingur upp á nálægum canonical stað, ekki raw heimilisfangi.
4. Hafna location.
5. Expected: skýr friendly fallback, engin villa eða blank state.

Mobile:

1. Prófa 390px og 460px.
2. Opna keyboard í Frá/Til leit ef text input er enn til staðar sem fallback.
3. Expected: enginn mobile zoom, ekkert horizontal overflow, map/list controls aðgengileg.

---

## Open questions for Claude Code

1. Er best að hafa route-memory graph endpoint eitt stórt payload eða tvö skref (`places` + `destinations`)?
2. Hvar er besti núverandi map component til að endurnýta fyrir small place-picker markers?
3. Eigum við að sýna reverse routes sem valid overview v1 eða krefjast direction-specific hit?
4. Getur geolocation verið client-only með local nearest-place match, eða þarf server endpoint fyrir canonical place suggestion?
5. Þarf SQL 86 index fyrir `from_place_key`, `to_place_key`, `latest_used_at` til að aggregate endpoint verði hratt?

---

## Codex mat

Þessi upplifun hljómar sterkari en textabox-first leiðin.

Ástæðan er að hún gerir það sýnilegt hvaða leiðir Teskeið "þekkir" nú þegar, leiðir Stebba og notendur inn í að byggja route-memory gagnagrunninn smám saman, og heldur `/vedrid` sem stóra yfirlitskortinu án þess að kalla óþarflega í Google.

Mikilvægasta tæknilega reglan: ekki byggja þetta sem nýja sérlausn inni í `/vedrid`. Þetta á að vera reusable route-memory picker sem notar `lib/iceland-routes/` og getur seinna nýst í fleiru en Veðrinu.

