# TODO-091 v013 — Tengilínur frá Spá-spjöldum að stöðvarpunktum

## Plan áfangans

1. Skoða DOM-uppbyggingu Spá-markera og collision-offset.
2. Bæta línu frá hverju völdu Spá-spjaldi að rétta stöðvarpunktinum.
3. Endurreikna línuna með collision-layouti, zoom og pan.
4. Keyra type-check, afmörkuð próf og production build.

## Hvað var raunverulega gert

- `createRouteWeatherPointMarkerElement` styður nú valfrjálsa `showConnectorLine`.
- Valin Spá-spjöld virkja tengilínuna; Aksturs- og nearby-markerar gera það ekki.
- Línan:
  - byrjar í raunverulegum stöðvarpunkti;
  - endar við neðri miðju spjaldastaflans;
  - notar sama bláa lit og valdi Spá-markerinn;
  - er 1,5 px og 55% opacity;
  - liggur undir spjaldi og punkti.
- Collision-layoutið endurreiknar lengd og horn línunnar fyrir hvern prófaðan offset.
- Stöðvarpunkturinn færist ekki þegar spjaldið er hliðrað.

## Skrár sem voru skoðaðar

- `Design.md`
- `components/weather/RoadMapPrototypeMap.tsx`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2136-todo-091-v013-codex-forecast-card-connector-lines.md`

Fyrri ócommittaðar v011/v012 breytingar voru varðveittar. Ótengdar breytingar á `.obsidian/workspace.json` og endurnefning v006 handoffs voru ekki snertar.

## Skipanir sem voru keyrðar

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0; 4 af 4 prófum stóðust.
- `npm.cmd run build`
  - Exit code 0; fyrirliggjandi lint-viðvaranir.
- `git diff --check`
  - Engar whitespace-villur; aðeins line-ending viðvaranir.

## Hvað mistókst eða var sleppt

- Engin skipun mistókst.
- Engin sjónræn browser-prófun var keyrð þar sem Stebbi stýrir localhost.
- Ekkert commit, push, deploy eða SQL var gert.

## Ákvarðanir

- Línan er DOM-element innan markersins, ekki nýtt MapLibre layer. Hún fylgir því nákvæmlega sömu lifecycle og spjaldið.
- Aðeins spjaldastaflinn færist; punkturinn varðveitir landfræðilegu merkinguna.
- Línan er viljandi hálfgagnsæ svo hún skýri tenginguna án þess að verða ráðandi yfir veðurupplýsingunum.
- Lausnin fylgir `Design.md`: engin ný controls, ekkert overflow og sjónræn tenging verður skýrari á mobile.

## Áhætta sem er enn til staðar

- Langar skálínur geta farið yfir önnur kortaspjöld eða vegi þegar mjög þétt er á kortinu.
- Endpoint línunnar er við neðri miðju allrar spjaldastaflans, ekki jaðar einstakra child-spjalda.
- Nákvæmur opacity/stroke þarf sjónræna staðfestingu á raunverulegum skjá.

## Tillaga að næsta skrefi

Prófa með skjámyndardæminu og 5–7 völdum stöðvum. Ef línurnar verða of áberandi má lækka opacity; ef þær hverfa í kortinu má hækka í 65% eða bæta við ljósri outline.

## Supabase

Engar Supabase- eða SQL-breytingar.

## Localhost checks for Stebbi

Slóð:

`/auth-mvp/vedrid/road-map-prototype`

Skref:

1. Opnaðu Spá og veldu nokkrar stöðvar.
2. Opnaðu Spá-kortið.
   - Frá hverju ríku, völdu spjaldi á að liggja lína að stöðvarpunktinum.
3. Notaðu Reykjavíkur-/Hellu-/Vestmannaeyja-dæmið úr skjámyndinni.
   - Það á að vera ótvírætt hvaða punktur tilheyrir hverju spjaldi.
4. Zoomaðu inn og út og færðu kortið.
   - Spjöld mega hliðrast.
   - Línur eiga að uppfæra lengd og horn eftir hliðrun.
   - Punktarnir eiga að vera kyrrir á réttum landfræðilegum stað.
5. Virkjaðu nearby-stöðvar.
   - Einfaldir nearby-punktar eiga ekki að fá tengilínu.
6. Opnaðu Aksturskortið.
   - Vegagerðar-/akstursspjöld eiga ekki að fá nýju línurnar.
7. Prófaðu mobile og desktop.
   - Línurnar eiga að vera sýnilegar en ekki ráðandi.
   - Enginn láréttur síðu-overflow má myndast.
