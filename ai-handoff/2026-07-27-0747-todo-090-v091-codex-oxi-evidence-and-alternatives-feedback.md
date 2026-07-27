# TODO #90 — Öxi evidence and alternatives feedback

Created: 2026-07-27 07:47
Timezone: Atlantic/Reykjavik

## Samþykkt og niðurstaða

Stebbi samþykkti tvær afmarkaðar lagfæringar: provider-neutral Öxi-varúð byggða
á staðfestu stöðvaevidence og sýnilegt feedback fyrir `Finna fleiri
Teskeiðarleiðir` á fullscreen-kortinu. Báðar voru framkvæmdar. Ekkert commit,
push, deploy, SQL, migration, Supabase eða production var gert.

## Hvað var gert

- Fjarlægði gamla 10 km approximate Öxi-corridorinn úr notendasýnilegu
  caution-mati.
- Öxi-varúð kviknar nú aðeins ef route geometry fer innan 1,5 km frá staðfestu
  Veðurstofunni Öxi, station `35963`.
- Sama matcher-regla gildir um Google- og Teskeiðarleiðir.
- Teskeið road-graph candidate notar explicit station-grade evidence mode.
- Bætti regression-prófum fyrir:
  - fjarðaleið nálægt gamla gervipunktinum fær ekki Öxi-caution;
  - leið um staðfesta Öxi-stöð fær caution;
  - Google curated/base flæði notar sömu stöðvarfixture.
- Fullscreen alternatives-hnappur verður disabled með textanum `Leit að fleiri
  leiðum lokið` þegar alternatives-status er `ready`.
- Fundnar leiðir eru áfram sýndar í status-skilaboðum; hnappurinn tekur ekki við
  dauðum smelli sem skilar sömu client/server cached leiðum.

## Skrár breyttar í þessum áfanga

- `lib/weather/routeCautions.ts`
- `lib/iceland-routes/roadGraphCandidate.server.ts`
- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-route-cautions.test.ts`
- `lib/__tests__/weather-google.test.ts`
- `lib/__tests__/road-graph-candidate.test.ts`
- `lib/__tests__/route-comparison-mini-map.test.tsx`

Allar þessar skrár voru unnar í dirty worktree; sumar báru fyrirliggjandi
ócommittaðar route/performance breytingar sem Codex varðveitti.

## Skipanir og niðurstöður

- Fyrsta targeted keyrsla: 146/150 próf græn; fjögur Google fixtures byggðu enn
  á gamla 10 km punktinum og voru uppfærð í staðfesta station fixture.
- Lokakeyrsla:
  `npm run test:run -- lib/__tests__/road-graph-candidate.test.ts lib/__tests__/weather-route-cautions.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/route-comparison-mini-map.test.tsx`
  — exit 0, 4 files og 150/150 tests passed.
- `npm run type-check` — exit 0.
- Message JSON parse — exit 0.
- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF warnings.

## Route intelligence check

- Snertir Öxi/Axarveg 939 og Höfn–Egilsstaðir route-family.
- Evidence er provider-neutral geometry-to-station matching.
- Engin live provider-tiltækni er nauðsynleg við caution-mat; canonical staðfest
  station-hnit eru í matcher-registry.
- Engin route geometry, staðföng eða notendagögn eru vistuð.
- Engin breyting var gerð á Google provider, routing provider vali eða Supabase.

## Design.md samræmi

- Fullscreen action hefur nú skýrt loading/completed state og virðist ekki dauð.
- Feedback er texti, ekki aðeins litur.
- Disabled state heldur sömu stærð og active state.
- Allur nýr notendatexti er í íslenskum og enskum message-skrám.

## Næsti UI-áfangi — ekki framkvæmdur

Stebbi benti réttilega á að compact summary-route-spjöldin séu betri en
fullscreen-spjöldin. Næsti afmarkaði áfangi ætti að:

1. Extract-a eitt canonical compact `RouteOptionCard` view-model/component sem
   bæði summary og fullscreen nota.
2. Varðveita compact röð: provider/heiti, km, tíma-rank, caution/weather badges,
   slitlagsstiku og stutta bundið/möl/óvíst línu.
3. Bæta litlu segmented/select röðunar-control-i á fullscreen:
   - `Aksturstími` — stystur áætlaður tími fyrst;
   - `Veður núna` — lægsta deterministic weather severity fyrst, síðan tími;
   - líklegur þriðji valkostur: `Sjálfgefin röð` til að varðveita provider/arrival
     order og gera hegðun afturkræfa.
4. Ekki nota `Öruggust`; gögnin réttlæta aðeins `Veður núna` eða `Best veður núna`.
5. Röðun má ekki breyta selected route eða route-lit; aðeins röð spjalda.

Þessi UI-/sorting-vinna var ekki framkvæmd þar sem Stebbi setti hana fram sem
vöruhugmynd, ekki nýtt skýrt framkvæmdarleyfi.

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid` sem innskráður notandi með Veðrið-aðgang.
2. Reikna Höfn → Egilsstaðir og opna `Veldu leið á korti`.
3. Vænt: leiðin um firðina fær ekki `Varasöm leið` vegna Öxi.
4. Velja/reikna leið sem fer raunverulega um Axarveg og fram hjá Öxi-stöðinni.
5. Vænt: sú leið fær Öxi-varúð óháð því hvort hún kemur frá Google eða Teskeið.
6. Smella `Finna fleiri Teskeiðarleiðir` meðan status er idle/none/unavailable.
7. Vænt: loading feedback birtist og niðurstaða uppfærist.
8. Þegar fleiri leiðir hafa fundist, opna fullscreen aftur.
9. Vænt: hnappurinn segir `Leit að fleiri leiðum lokið`, er disabled og status
   segir hversu margar Teskeiðarleiðir fundust.
10. Prófa 360, 390, 460 px og desktop; passa að completed texti wrap-i án
    horizontal overflow og að primary route action haldist aðgengileg.

Engin migration, env-, Supabase-, auth-, RLS- eða production-aðgerð þarf fyrir
þessi localhost-próf.

## Óvissa / eftirstandandi áhætta

- Confidence: high fyrir matcher og component state; 150 targeted tests eru græn.
- Staðfesta þarf sjónrænt á localhost að canonical station-línan passar við
  raunverulegan veg 939 í báðar áttir.
- Vegagerðarstöð með canonical auðkenni fannst ekki í núverandi typed registry;
  Veðurstofustöð 35963 er því nú eina staðfesta evidence. Hægt er að bæta
  Vegagerðar-evidence við síðar þegar stable station ID og hnit eru staðfest.
