# TODO-091 v084 — versti og handvalinn punktur endurvirkjaður

**Created:** 2026-07-26 22:53
**Timezone:** Atlantic/Reykjavik
**Tengist:** TODO-091 — Akstur og leiðarveður
**Byggir á:** v005 og production-regressioni úr commit `5b16a0b`

## Skilningur á samþykki

Stebbi gaf Codex framkvæmdarleyfi til að endurvirkja hegðunina þar sem versti
veðurpunktur virkrar leiðar er sjálfvalinn, auðkenndur á kortinu og sýndur í
spjaldi beint undir kortinu. Punktur sem notandi velur á kortinu á að taka við
sama spjaldi. Leiðar- eða tímabreyting á að reikna og velja versta punktinn á
ný.

Samþykkið fól í sér afmarkaðar kóða- og prófabreytingar. Það fól ekki í sér
commit, push, deploy, Supabase-, Vercel-, migration-, env- eða
production-breytingar.

## Niðurstaða

Hegðunin er endurvirkjuð. Þetta var staðfest regression, ekki ný feature-lógík:

- commit `1ad86ed` innleiddi upphaflega default worst → manual override;
- commit `5b16a0b` missti fallback-spjaldið og selected-marker state þegar SVG
  mini-korti var skipt út fyrir sameiginlegt MapLibre `DriveRouteMap`;
- núverandi worst-ranking var enn rétt og var endurnýtt óbreytt.

Nú gildir:

1. Versti punkturinn er sjálfvalinn og fulla spjaldið birtist undir kortinu.
2. Sami punktur er stærri og með fíngerðan valhring á kortinu; marker-button
   notar einnig `aria-pressed`.
3. Smellur á annan punkt skiptir spjaldinu yfir í `Valin veðurspá`.
4. `Fara á versta punkt` endurstillir handvalið.
5. Nýr brottfarartími eða ný raunverulega reiknuð leið hreinsar handval og
   velur nýjan versta punkt. Gamalt val lifnar ekki aftur þegar farið er fram
   og til baka.
6. Preview á annarri leið hreinsar ekki valið fyrr en ný leið hefur í raun
   verið reiknuð.
7. Status-filterar halda fyrri hegðun: falinn punktur felur marker/spjald og
   sama val kemur aftur ef statusinn er gerður sýnilegur án route/time skipta.

## Skrár breyttar

- `components/weather/DriveJourneyPanel.tsx`
  - default worst fallback og dynamic worst/manual spjald;
  - manual selection bundið við calculation + departure context;
  - context-breyting hreinsar stale handval;
  - `Fara á versta punkt` endurvirkjað;
  - effective punktur sendur sem selected marker í kortið.
- `components/weather/DriveRouteMap.tsx`
  - optional `selectedStationId`;
  - marker visual/`aria-pressed` uppfært in-place með ref/effect;
  - selection er ekki í `stationStructureKey`, svo kortið endurbyggist,
    endurmiðjast eða `fitBounds`-ast ekki við punktasmell.
- `components/weather/RoadMapPrototypeMap.tsx`
  - calculation identity (`routeTravelResult.id`) send sem route context;
  - preview route choice er viljandi ekki notað sem reset-context.
- `lib/__tests__/drive-journey-panel-ui.test.tsx`
  - ný interaction-regression próf.

Fyrirliggjandi `.obsidian/workspace.json` breyting Stebba var ekki snert og á
ekki að fylgja þessum pakka nema Stebbi ákveði sérstaklega annað.

## Prófanir og skipanir

1. `npm run test:run -- lib/__tests__/drive-journey-panel.test.ts lib/__tests__/drive-journey-panel-ui.test.tsx lib/__tests__/route-comparison-mini-map.test.tsx`
   - Exit code 0.
   - 3 test files passed, 14 tests passed.
2. `npm run type-check`
   - Exit code 0.
3. `git diff --check`
   - Exit code 0.
   - Aðeins fyrirliggjandi Windows line-ending warnings.
4. `npm.cmd run lint -- --file components/weather/DriveJourneyPanel.tsx --file components/weather/DriveRouteMap.tsx --file components/weather/RoadMapPrototypeMap.tsx --file lib/__tests__/drive-journey-panel-ui.test.tsx`
   - Exit code 0.
   - Aðeins eldri, ótengdar hook-dependency warnings í
     `RoadMapPrototypeMap.tsx`.

