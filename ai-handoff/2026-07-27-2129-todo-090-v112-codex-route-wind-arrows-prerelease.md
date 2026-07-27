# TODO-090 v112 — Vindáttarörvar meðfram leið, prerelease

**Staða:** Sjálfstæður vindörvapakki er tilbúinn í commit/deploy-gátt. Engin
SQL, Supabase-skrif, environment-breyting eða production-breyting hefur verið
gerð þegar þetta handoff er skrifað.

## 1. Plan áfangans

1. Sýna núverandi mælda vindátt Vegagerðarinnar endurtekið meðfram valinni leið.
2. Umbreyta meteorological „hvaðan“ átt í áttina sem vindurinn blæs.
3. Halda örvum landfræðilega réttum við snúning korts og læsilegum sitt hvoru
   megin við veginn á mobile og í yfirlitszoom-i.
4. Sýna aðeins heiðarlega, ferska og nothæfa punktmælingu og skilja eyður auðar.
5. Keyra afmörkuð og full regression-próf, type-check, lint og production-build.

## 2. Hvað var raunverulega gert

- Nýr hreinn route-domain helper byggir deterministic og capped GeoJSON-reit.
- Töluleg vindátt er valin fram yfir texta; íslenskar 16-átta skammstafanir eru
  fallback. `FROM + 180°` verður raunveruleg `TOWARD` stefna örvar.
- Tvær örvar hafa sömu leiðarfestingu en data-driven `icon-offset` sem er
  forsnúið miðað við staðbundna vegstefnu og vindstefnu. MapLibre snýr síðan
  offseti og ör með kortinu. Þetta heldur föstu sjónrænu hliðarbili og kemur í
  veg fyrir að báðar raðir falli saman í litlu zoom-i.
- Örvarnar nota hlutlausan slate-lit með hvítum kanti svo liturinn sé ekki
  ranglega lesinn sem grænt öryggismat.
- Aðeins mælingar með vindhraða og vindátt, innan 30 mínútna aldurs og innan
  afmarkaðs áhrifasvæðis stöðvar eru sýndar. History-fallback, logn/no-data og
  langt fram í tímann stimpluð mæling eru falin.
- Lagið fylgir sama stöðufilter og Vegagerðarstöðvar, sést aðeins í
  `Vegagerðin`/`Núna`, tæmist við route-clear og eldist á 60 sekúndna refresh.
- In-memory canvas-sprite er bætt aðeins einu sinni við; source er endurnýtt með
  `setData` og layer er ekki tvístofnað.
- Stutt íslensk og ensk skýring birtist aðeins þegar örvar eru til staðar.

## 3. Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- Vegagerðin provider/type-, route-matching- og wind-status skrár undir `lib/`
- MapLibre 5.24.0 og style-spec 24.10.0 local source fyrir `icon-offset`,
  `icon-rotate` og collision-box hegðun
- Núverandi TODO-090 próf og route skjöl

## 4. Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/road-intelligence/routeWindArrowField.ts` (ný)
- `lib/__tests__/road-intelligence-route-wind-arrow-field.test.ts` (ný)
- `lib/__tests__/road-map-vegagerdin-live-ui.test.ts`
- `messages/is.json`
- `messages/en.json`
- `IcelandRoadmap.md`
- þetta handoff

`.obsidian/workspace.json` og eldri ótrackuð handoff-skjöl eru notendaeign og
eru sérstaklega utan scope.

## 5. Skipanir sem voru keyrðar

- Afmörkuð Vitest-gátt á vindörva- og Vegagerðin-UI prófum.
- Breið targeted gátt: 9 test files / 149 tests.
- Fullt `npm.cmd run test:run` eftir collision/freshness-lagfæringu.
- `npm.cmd run type-check`.
- `npm.cmd run lint`.
- `npm.cmd run build`.
- `git diff --check` og read-only scope/status skoðanir.

## 6. Niðurstöður og exit codes

- Loka-afmörkuð próf: 2 files / 17 tests, exit 0.
- Full próf: 191 passed, 1 skipped; 4.128 passed, 28 skipped, 8 todo; exit 0.
- Type-check: exit 0.
- Lint: exit 0; aðeins fyrirliggjandi warnings, engin ný villa.
- Next production-build: exit 0.
- `git diff --check`: exit 0; aðeins fyrirliggjandi CRLF viðvaranir.

## 7. Hvað mistókst eða var sleppt

- Fyrsta type-check fann dauða center-lane grein; hún var fjarlægð og endurkeyrsla
  varð græn.
