# TODO #90 — Fullscreen route choice first draft

Created: 2026-07-27 07:35
Timezone: Atlantic/Reykjavik

## Skilningur á samþykki

Stebbi bað Codex að framkvæma fyrstu drög að endurbættu `Veldu leið á korti`
viðmóti. Leyfið náði til afmarkaðra kóða-, prófa- og þýðingabreytinga. Það náði
ekki til commit, push, deploy, migration, Supabase eða production-breytinga.

## Plan áfangans

1. Endurnýta núverandi fullscreen route-comparison component og núverandi
   Teskeið alternatives API-flæði.
2. Sýna sömu mikilvægu route facts í fullscreen og í litla summary-valinu.
3. Bæta handvirkri `Finna fleiri Teskeiðarleiðir` aðgerð við fullscreen.
4. Hefja sjálfkrafa alternatives-leit þegar aðeins ein Teskeiðarleið er komin
   og hún hefur route caution.
5. Staðfesta component-hegðun, types og message JSON.

## Hvað var raunverulega gert

- Fullscreen leiðaspjöld sýna nú:
  - provider/leiðarheiti;
  - vegalengd og áætlaðan tíma;
  - `Varasöm leið` badge þegar route caution er til;
  - malarmerkingu með vegalengd;
  - slitlagsskiptingu fyrir Teskeiðarleið;
  - stutta, hlutlæga varúðarskýringu.
- Leiðaspjöld eru breiðari, mobile-first snap-spjöld og neðra svæðið má scrolla
  án þess að kortið eða primary action hverfi ófyrirsjáanlega.
- Fullscreen fær route count og eigin `Finna fleiri Teskeiðarleiðir` hnapp.
- Hnappurinn sýnir stöðugt loading-state og niðurstöðu fyrir `none`,
  `unavailable` og `ready`.
- Þegar nákvæmlega ein Teskeiðarleið er tilbúin og hún ber caution byrjar
  alternatives-leit sjálfkrafa. Fyrsta leiðin helst sýnileg meðan leitað er.
