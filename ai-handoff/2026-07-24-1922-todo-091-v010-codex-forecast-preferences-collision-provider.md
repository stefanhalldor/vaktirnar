# TODO-091 v010 — Spá-persistence, collision og gagnagjafamerki

## Plan áfangans

1. Greina hvers vegna vistað val birtist ekki og breytingar autosave-ast ekki.
2. Laga hydration/autosave race-condition og bæta við regression-prófi.
3. Hindra overlap milli valinna Spá-spjalda.
4. Merkja hvert spjald með Yr/met.no eða Veðurstofunni.
5. Keyra type-check, afmörkuð próf og production build.

## Hvað var raunverulega gert

- Lagað race-condition í `WeatherChasePanel`:
  - componentið heldur nú utan um nákvæm ID sem upphafsval á að setja;
  - selection callback má ekki birtast fyrr en það ID-val er raunverulega komið í state;
  - eftir fyrstu réttu birtingu mega venjulegar breytingar notandans fara áfram í callback/autosave.
- Þetta kemur í veg fyrir að tómt eða gamalt selection sé autosave-að yfir vistaða stöðvalistann á meðan preferences og Veðurstofugögn eru að hydrata.
- Bætt var við regression-prófi sem sannreynir að vistað station-id birtist án undanfarandi tóms callbacks.
- Valin Spá-spjöld fá provider-rönd efst:
  - `Yr / met.no`;
  - `Veðurstofa Íslands`.
- Bætt var við collision-layouti fyrir valin Spá-spjöld:
  - stöðvarpunkturinn sjálfur helst á réttum hnitum;
  - aðeins spjaldastaflinn er hliðraður;
  - nokkrar láréttar, lóðréttar og skáar staðsetningar eru prófaðar;
  - layoutið er endurreiknað eftir upphafsbirtingu, pan og zoom;
  - spjöld eru höfð innan sýnilegra kortamarka þegar mögulegt er.
