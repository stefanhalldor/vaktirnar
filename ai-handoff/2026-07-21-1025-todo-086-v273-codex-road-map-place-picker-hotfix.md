# 2026-07-21 10:25 - todo-086 v273 - Codex Road Map Place Picker Hotfix

Created: 2026-07-21 10:25  
Timezone: Atlantic/Reykjavik

## Samþykki / umfang

Stebbi samþykkti að Codex mætti framkvæma lagfæringu á Road Intelligence dropdown/staðavali, bæta við helstu staðarheitum á kortið með framtíðarvali af korti í huga, og búa til handoff fyrir Claude Code.

Þetta fól í sér kóðabreytingar, testabreytingar og handoff-skrá í repo. Þetta fól ekki í sér commit, push, deploy, SQL/migration, Supabase/env/secrets eða production-breytingar.

## Plan áfangans

1. Rýna `v272` handoff frá Claude Code og núverandi `RoadMapPrototypeMap`.
2. Gera autocomplete ekki háð því að `/api/place/search` svari hratt eða að absolute dropdown haldist sýnilegur.
3. Bæta við provider-neutral staðalista yfir helstu íslenska staði fyrir local fallback.
4. Sýna helstu staðarheiti beint á MapLibre kortinu og gera þau smelltanleg inn í Frá/Til.
5. Prófa helpera og build.

## Hvað var gert

### Dropdown / autocomplete

- `fetchSuggestionsFor()` notar nú local staðalista strax þegar notandi hefur slegið inn 2+ stafi.
- Þegar `/api/place/search` svarar eru remote niðurstöður sameinaðar local fallback með dedupe.
- Ef remote leit er sein eða tóm á dropdown samt að birtast fyrir algeng staðarnöfn eins og `reykjavik`, `Akureyri`, `Egilsstadir`, `Borgarnes`.
- Dropdown er ekki lengur absolute layer undir inputinu. Hann er nú venjulegur in-flow listi undir virka reitnum, sem ætti að vera mun öruggara á mobile og inni í map overlay.

### Submit / route resolution

- `resolveBridgePlace()` notar nú local staðalista sem fallback áður en API-kall er reynt.
- Ef notandi slær beint inn stað úr staðalistanum og smellir `Reikna`, þá ætti route bridge að geta notað lat/lon úr staðalistanum þó að dropdown hafi ekki verið valið.
- Google/Places search er áfram notað þegar það skilar niðurstöðum; local listinn er aðeins öryggislag fyrir helstu staði og prototype-flow.

### Staðarheiti á korti

- Bætt við MapLibre HTML markers fyrir `ROAD_MAP_PLACES`.
- Merkin eru smelltanleg:
  - fyrsta smell/virkur `Frá` reitur fyllir `Frá`
  - eftir það færist active target í `Til`
  - ef `Til` er virkur fyllir smellur `Til`
- Þetta er fyrsta future-proof skrefið í átt að því að velja stað beint af kortinu.
- Notaði HTML markers frekar en MapLibre symbol/text layer vegna þess að núverandi raster/inline style er ekki með tryggt `glyphs` setup. Þetta forðar nýju blank/text-layer vandamáli í þessum prototype.

### Staðalisti

- Bætt við/staðfest `lib/road-intelligence/roadMapPlaces.ts` með helstu stöðum og helpers:
  - `ROAD_MAP_PLACES`
  - `findRoadMapPlaceSuggestions()`
  - `mergePlaceSuggestions()`
