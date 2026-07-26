# TODO 090 — Route switch scrubber and comparison follow-up

Created: 2026-07-26 11:57
Timezone: Atlantic/Reykjavik
Agent: Codex
Previous handoff: `2026-07-26-1131-todo-090-v013-codex-strict-per-user-routing-implementation.md`

## Skilningur á samþykki

Stebbi samþykkti að Codex lagfærði leiðaskipti þannig að brottfarartímascrubber byggist upp fyrir nýju leiðina, gerði samanburðarliti skýrari, takmarkaði „besta veðrið“ við eina leið nema nákvæmlega sömu veðurstöðvar liggi undir og sýndi nákvæmt heiti preview- og útreikningsleiðar í skýringartexta.

Þetta fól í sér kóða- og prófabreytingar. Það fól ekki í sér commit, push, deploy, env-breytingu, SQL-keyrslu, Supabase-breytingu eða production-breytingu. Ekkert slíkt var framkvæmt.

## 1. Plan áfangans

1. Rekja hvers vegna scrubber hvarf eftir „Skoða veðurskilyrði fyrir þessa leið“.
2. Binda tilbúið forecast-state við nákvæmlega það route-context sem það var byggt fyrir.
3. Gera leiðalitina greinilegri og „besta veðrið“ deterministic.
4. Sýna provider-númer og raunverulegt leiðarheiti í preview-skýringunni.
5. Bæta við regression-prófum, keyra TypeScript-check og heildarprófasafn.

## 2. Hvað var raunverulega gert

- Orsökin að scrubber-villunni var stale React closure/state eftir leiðaskipti. Gamlar `routeCandidates` og `routeSlotStatusOverrides` gátu látið builderinn telja forecast nýju leiðarinnar tilbúið þótt state-ið tilheyrði fyrri leið.
- Bætt var við identity-tengdu build-contexti. Forecast er aðeins endurnýtt ef completed context er sami object-generation og virka contextið. Ný leið fær nýtt context og byggir því alltaf sína eigin tímalínu.
- Completed context er skráð í öllum þremur successful build-pathum, einnig þegar provider-overrides eru ekki tiltæk og native timeline er notuð.
- Dauður kóði í reset-fallinu, sem athugaði ref strax eftir að hann var settur í `null`, var fjarlægður.
- Leiðalitir nota nú há-contrast röð: blátt, appelsínugult, teal, magenta, ólífugrænt og rautt.
- „Besta veðrið ef lagt er af stað núna“ fer á fyrsta route með lægsta score. Jöfn leið fær einnig merkið aðeins ef score og normaliserað station-ID mengi eru nákvæmlega eins.
- Preview-skýringin notar nú provider-númer og raunverulegt route-heiti, t.d. `Google-leið 2 (Djúpurvegur/Leið 61)`, bæði fyrir leiðina á kortinu og leiðina sem núverandi veðurútreikningur miðast við.
- Notendatextinn sjálfur var þegar í `messages/is.json` og `messages/en.json`; enginn nýr hardcoded þýðanlegur texti var settur í component.