- Nearby-hjálparpunktar eru ekki hluti af collision-spjaldalayoutinu þar sem þeir eru ekki rík spjöld.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/teskeid/weather/preferences/chase/route.ts`
- `lib/__tests__/weather-chase-preferences.test.ts`
- `sql/90_weather_chase_preferences.sql`
- `ai-handoff/2026-07-23-1049-todo-086-v342-codex-weather-chase-defaults-criteria-prerelease.md`

## Skrár sem voru breyttar

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- `ai-handoff/2026-07-24-1922-todo-091-v010-codex-forecast-preferences-collision-provider.md`

Ótengdar breytingar á `.obsidian/workspace.json` og endurnefning v006 handoffs voru ekki snertar.

## Skipanir sem voru keyrðar

- `npm.cmd run type-check`
  - Fyrsta keyrsla fann rangan type-import í nýja prófinu; prófið var lagað.
  - Lokakeyrsla: exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0; 2 testaskrár og 4 próf stóðust.
- `npm.cmd run build`
  - Exit code 0.
  - Production build kláraðist með fyrirliggjandi lint-viðvörunum.
- `git diff --check`
  - Engar whitespace-villur; aðeins fyrirliggjandi line-ending viðvaranir.

## Hvað mistókst eða var sleppt

- Fyrsta type-check eftir nýja prófið mistókst vegna private type-imports. Það var lagað með `ComponentProps` og lokakeyrsla stóðst.
- Engin browser-/sjónræn prófun var keyrð þar sem Stebbi stýrir localhost.
- SQL90 var ekki keyrt og ekkert production/Supabase state var skoðað eða breytt.
- Ekkert commit, push eða deploy var gert.

## Ákvarðanir

- Ekki var vistað beint úr child component. Child tryggir aðeins rétta event-röð; parent heldur áfram að eiga localStorage/API autosave.
- Collision færist á kortaspjaldið en ekki punktinn svo landfræðileg staðsetning stöðvarinnar haldist sönn.
- Provider-heitið endurnýtir núverandi þýdda `providerLabel`; enginn nýr hardcode-aður notendatexti var settur í component.
- Lausnin fylgir `Design.md`: provider-merkið er þétt, spjöld haldast tappanleg og engin ný mobile-navigation eða lárétt síðu-layout var bætt við.

## Áhætta sem er enn til staðar

- Repository handoff frá 23. júlí segir að `sql/90_weather_chase_preferences.sql` hafi verið skrifað en ekki keyrt. Ef það er enn rétt virkar local/browser persistence, en ekki raunveruleg per-user persistence milli tækja/browsera. Þetta var ekki hægt að staðfesta án Supabase/production-aðgangs og migration var ekki innan framkvæmdarleyfis.
- Ef eldri race-condition hefur þegar vistað tóman lista á server er ekki hægt að endurheimta fyrra val sjálfkrafa. Notandinn þarf þá að velja stöðvar aftur einu sinni; nýja flæðið á að halda þeim.
- Við mjög þéttar 6–7 stöðvar getur engin frambærileg staðsetning verið alveg laus við overlap. Reikniritið velur þá besta tiltæka kandidatinn í núverandi röð.
- Collision notar DOM-mælingar og þarf sjónræna browser-staðfestingu.

## Tillaga að næsta skrefi

1. Keyra localhost-prófin hér að neðan.
2. Athuga Network-svarið frá `GET/PUT /api/teskeid/weather/preferences/chase`.
3. Ef svarið inniheldur `schemaMissing: true` eða `schema_missing`, þarf Stebbi að taka sérstaka ákvörðun um review og keyrslu SQL90. Ekki keyra hana sem hluta af venjulegu UI-prófi.

## Spurningar fyrir næstu rýni

1. Er SQL90 komin í viðkomandi Supabase environment eða er per-user persistence enn óvirk?
2. Endurheimtast valdar stöðvar eftir refresh án þess að tómt PUT fari fyrst?
3. Hvernig hegðar collision-layoutið sér með þéttasta raunverulega stöðvavalinu?

## Supabase

Engin SQL-skrá var breytt eða keyrð. Engar breytingar voru gerðar á gögnum, RLS, auth, grants, policies, functions eða production.

`sql/90_weather_chase_preferences.sql` er til og er hönnuð fyrir per-user persistence með service-role-only aðgangi og RLS virku. Eldra handoff segir að hún hafi ekki verið keyrð. Sérstakt leyfi og review þarf áður en hún er keyrð.

## Localhost checks for Stebbi

Slóð:

`/auth-mvp/vedrid/road-map-prototype`

Nauðsynlegt state:

- Innskráður notandi.
- DevTools Network opið og síað á `preferences/chase`.
- Veldu nokkrar stöðvar sem liggja nálægt hver annarri til collision-prófs.

Skref og vænt niðurstaða:

1. Opnaðu síðuna með innskráðum notanda og gerðu hard refresh.
   - Vistaðar stöðvar eiga að birtast.
   - Engin stutt birting á sjálfgefnum/tómum lista á að autosave-ast yfir þær.
2. Breyttu stöðvavali.
   - Eftir um 1,2 sekúndur á PUT að fara á `/api/teskeid/weather/preferences/chase`.
   - LocalStorage-lykillinn `teskeid.weather-chase.preferences.v1` á líka að uppfærast.
3. Skoðaðu PUT-svarið.
   - `200` merkir að per-user save tókst.
   - `503` með `schema_missing` merkir að SQL90 vantar; ekki keyra migration án sérstakrar ákvörðunar.
4. Gerðu hard refresh.
   - Nýja valið á að haldast í sama browser.
   - Ef API skilar 200 á það einnig að haldast sem per-user val.
5. Opnaðu Spá-kort.
   - Hvert valið spjald á að vera merkt `Yr / met.no` eða `Veðurstofa Íslands`.
6. Veldu 5–7 stöðvar, þar á meðal nálægar stöðvar, og prófaðu zoom/pan.
   - Ríku spjöldin eiga að hliðrast svo þau liggi ekki hvert ofan á öðru þegar laus staðsetning finnst.
   - Punkturinn við hnit stöðvarinnar á ekki að færast.
7. Prófaðu mobile og desktop breidd.
   - Spjöld eiga að haldast innan kortsins þegar mögulegt er.
   - Enginn láréttur síðu-overflow má myndast.
8. Opnaðu Akstur.
   - Provider-merki og collision-breytingar Spár mega ekki breyta Vegagerðar-/Akstursspjöldum.

Helstu regressions:

- Tómt/default selection autosave-ist áður en vistaða valið birtist.
- Breyting notandans kalli aldrei á autosave.
- Provider-merki vanti eða sé rangt.
- Spjald færist en stöðvarpunkturinn með því.
- Collision-layout valdi stöðugu flökti eftir pan/zoom.
