# TODO-091 v014 — Tengilína velur næsta spjaldajaðar

## Plan áfangans

1. Skipta út fastri tengingu við neðri miðju.
2. Reikna næsta punkt á öllum jaðri spjaldsins.
3. Staðfesta type-check, próf og build.

## Hvað var raunverulega gert

- Tengilínan notar nú raunveruleg `getBoundingClientRect()` mörk stöðvarmarkers og spjaldastaflans.
- Endapunktur er næsti punktur á spjaldajaðrinum:
  - vinstri hlið;
  - hægri hlið;
  - efri hlið;
  - neðri hlið;
  - horn þegar punkturinn er skáhallt frá spjaldinu.
- Ef stöðvarpunkturinn lendir innan spjaldarammans er næsta hlið valin sérstaklega svo línan verði ekki núll að lengd eða fari í gegnum spjaldið.
- Lengd og horn eru áfram endurreiknuð fyrir hvert collision-offset, zoom og pan.
- Aksturskortið er óbreytt.

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2139-todo-091-v014-codex-connector-nearest-card-edge.md`

Fyrri ócommittaðar v011–v013 breytingar voru varðveittar. Ótengdar notendabreytingar voru ekki snertar.

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
- Engin sjónræn browser-prófun var keyrð.
- Ekkert commit, push, deploy eða SQL var gert.

## Áhætta sem er enn til staðar

- `getBoundingClientRect()` þarf browser-staðfestingu með raunverulegum MapLibre transforms.
- Við horn velur reikniritið geometrískt næsta punkt, sem getur myndað línu sem snertir nákvæmlega hornið fremur en miðju næstu hliðar.
- Línur geta enn farið yfir kortaupplýsingar eða hver aðra þegar mjög þétt er.

## Localhost checks for Stebbi

Slóð:

`/auth-mvp/vedrid/road-map-prototype`

1. Veldu stöðvar sem collision-layoutið færir í mismunandi áttir.
2. Opnaðu Spá-kortið.
3. Staðfestu sérstaklega:
   - Punktur vinstra megin við spjald tengist vinstri hlið.
   - Punktur hægra megin tengist hægri hlið.
   - Punktur fyrir ofan tengist efri hlið.
   - Punktur fyrir neðan tengist neðri hlið.
   - Skáhallur punktur má tengjast horni.
4. Zoomaðu og færðu kortið.
   - Tenging á að skipta um hlið ef spjaldið færist yfir punktinn.
5. Staðfestu að línan endi á jaðrinum en fari ekki í gegnum spjaldið.
6. Opnaðu Aksturskortið.
   - Engin breyting á Akstursmarkerum.

## Supabase

Engar Supabase- eða SQL-breytingar.