- Staðir eru importance-flokkaðir svo kortið sýnir stærstu/helstu staði fyrr og bætir fleiri við þegar zoomað er inn.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/2026-07-21-1010-todo-086-v272-claude-autocomplete-focus-debug.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/road-intelligence/placeSearchBridge.ts`
- `lib/__tests__/road-intelligence-place-search-bridge.test.ts`
- `package.json`

## Skrár breyttar / bættar við

- `components/weather/RoadMapPrototypeMap.tsx`
  - local suggestions tengd inn í autocomplete
  - in-flow suggestion listi í stað absolute dropdown
  - active `Frá`/`Til` state fyrir kortasmelli
  - MapLibre HTML place labels sem fylla Frá/Til
  - cleanup fyrir place markers
- `lib/road-intelligence/roadMapPlaces.ts`
  - staðalisti + suggestion/merge helpers
  - ath: skráin var untracked í vinnutrénu þegar lokarýni var gerð, þannig að hún er hluti af ócommittaða Road Intelligence pakkanum
- `lib/__tests__/road-intelligence-road-map-places.test.ts`
  - unit-próf fyrir accent-insensitive leit, Borgarnes, dedupe og hnitaforsendur
- `ai-handoff/2026-07-21-1025-todo-086-v273-codex-road-map-place-picker-hotfix.md`
  - þessi handoff skrá

## Skipanir keyrðar

- `npm run test:run -- lib/__tests__/road-intelligence-place-search-bridge.test.ts lib/__tests__/road-intelligence-road-map-places.test.ts lib/__tests__/road-intelligence-travel-bridge-map-data.test.ts`
  - Exit code: 0
  - 3 test files passed, 12 tests passed
- `npm run type-check`
  - Exit code: 0
- `npm run build`
  - Exit code: 0
  - Build grænn
  - Fyrirliggjandi lint warnings birtust í öðrum skrám, ekki ný warning úr `RoadMapPrototypeMap.tsx`

## Hvað mistókst / var sleppt

- Codex prófaði ekki í browser, því Stebbi keyrir localhost/dev server sjálfur.
- Engin screenshot/browser automation var keyrð.
- Ekki var reynt að gera fullkominn staðagagnagrunn eða authoritative geocoding replacement.
- Ekki var breytt Google Places API, travel API contract, Supabase eða feature flags.
- Ekki var gert production-ready collision avoidance fyrir place labels; þetta er prototype-lag sem þarf mobile sjónrýni.

## Ákvarðanir Codex

- Local fallback kemur fyrst fyrir algeng staðarnöfn til að leysa núverandi nothæfisvanda strax.
- Remote `/api/place/search` er samt áfram notað og fær forgang í sameinuðum niðurstöðum þegar það svarar.
- HTML markers voru valin fyrir staðarheiti til að forðast MapLibre glyph/text-layer flækju í þessu skrefi.
- Dropdown var færður í document flow svo hann sé augljós og erfitt sé að fela hann óvart á bak við map/container stacking.

## Áhætta / þarf að rýna

- `ROAD_MAP_PLACES` er hand-curated listi með handsettum hnitum. Claude Code ætti að rýna hvort mikilvægustu staðir vanti og hvort hnit séu nógu góð fyrir prototype.
- Place labels geta orðið þétt á sumum zoom-stigum. Sérstaklega þarf að prófa 390-546 px mobile breidd.
- Kortasmellur velur alltaf active field. Þetta er einfalt og future-proof, en gæti þurft skýrari visual state síðar.
- Local fallback notar lat/lon án `placeId`, sem er rétt fyrir núverandi `/api/teskeid/weather/travel` contract, en Google route provider hegðun með coordinate waypoints þarf að sannreyna í browser.

## Route Intelligence Check

- Snertir: M3A route bridge á `/auth-mvp/vedrid/road-map-prototype`, Frá/Til staðaval, og fyrstu skref í kortvali.
- Ný þekking á heima í `lib/road-intelligence/roadMapPlaces.ts` sem prototype-kjarni fyrir kortastaði, ekki í Google-specific layer.
- Lausnin er að mestu provider-neutral: local staðir eru eigin Teskeiðar fallback; Google Places er áfram notað sem provider/fallback.
- Ekki var bætt við canonical road segment, caution eða station matching reglu í þessum áfanga.
- Privacy: engin notendagögn, engin leiðarsaga, engin raw Google geometry og engin Supabase skrif.
- Google Places er aðeins kallað ephemeral í client/API flow; local fallback vistar ekki Google niðurstöður.
- `IcelandRoadmap.md` var lesið. Það var ekki uppfært þar sem þetta er prototype UI/input fallback, ekki ný route-family eða canonical segment regla.

## Design Check

- `Design.md` var lesið.
- Breytingin heldur mobile-first formi, 16 px input texta og touch-friendly suggestion rows (`min-h-10`).
- Dropdown er nú in-flow til að minnka hættu á overflow/overlap/focus rugli.
- Engir nýir þýðanlegir UI-textar voru hardcode-aðir; staðarheiti eru domain data.
- Place labels eru lítil og hagnýt, ekki decorative UI.

## Tillaga að næsta skrefi

1. Claude Code rýni þetta sem hotfix með áherslu á:
   - hvort local fallback sé nógu öruggur
   - hvort marker cleanup/listeners séu í lagi
   - hvort place labels séu of þétt á mobile
2. Stebbi prófi localhost checkin hér að neðan.
3. Ef þetta virkar: næsta stóra skref er að bæta `departure time` og `trailerKind` inn í Road Map route bridge, þannig að nýi grunnurinn nálgist núverandi `/ferdalagid` ferðaveðurreikning.

## Spurningar fyrir Claude Code

- Er betra að færa `ROAD_MAP_PLACES` yfir í `lib/iceland-routes/` síðar, eða halda því í `lib/road-intelligence/` meðan þetta er aðeins prototype UI?
- Er importance-sýnileiki markeranna réttur: importance 3 alltaf, importance 2 frá zoom 5.8, importance 1 frá zoom 7.2?
- Á að bæta við visual active state fyrir hvort næsti kortasmellur fylli `Frá` eða `Til`?
- Vantar augljósa staði í fyrsta listann, sérstaklega á Vestfjörðum, Norðurlandi og Austurlandi?

## Supabase / SQL / auth / production

- Engin SQL-skrá var skrifuð eða keyrð.
- Engin Supabase tafla, policy, RLS, grant eða function breytt.
- Engin auth breyting.
- Engin env/secrets breyting.
- Enginn commit, push eða deploy.
- Production gögn og notendagögn voru ekki snert.

## Localhost checks for Stebbi

Setup:
- Dev server er hjá Stebba, t.d. `http://localhost:3004`.
- Opna sem innskráður notandi með `road-intelligence-v1` feature access.
- Slóð: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Próf 1: Dropdown birtist strax
1. Smella í `Frá`.
2. Slá inn `reyk`.
3. Vænt: listi birtist strax undir reitnum með `Reykjavík`.
4. Velja `Reykjavík`.
5. Smella í `Til`.
6. Slá inn `Borgarnes`, `Akureyri` eða `Egilsstadir`.
7. Vænt: local niðurstöður birtast strax, óháð því hvort Network tab sýnir sein `/api/place/search` köll.

