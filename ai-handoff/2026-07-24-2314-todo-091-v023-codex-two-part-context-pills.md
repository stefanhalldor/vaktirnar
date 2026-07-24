# TODO-091 v023 — Tveggja hluta Spá/Akstur pillur

## Plan áfangans

1. Einfalda expanded pillu úr þremur hlutum niður í tvo.
2. Láta virka hlutann sameina samhengi og sýn.
3. Láta óvirka hlutann bjóða beint upp á hitt undirvalið.
4. Varðveita núverandi state-minni og Skilaboðahegðun.

## Hvað var raunverulega gert

- `Spá | Upplýsingar | Kort` var skipt út fyrir:
  - `Spágögn | Kort`, eða
  - `Spákort | Gögn`.
- `Akstur | Upplýsingar | Kort` var skipt út fyrir:
  - `Akstursgögn | Kort`, eða
  - `Aksturskort | Gögn`.
- Virki helmingurinn er grænn þegar samhengið er virkt.
- Óvirki helmingurinn skiptir beint yfir í hina sýnina.
- Þegar Skilaboð eru virk:
  - síðasta Spá/Akstur pilla helst expanded,
  - valda sýnin er muted,
  - Skilaboð eru eina græna aðalvalið.
- Smellur á muted virka helminginn endurheimtir vistaða sýn.
- Óvalið samhengi birtist áfram sem einfalt `Spá` eða `Akstur`.
- Engri map/panel state-lógík var breytt.

## Notendatextar

Bætt var við íslensku og ensku:

- `Gögn` / `Data`
- `Spágögn` / `Forecast data`
- `Spákort` / `Forecast map`
- `Akstursgögn` / `Driving data`
- `Aksturskort` / `Driving map`

## Skrár sem voru skoðaðar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `Design.md`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-24-2314-todo-091-v023-codex-two-part-context-pills.md`

## Skipanir og niðurstöður

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0; 2 skrár og 4 próf stóðust.
- `git diff --check`
  - Exit code 0; engar whitespace-villur, aðeins line-ending viðvaranir.
- `npm.cmd run build`
  - Exit code 0.
  - Aðeins fyrirliggjandi lint-viðvaranir.

## Hvað mistókst eða var sleppt

- Dev server/browser var ekki ræstur.
- Engin screenshot-baseline var tekin.

## Ákvarðanir og áhætta

- Virki helmingurinn segir bæði samhengi og sýn svo sérstakur `Spá`/`Akstur`
  hluti er óþarfur í expanded state.
- Óvirki helmingurinn notar stutta `Kort`/`Gögn` merkingu til að minnka breidd.
- Fyrri `Upplýsingar` þýðingarlykill er ekki fjarlægður; hann gæti enn nýst
  annars staðar eða verið fjarlægður síðar í hreinsun.
- Enska `Forecast data`/`Driving data` er lengri en íslenskan og þarf 360 px
  browserprófun.
- Lausnin heldur 40 px hæð og focus-rings samkvæmt `Design.md`.

## Supabase, SQL og production

- Engin SQL, Supabase, auth, RLS, secrets, billing eða notendagagnabreyting.
- Ekkert var committað, push-að eða deployað.

## Tillaga að næsta skrefi

Staðfesta að nýja málfræðin og breiddin virki við 360–460 px og að muted pilla
undir Skilaboðum sé skiljanleg.

## Atriði sem Codex ætti sérstaklega að rýna

- Mobile width á íslensku og ensku.
- Hvort active/inactive merking sé skýr án þriðja samhengishlutans.
- Keyboard og screen-reader merking.

## Localhost checks for Stebbi

Prófunarsíða: `/auth-mvp/vedrid/road-map-prototype`

1. Gerðu hard refresh.
   - Vænt: `Spágögn | Kort`, `Akstur`, `Skilaboð`.
   - `Spágögn` er grænt.
2. Smelltu á `Kort`.
   - Vænt: pillan verður `Spákort | Gögn`.
   - `Spákort` er grænt og Spákortið birtist.
3. Smelltu á `Gögn`.
   - Vænt: pillan verður aftur `Spágögn | Kort`.
4. Smelltu á `Akstur`.
   - Vænt við upplýsingasýn: `Spá`, `Akstursgögn | Kort`, `Skilaboð`.
5. Smelltu á Kort í Akstri.
   - Vænt: `Aksturskort | Gögn`.
6. Skiptu nokkrum sinnum milli Spár og Aksturs.
   - Vænt: hvort samhengi man sitt síðasta undirval.
7. Frá `Aksturskort | Gögn`, opnaðu Skilaboð.
   - Vænt: `Aksturskort | Gögn` helst sýnilegt muted og Skilaboð eru græn.
8. Smelltu á muted `Aksturskort`.
   - Vænt: farið er aftur í sama Aksturskort.
9. Prófaðu við 360, 390 og 460 px og á ensku.
   - Enginn horizontal overflow.
   - Teskeið-menu helst sýnilegt.
   - Allir hlutar eru 40 px háir.
10. Prófaðu Tab, Enter og Space.
    - Focus-ring er sýnileg og val skiptir rétt.

Prófunin snertir ekki Supabase, production-gögn eða billing.