- Engin ný API, persistence eða provider-specific route-regla var búin til.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/provider.types.ts`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `messages/is.json`
- `messages/en.json`
- `TODO.md`

## Skrár breyttar

- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `messages/is.json`
- `messages/en.json`
- þessi handoff-skrá

Athugið: `RoadMapPrototypeMap.tsx`, `messages/is.json` og `messages/en.json` voru
þegar með umfangsmiklar ócommittaðar route/performance breytingar. Codex
varðveitti þær og bætti aðeins þessum fullscreen-drögum ofan á núverandi stöðu.
Heildar-`git diff --stat` lýsir því ekki eingöngu vinnu þessa áfanga.

## Skipanir og niðurstöður

- `git status --short` — exit 0; dirty worktree staðfest áður en breytingar hófust.
- Read-only `rg`, `Get-Content` og `Select-String` skoðanir — exit 0.
- `npm run test:run -- lib/__tests__/route-comparison-mini-map.test.tsx` — exit 0;
  1 test file, 9 tests passed.
- `npm run type-check` — exit 0.
- PowerShell `ConvertFrom-Json` fyrir bæði message-skjöl — exit 0.
- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF warnings.

## Hvað var ekki gert

- Enginn dev server var ræstur eða endurræstur.
- Engin browserprófun var framkvæmd af Codex.
- Engin SQL, Supabase, auth, RLS, env eða production breyting var gerð.
- Ekkert commit, push eða deploy var gert.
- Sjálfvirka caution-triggerið hefur ekki sér unit-test vegna þess að það býr
  inni í stóra `RoadMapPrototypeMap` orchestration componentinum; það þarf
  browserpróf og væri gott að extract-a sem pure decision helper í næsta fasa
  ef hegðunin verður samþykkt.

## Ákvarðanir

- Endurnýta núverandi route option og alternatives contracts í stað nýs
  fullscreen-only gagnalíkans.
- Triggera sjálfvirka leit aðeins fyrir eina cautioned Teskeiðarleið, ekki við
  hvert route request.
- Nota `varasöm leið`/`needs extra consideration` en ekki fullyrða að önnur leið
  sé öruggari eða besta leið.
- Halda manual alternatives-hnappi sýnilegum jafnvel þótt sjálfvirk leit sé til.

## Design.md samræmi

- Mobile-first route cards með 40px+ action target.
- Loading state breytir ekki breidd hnapps.
- Status er miðlað með texta og badge, ekki lit einum.
- Primary `Skoða veðurskilyrði` action er áfram ein sterk aðalaðgerð.
- Enginn hardcode-aður notendatexti; íslenska og enska eru í message-skrám.
- Neðra fullscreen-svæðið hefur bounded vertical scroll og safe-area padding.

## Route intelligence check

- Snertir almennt route-option flæði og sérstaklega cautioned leiðir eins og
  Höfn–Egilsstaðir um Öxi.
- Caution og surface facts koma úr provider-neutral `RouteOption` contracti og
  `lib/iceland-routes/` niðurstöðum.
- Engin ný Google-specific hegðun eða raw Google-geymsla var búin til.
- Engin route history, staðföng, geometry eða notendagögn voru vistuð.
- `IcelandRoadmap.md` var ekki breytt vegna þess að R6/v0.9 lýsir þegar fullscreen
  route comparison og þessi breyting er fyrsta UI-dragið ofan á þann grunn.

## Áhætta / næsta rýni

- Sjálfvirk alternatives-leit getur aukið graph-reikning fyrir cautioned leiðir;
  staðfesta þarf í browser að hún keyri aðeins einu sinni per route run.
- Fullscreen route card getur orðið hátt með löngum labels/facts. Prófa þarf
  360px skjá og landscape.
- Generic caution-textinn segir ekki enn heiti kaflans, t.d. `Öxi`. Næsti fasi
  ætti að nota þýdda `labelKey`/`summaryKey` úr route caution contractinu í sama
  canonical view-modeli og litla summary-spjaldið.
- `Besta veðrið núna` badge er enn aðeins í litla route picker. Ef það á að vera
  canonical route fact þarf að flytja weather-score niðurstöðuna inn í sameiginlega
  fullscreen item mappingu eftir browserrýni.

## Localhost checks for Stebbi

1. Halda áfram að nota localhost sem Stebbi keyrir sjálfur og opna
   `/auth-mvp/vedrid` sem innskráður notandi með aðgang að Veðrinu.
2. Velja Höfn → Egilsstaðir og bíða þar til Teskeiðarleið og Google-leið sjást.
3. Ýta á `Stækka kort`.
4. Vænt: fullscreen sýnir route count, bæði leiðaspjöld, vegalengd/tíma og
   `Varasöm leið` ásamt slitlagsskiptingu á Teskeiðarleiðinni.
5. Vænt: ef eina Teskeiðarleiðin er cautioned hefst sjálfkrafa leit að fleiri
   leiðum og núverandi leið hverfur ekki.
6. Ýta handvirkt á `Finna fleiri Teskeiðarleiðir` ef leitin er ekki þegar virk.
7. Vænt: hnappurinn sýnir spinner/texta án width-hopps og birtir síðan fundnar
   leiðir eða hlutlæg `engin leið`/`ekki tiltæk` skilaboð.
8. Velja leið með því að ýta á línu á kortinu og síðan með því að ýta á spjald.
9. Vænt: kortalína og spjald halda sama selected state; aðrar leiðir dofna en
   eru áfram sýnilegar.
10. Ýta á `Skoða veðurskilyrði fyrir þessa leið`.
11. Vænt: valin leið er notuð, modal lokast og veðurútreikningur heldur áfram
    án þess að skipta aftur yfir í aðra provider-leið.
12. Prófa 360px, 390px, 460px og desktop. Sérstaklega passa horizontal overflow,
    að close og primary action séu aðgengileg, og að löng íslensk/ensk labels
    skarist ekki.
13. Prófa Escape á desktop og back/close á mobile. Vænt: body scroll endurheimtist.
14. Regression: prófa leið án caution. Vænt: engin sjálfvirk alternatives-leit
    hefst aðeins vegna þess að ein Teskeiðarleið fannst.

Engin Supabase-, auth-, RLS-, secrets-, billing- eða production-gögn eru snert
af þessum prófum. Ekki þarf og á ekki að keyra migration eða breyta env fyrir
þessa UI-yfirferð.

## Óvissa / þarf að staðfesta

- Confidence: high fyrir component/type-level drögin; medium fyrir heildar UX
  þar til Stebbi hefur prófað raunverulegt caution-route flæði á localhost.
- Staðfesta þarf hvort sjálfvirk leit eigi líka að triggerast á möl eða lágt
  graph-confidence þegar engin formleg caution er til. Það var vísvitandi utan
  fyrstu draga.