Nýju interaction-prófin staðfesta:

- versti punktur og kortaval sjálfgefið;
- handvirkt override og endurstilling á versta punkt;
- raunverulega breyttan versta punkt milli brottfarartíma;
- tíma-round-trip án þess að gamalt handval lifni aftur;
- route-round-trip með sömu station IDs án stale handvals.

Full test-suite og production build voru viljandi ekki endurtekin fyrir þessa
litlu UI-lagfæringu, samkvæmt ósk Stebba um að keyra stóra pakkann aðeins við
næstu lokaútgáfu.

## Það sem mistókst eða var sleppt

- Fyrsta sameinaða `apply_patch` tilraun fann ekki eitt context í
  `DriveRouteMap.tsx`; hún var atomic og gerði engar hlutabreytingar. Patchið
  var síðan sett inn í afmörkuðum skrefum.
- Fyrsta lint-skipun með `npm` rakst á PowerShell execution policy. Sama
  read-only lint var keyrt með `npm.cmd` og lauk grænt.
- Raunverulegt MapLibre marker-útlit er ekki renderað í jsdom-prófinu;
  component-prófið sannar selected-ID flæðið og browser-smoke staðfestir
  stærð/hring sjónrænt.

## Design.md samræmi

- Núverandi canonical `VedurstofanPointCard` er endurnýtt; ekkert nýtt nested
  card-mynstur var búið til.
- Engin breidd, input, navigation eða scroll-uppbygging breyttist.
- Val er sýnt með stærð/hring og `aria-pressed`, ekki aðeins lit.
- Marker uppfærist án map teardown eða zoom/fitBounds hops.
- `Fara á versta punkt` heldur minnst 40 px hæð og focus-visible state.
- Engir nýir notendatextar voru hardcode-aðir; núverandi is/en lyklar nægðu.

## Route intelligence check

- Breytingin á við allar virkar leiðir og route-families; engin sérleið eða
  nýr vegkafli var skilgreindur.
- Hún endurnýtir provider-neutral route order, ETA, threshold og station
  assessments sem eru þegar til.
- Engin ný provider-binding, canonical segment, control point, caution,
  cache-lykill eða fixture-gagnalind var nauðsynleg.
- Engin route- eða notendagögn eru vistuð. `IcelandRoadmap.md` þarf því ekki
  uppfærslu fyrir þessa UI-endurvirkjun.

## Localhost checks for Stebbi

Eitt stutt smoke nægir:

1. Opna núverandi localhost `/vedrid` eða `/auth-mvp/vedrid` og reikna leið
   sem hefur fleiri en einn Veðurstofupunkt.
2. Scrolla að litla leiðarkortinu.
3. Vænt: versti punkturinn er stærri/með hring og spjaldið beint undir kortinu
   heitir `Versti punkturinn`.
4. Smella á annan punkt.
5. Vænt: auðkenning og sama spjald færist yfir í punktinn, titillinn verður
   `Valin veðurspá` og `Fara á versta punkt` birtist.
6. Smella `Fara á versta punkt`, velja svo annan punkt, skipta um
   brottfarartíma og fara aftur á fyrri tíma.
7. Vænt: versti punkturinn er reiknaður/valinn að nýju og gamla handvalið
   lifnar ekki aftur. Kortið má ekki hoppa, endurzoom-a eða valda láréttu
   overflowi á mobile.

Engin Supabase-, auth-, secrets-, billing- eða production-aðgerð fylgir þessu
smoke-prófi. Stebbi keyrir dev serverinn sjálfur.

## Eftirstandandi áhætta

- Browser-smoke þarf að staðfesta að 18 px selected-marker og hringurinn séu
  nægilega sýnilegir á raunverulegu MapLibre-korti.
- Punktur án lat/lon getur áfram fengið detail-spjald en ekki marker á korti;
  þetta er núverandi data-contract edge case og var ekki víkkað í þessari
  breytingu.

## Hvað var ekki gert

- Ekkert commit, push eða deploy.
- Engar messages-, API-, SQL-, Supabase-, Vercel- eða env-breytingar.
- Dev server var ekki ræstur eða endurræstur.

**Confidence:** Hátt. Bæði upphaflega regressionið og tvö stale-context
jaðartilvik fundust, voru lagfærð og eru nú varin með markvissum prófum.