## 3. Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md` (núverandi route-grunnsamhengi úr v013)
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteComparisonMiniMap.tsx`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `messages/is.json`
- `messages/en.json`
- Tiltæk veður-/route-próf undir `lib/__tests__/`

## 4. Skrár sem voru breyttar í þessum follow-up

- `components/weather/RoadMapPrototypeMap.tsx`
  - route-generation-aware forecast reuse
  - dynamic nákvæmt preview/applied route-heiti
- `components/weather/RouteComparisonMiniMap.tsx`
  - skýrari litapalletta
  - deterministic best-weather selection eftir station mengi
- `lib/__tests__/route-comparison-mini-map.test.tsx`
  - litir og best-weather tie-reglur
- `lib/__tests__/road-map-route-forecast.test.ts`
  - ný regression-próf fyrir route-context reuse og nákvæmt provider/route-heiti

Athugið að vinnslutréð inniheldur fleiri ócommittaðar breytingar frá fyrri TODO 090 áföngum. Þær voru varðveittar og ekki afturkallaðar.

## 5. Skipanir sem voru keyrðar

- Read-only `Get-Content` og `rg` til að rekja state, render-skilyrði, þýðingar og próf.
- `git status --short` og `git diff --check` til stöðumats og whitespace-athugunar.
- `npm run test:run -- lib/__tests__/road-map-route-forecast.test.ts`
  - exit 0, 1/1 próf stóðst.
- `npm run type-check`
  - exit 0.
- `npm run test:run`
  - fyrsta lokaheildarkeyrsla fyrir scrubber/liti: exit 0, 148 testaskrár passed, 1 skipped; 3701 passed, 28 skipped, 8 todo.
- `npm run test:run -- lib/__tests__/road-map-route-forecast.test.ts lib/__tests__/route-comparison-mini-map.test.tsx`
  - exit 0, 2 testaskrár og 8/8 próf stóðust eftir dynamic route-heiti.
- `npm run type-check`
  - exit 0 eftir dynamic route-heiti.
- `npm run test:run`
  - endanleg keyrsla: exit 0, 148 testaskrár passed, 1 skipped; 3702 passed, 28 skipped, 8 todo.

## 6. Hvað mistókst eða var sleppt

- Ein samsett PowerShell skipun (`Get-Content ...; npm run test:run`) ræsti ekki npm vegna local execution-policy og skilaði exit 1. Þetta breytti engu. Sama npm-próf var strax keyrt eitt og sér og stóðst.
- Browserpróf voru ekki keyrð af Codex. Samkvæmt repo-reglum stjórnar Stebbi localhost/dev server sjálfur.
- `npm run build` var ekki endurtekið í þessum follow-up. V013 skráir að venjulegt build rakst á virkan `.next` dev-server state og isolated build var stöðvað af Google Fonts/netaðgangi. Type-check og full Vitest suite eru græn, en clean production build er áfram release-check.

## 7. Ákvarðanir

- Notað var route-context identity í stað `forceRebuild` boolean. Það bindur cache/reuse við raunverulega route-generation og er því minna viðkvæmt fyrir fleiri provider-a og framtíðarleiðir.
- „Besta veðrið“ er ekki deilt milli jafngóðra leiða nema station-ID mengin séu eins. Röð og duplicate station-ID hafa ekki áhrif.
- Preview-texti birtir bæði provider-röðun og route-heiti. Provider-röðun ein og sér dugði ekki þar sem `Google-leið 1/2` og vegheiti eru ólík hugtök.

## 8. Design.md alignment

- Engin ný controls eða layout-mynstur voru sett inn.
- Núverandi sýnilegt loading-state við leiðaskipti helst óbreytt.
- Lagfæringin tryggir að scrubber-control birtist eftir nýja leið í sama mobile app-flæði og við fyrsta route-mount.
- Dynamic textinn er stuttur, wrapping-friendly og liggur í núverandi textasvæði án lárétts overflow.

## 9. Route intelligence check

- Snertir provider-neutral route comparison fyrir allar leiðafjölskyldur; staðfesta fixture-samhengið var Reykjavík–Ísafjörður.
- Engin ný canonical segment, control point, caution, station matching regla eða route-cache lykill var bætt við.
- Forecast generation er bundin við virkt route-context en ekki Google route-ID sérstaklega; sama hegðun nýtist Teskeiðarleiðum.
- Best-weather reglunni er beitt á Vegagerðarstöðvar sem þegar eru matchaðar við hverja route polyline.
- Engin persónuleg route-gögn voru geymd og engin Supabase-gagnaskrif voru gerð.
- `IcelandRoadmap.md` var ekki uppfært í þessum follow-up vegna þess að breytingin lagar UI-state/orchestration og bætir ekki við nýrri leiðaþekkingu.

## 10. Áhætta sem er enn til staðar

- Regression-prófið sannreynir generation-regluna beint en renderar ekki allt MapLibre/route-switch flæðið end-to-end. Localhost-próf Stebba er því nauðsynlegt.
- Route-heiti koma úr provider description/labels. Ef provider skilar tómu heiti fellur textinn örugglega niður í `Google-leið N` eða `Teskeiðarleið N`.
- Clean production build þarf enn að staðfesta áður en gefið er út.
- Strict routing feature gate og SQL-staða eru óbreytt frá v013: migration-skráin er skrifuð en ekki keyrð og env-breytan er ekki sett af Codex.

## 11. Supabase / auth / release state

- Engin SQL-skrá var skrifuð eða breytt í þessum follow-up.
- `sql/91_feature_access_teskeid_routing_v1.sql` frá v013 var ekki keyrð.
- Engin áhrif á RLS, grants, policies, auth, functions, production gögn eða notendagögn í þessum follow-up.
- Ekkert commit, push, deploy eða Vercel/Supabase/env state change var gert.

## 12. Localhost checks for Stebbi

Síða: `/auth-mvp/vedrid` eða canonical `/vedrid`, eftir því hvaða local auth-state Stebbi notar.

Forsendur:

- `TESKEID_ROUTE_CANDIDATE_ENABLED=true` í local env.
- Innskráður notandi með `teskeid-routing-v1` aðgang ef strict per-user gate frá v013 er virkt í local DB.
- Stebbi endurræsir sjálfur dev server ef env eða SQL-state hefur breyst; Codex gerði það ekki.

Skref:

1. Reikna Reykjavík → Ísafjörður og bíða þar til scrubber birtist.
2. Velja aðra Google-leið eða Teskeiðarleið í samanburðinum, en ekki staðfesta strax.
3. Staðfesta að kortið flippar hratt yfir á preview-leiðina.
4. Lesa textann undir kortinu. Hann á að nefna bæði nákvæma preview-leið og nákvæma leið núverandi veðurútreiknings, t.d. `Google-leið 2 (Djúpurvegur/Leið 61)` og `Google-leið 1 (Vestfjarðavegur/Leið 60)`.
5. Smella á „Skoða veðurskilyrði fyrir þessa leið“.
6. Staðfesta sýnilegt loading feedback meðan reiknað er.
7. Þegar nýja leiðin er tilbúin á scrubberinn að birtast með mörgum brottfarartímum, ekki aðeins einum „núna“ punkti eða núverandi Vegagerðarstöðvum.
8. Færa scrubberinn milli tíma og staðfesta að Veðurstofu-/Vegagerðargögn, status og kort endurspegli valinn tíma fyrir nýju leiðina.
9. Skipta aftur yfir á fyrri leið og endurtaka. Scrubber á aftur að byggjast upp fyrir þá route-generation.
10. Staðfesta að allar leiðir hafi greinilega ólíka liti.
11. Ef tvær leiðir hafa jafnt weather score en ólíkar stöðvar á aðeins ein þeirra að fá „Besta veðrið ef lagt er af stað núna“. Merkið má vera á báðum aðeins ef nákvæmlega sama station mengi liggur undir.

Helstu regressions að passa:

- Enginn horfinn scrubber eftir leiðaskipti.
- Engin gömul leiðartímalína eða gamlar stöðvar hanga inni eftir nýtt val.
- Preview á korti má ekki endurreikna allt fyrr en græni staðfestingarhnappurinn er notaður.
- Engin mobile zoom, lárétt overflow eða overlap í dynamic leiðartexta.
- Notandi án per-user flags og öll environment þar sem env er ekki nákvæmlega `true` mega ekki sjá eða kalla Teskeið routing candidate virkni.

Ekki prófa production, keyra migration, breyta RLS/auth eða setja Vercel env kæruleysislega sem hluta af þessum localhost-checkum. Slíkt krefst áfram sérstaks framkvæmdarleyfis.

## 13. Næsta skref og spurningar fyrir Claude Code

Claude Code er beðinn um read-only code review áður en commit/deploy kemur til greina:

1. Er route-context identity nógu traust gegn aborted timeout og hröðum endurteknum leiðaskiptum?
2. Er einhver success-path í forecast builder sem gleymir að merkja completed context?
3. Getur dynamic provider/route-heitið orðið villandi ef provider skilar duplicate/tómu description?
4. Eru best-weather station-set tie-reglurnar réttar og deterministic?
5. Sér Claude Code einfaldan integration-test möguleika fyrir route switch án þess að mocka allt MapLibre componentið?
6. Eru einhver release-blocking atriði utan þess sem v013 og þetta v014 handoff skrá?

## Óvissa / þarf að staðfesta

Confidence: high á greindri stale-state orsök og unit/full-suite niðurstöðum. Confidence: medium-high á fullri browser-hegðun þar til Stebbi hefur prófað tvö eða fleiri raunveruleg leiðaskipti á localhost.
