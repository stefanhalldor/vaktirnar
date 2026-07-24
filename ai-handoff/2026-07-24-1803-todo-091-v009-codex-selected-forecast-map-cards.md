# TODO-091 v009 — Veðurspjöld fyrir valdar stöðvar á Spá-korti

## Plan áfangans

1. Skoða hvernig valdar Spá-stöðvar og nálægar hjálparstöðvar eru teiknaðar.
2. Endurnýta ríka veðurspjaldið sem Vegagerðin notar.
3. Takmarka ríku spjöldin við stöðvar sem notandinn hefur valið.
4. Keyra type-check, afmarkað preference-próf og production build.

## Hvað var raunverulega gert

- `createWeatherChaseMapMarkerElement` virkjar nú `showWeatherCard` þegar marker-kind er `selected`.
- Valdar stöðvar á Spá-korti sýna því:
  - vindáttarör;
  - vind og hviðu;
  - lofthita;
  - úrkomu;
  - veðurtákn þegar það er tiltækt;
  - stöðvarheiti;
  - medalíu þegar medalíustilling er virk.
- Nálægar Veðurstofustöðvar sem birtast sem hjálparviðmið halda áfram að vera einfaldir, daufari punktar. Þær líta því ekki út eins og stöðvar sem notandinn valdi sjálfur.
- Engu marker-, layer- eða state-flæði Aksturs var breytt.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `lib/__tests__/weather-chase-preferences.test.ts`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-1803-todo-091-v009-codex-selected-forecast-map-cards.md`

Ótengdar breytingar á `.obsidian/workspace.json` og endurnefning v006 handoffs voru ekki snertar.

## Skipanir sem voru keyrðar

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0; 3 af 3 prófum stóðust.
- `npm.cmd run build`
  - Exit code 0.
  - Production build kláraðist; aðeins fyrirliggjandi lint-viðvaranir birtust.
- `git diff --check`
  - Engar whitespace-villur; aðeins fyrirliggjandi line-ending viðvaranir.

## Hvað mistókst eða var sleppt

- Engin skipun mistókst.
- Engin browser-/sjónræn prófun var keyrð þar sem Stebbi stýrir localhost.
- Ekki var bætt við MapLibre DOM-marker component-prófi.
- Ekkert commit, push eða deploy var gert.

## Ákvarðanir

- Núverandi sameiginlegi marker-component var endurnýttur í stað þess að tvítaka HTML/CSS spjaldsins.
- `selected` er eina skilyrðið fyrir ríku Spá-spjaldi. Það tengir útlitið beint við val notandans og ver aðskilnað gagnvart nearby-markerum.
- Lausnin fylgir `Design.md` með því að endurnýta samræmt spjald, halda tappanlegu svæði og bæta ekki nýjum controls eða mobile-overflowi við.

## Áhætta sem er enn til staðar

- Mörg valin stöðvarspjöld nálægt hvert öðru geta skarast á litlum skjá.
- Met.no-staður sýnir spjald þegar raðir hans hafa verið sóttar; á meðan gögn vantar sjást strik í mæligildum.
- Sjónræn röðun medalíu og veðurtákns þarf browser-staðfestingu.

## Tillaga að næsta skrefi

Staðfesta dæmigerð 3–7 stöðva val á mobile. Ef overlap verður of mikið ætti næsti áfangi að hliðra spjöldum eða nota collision-layout, ekki fela valdar stöðvar.

## Spurningar fyrir næstu rýni

1. Eru spjöldin nægilega læsileg þegar 5–7 staðir eru valdir?
2. Er rétt að halda nearby-stöðvum sem punktum eða eiga þær alls ekki að sjást?
3. Er úrkoma rétta hægra gildi fyrir bæði Veðurstofuna og met.no?

## Supabase

Engin SQL-skrá var skrifuð eða keyrð. Engar breytingar voru gerðar á gögnum, RLS, auth, grants, policies, functions eða production.

## Localhost checks for Stebbi

Slóð:

`/auth-mvp/vedrid/road-map-prototype`

Nauðsynlegt state:

- Innskráður notandi með nokkrar valdar stöðvar í Spá.
- Gott er að prófa bæði Veðurstofustöð og met.no-stað ef hvort tveggja er í valinu.

Skref og vænt niðurstaða:

1. Opnaðu Spá og staðfestu hvaða staðir eru valdir.
2. Smelltu á Íslandskorts-toggle Spár.
   - Hver valin stöð með hnit á að birtast sem ríkt veðurspjald.
3. Skoðaðu hvert spjald.
   - Vindáttarör, vindur/hviða, hiti, úrkoma og stöðvarheiti eiga að sjást.
   - Veðurtákn og medalía eiga að sjást þegar gögn/stillingar heimila.
4. Ef „nálægar stöðvar“ hefur verið virkjað fyrir met.no-stað:
   - Valdi staðurinn á að vera ríkt spjald.
   - Nálægar Veðurstofustöðvar eiga að vera daufari punktar, ekki sams konar spjöld.
5. Breyttu vali í Spá og opnaðu kortið aftur.
   - Aðeins nýja valið á að fá rík spjöld.
6. Skiptu yfir í Akstur og opnaðu aksturskortið.
   - Engin Spá-spjöld mega leka inn á Aksturskortið.
7. Prófaðu mobile og desktop breidd.
   - Enginn óæskilegur láréttur overflow eða overlap við kort/tölur-toggle.

Helstu regressions:

- Allar stöðvar fái spjöld í stað aðeins valinna stöðva.
- Nearby-stöðvar ruglist saman við val notandans.
- Spá-spjöld birtist í Akstri.
- Kortið endurmiðjist rangt eða valdar stöðvar vanti.