- Fyrsta útfærsla notaði 1,2 km landfræðilegt hliðarbil. Óháð rýni sýndi að það
  félli sjónrænt saman í overview zoom-i. Það var skipt út fyrir collision-aware,
  skjástöðugt MapLibre `icon-offset` og nýtt snúningspróf.
- Terminal-próf geta ekki staðfest raunverulega canvas-upplifun með augum.
  Snúningur, zoom, filter og 60 sekúndna refresh þurfa því manual smoke.

## 8. Ákvarðanir Codex

- Mæld stefna er sýnd, ekki interpoleruð vindspá.
- Langar stöðvalausar eyður eru auðar; ein stöð fær ekki ótakmarkað áhrifasvæði.
- Hlutlaus litakóðun forðast nýtt eða villandi öryggismat.
- `icon-rotation-alignment: map`, `icon-pitch-alignment: map` og
  `icon-keep-upright: false` varðveita landfræðilega stefnu. Enginn
  `map.getBearing()` eða rotate-listener er notaður.
- Design.md er fylgt með compact, mobile-first, óanimate-uðu kortalagi og engum
  nýjum control sem veldur overflowi eða interaction-árekstri.

## 9. Áhætta sem er enn til staðar

- Mælistöðvar eru punktmælingar; örvar milli þeirra segja ekki að vindur sé
  samfelldur eða eins alls staðar.
- MapLibre collision getur fækkað nálægum örvum eða labels í þéttum skjá, en
  tvær hliðarörvar við sama anchor hafa nú aðskilda collision-boxa.
- Pitch getur sjónrænt þjappað skjábilinu; map-alignment var valið til að halda
  landfræðilegri afstöðu réttri.
- Raunveruleg kortasjónprófun er enn nauðsynleg eftir deploy.

## 10. Tillaga að næsta skrefi

Stofna exact-scope commit með skránum í kafla 4, push-a á `main`, bíða eftir
Vercel `Ready`, keyra read-only production smoke og síðan gera manual mobile
canvas-prófið hér fyrir neðan.

## 11. Atriði fyrir næstu rýni

- Eru tvær raðir nægilega læsilegar við route-fit, zoom 8/10 og 90° kortsnúning?
- Er 8 km grunnþéttleiki hæfilegur á bæði stuttri og langri leið?
- Er hlutlausi slate-liturinn sýnilegur án þess að líta út eins og öryggisstaða?
- Eru eyður augljóslega heiðarlegar þar sem engin fersk stöð styður reitinn?

## 12. Supabase / auth / gögn

- Engin SQL-skrá var búin til eða keyrð.
- Engin Supabase-, RLS-, grants-, auth-, policy-, function- eða production-data
  breyting var gerð.
- Engin ný gögn eru vistuð; þetta er client-side framsetning á núverandi
  route response.

## 13. Localhost checks for Stebbi

**Slóð og state:** Opna `http://localhost:3004/vedrid`, reikna leið sem skilar
Vegagerðin-punktum og opna stóra leiðakortið. Prófa má public eða innskráðan
notanda; nota `Vegagerðin` og `Núna`.

1. Velja `Vegagerðin` og `Núna`.
   - Vænt: hlutlausar örvar liggja sitt hvoru megin við veginn þar sem fersk
     mæling styður þær; langar óstuddar eyður eru auðar.
2. Skoða route-fit og zooma síðan í um 8 og 10.
   - Vænt: báðar raðir sjást og haldast hornrétt sitt hvoru megin við veginn;
     ekkert lárétt overflow eða stjórn-overlap á 360–460 px breiðum skjá.
3. Snúa kortinu um u.þ.b. 90° með tveimur fingrum eða hægri-drag.
   - Vænt: vegurinn og örvareitur snúast saman en örin heldur sömu
     landfræðilegu vindstefnu; hún festist ekki við skjáinn.
4. Skipta milli `Núna` og forecast/öðrum provider.
   - Vænt: örvar hverfa utan `Vegagerðin`/`Núna` og koma aftur án tvöföldunar.
5. Smella stöðufilterum.
   - Vænt: örvar fylgja sömu sýnilegu stöðum og stöðvarnar.
6. Reikna aðra leið og bíða yfir eina 60 sekúndna refresh-lotu.
   - Vænt: gamla lagið tæmist, nýja lagið tvístofnast ekki og úreltar örvar
     hverfa á réttum tíma.

**Varúð:** Prófið krefst hvorki SQL né handvirkra Supabase/env-breytinga. Ekki
breyta secrets, flags eða provider-gögnum til að framkalla niðurstöðu.