Próf 2: Reikna án þess að velja úr dropdown
1. Slá beint `Reykjavik` í `Frá`.
2. Slá beint `Akureyri` í `Til`.
3. Smella `Reikna`.
4. Vænt: leiðarteikning og ferðasamantekt birtist. Ekki á að koma `Fann ekki annan staðinn`.

Próf 3: Velja af korti
1. Hreinsa leið.
2. Smella á staðarheitið `Reykjavík` á kortinu.
3. Vænt: `Frá` fyllist með `Reykjavík`.
4. Smella á `Akureyri` eða `Borgarnes` á kortinu.
5. Vænt: `Til` fyllist.
6. Smella `Reikna`.

Próf 4: Map regression
1. Pan/zoom á kortinu.
2. Prófa `Fela vegakerfi` og `Fela vegferð`.
3. Smella á Vegagerðarstöð og vegkafla.
4. Vænt: popup og overlays virka áfram, engin blank map regression.

Mobile/regression sem þarf sérstaklega að horfa á:
- Enginn láréttur overflow á 390-546 px breidd.
- Dropdown/listi fer ekki undir lyklaborð þannig að hann verði ónothæfur.
- Place labels mega ekki yfirgnæfa stöðva/vega punkta.
- Ef label clutter er of mikið, lækka importance 2/1 visibility thresholds eða fækka listanum fyrir fyrsta prototype.
