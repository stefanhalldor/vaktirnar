# TODO 091 v058 — Promotion áfangi 1b: typed navigation

Created: 2026-07-25 14:25  
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi gaf Codex leyfi til að taka næsta skref eftir v057. V057 skilgreinir
næsta skref sem áfanga 1b: typed navigation og path parameterization.

Enginn page route var promoted. Engin pulseBack-kind breyting, station-access
breyting, commit, push, deploy, migration, Supabase- eða production-aðgerð var
framkvæmd.

## Hvað var gert

### Reusable typed navigation contract

Ný skrá `lib/weather/roadMapNavigation.ts` skilgreinir:

- `RoadMapCanonicalPath`;
- `RoadMapAuthenticatedPath`;
- `RoadMapNavigation`;
- compatibility default fyrir núverandi prototype;
- pure helpers fyrir:
  - route restore return;
  - station return;
  - sign-in return.

Canonical og authenticated path eru aðskilin svo public `/vedrid` verði ekki
óvart notuð sem post-login destination.

### `RoadMapPrototypeMap`

- Fær optional `navigation: RoadMapNavigation`.
- Default er áfram
  `/auth-mvp/vedrid/road-map-prototype`, þannig að núverandi route breytir ekki
  hegðun.
- `routeReturnHref()` notar typed helper.
- public saved-place sign-in CTA notar explicit authenticated path.
- conditions-feed station links nota canonical station-return helper.
- Enginn `/vedrid` page wrapper sendir promoted navigation contract enn.

### `DriveJourneyPanel`

- Fær explicit required `stationReturnTo` prop.
- Öll þrjú `VedurstofanPointCard` samhengi nota prop í stað hardcoded
  prototype-slóðar.
- Parent sendir route restore URL fyrir `information` view, svo stöðvaspjald
  úr Akstursgögnum getur endurreiknað og endurheimt leiðina.

### Prófun

Ný `lib/__tests__/road-map-navigation.test.ts` sannreynir:

- prototype compatibility default;
- public canonical route restore;
- authenticated destination eftir public sign-in;
- station-return með og án station ID.

## Breyttar skrár

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DriveJourneyPanel.tsx`
- `lib/weather/roadMapNavigation.ts` (ný)
- `lib/__tests__/road-map-navigation.test.ts` (ný)
- þessi handoff-skrá

Layout-skrárnar í v057 voru búnar til af Claude Code og voru ekki breyttar af
Codex í þessum áfanga.

## Keyrðar skipanir

1. `npm.cmd run type-check`
   - Exit code 0.
2. `npm.cmd run test:run -- lib/__tests__/road-map-navigation.test.ts lib/__tests__/pulseBack.test.ts lib/__tests__/pulseTarget.test.ts`
   - Exit code 0.
   - 3 test files, 52 tests passed.
3. `git diff --check`
   - Exit code 0.
   - Aðeins fyrirliggjandi CRLF warnings.
4. `npm.cmd run build`
   - Exit code 0.
   - Compile, lint/type phase, 100/100 static pages og build traces kláruð.
   - Aðeins fyrirliggjandi exhaustive-deps, `<img>` og gamalt caniuse-lite
     warnings.

Enginn dev server var ræstur eða endurræstur.

## Review notes fyrir Claude Code

1. Staðfesta að typed path union sé nægilega þröng fyrir promotion wrappers.
2. Staðfesta að `stationReturnTo={routeReturnHref('information')}` sé réttara
   en fyrra base-only return, þar sem krafa Stebba er að leið haldist eftir
   station detail.
3. Staðfesta að conditions-feed station return með `stationId` sé áfram
   compatibility contract, þótt station-selection query migration verði tekin
   sérstaklega í seinni áfanga.
4. Ekki hefja áfanga 2 fyrr en 1c (`pulseBack`) er lokið og station access /
   compatibility ákvarðanir v056 eru staðfestar.

## Route intelligence check

Breytingin er aðeins typed navigation contract. Engin route-family, segment,
provider matching, route cache eða persistence breyttist.
`IcelandRoadmap.md` þarf ekki uppfærslu.

## Design.md samræmi

Engin sjónræn breyting. Navigation intent er nú skýrari og route restore
heldur app-context þegar notandi fer á milli skjáa. Núverandi loader/pending
state er áfram notað við endurútreikning.

## Localhost checks for Stebbi

Þessi áfangi breytir ekki canonical page routes enn.

1. Opna `/auth-mvp/vedrid/road-map-prototype`.
2. Reikna leið og opna Veðurstofupunkt úr Akstursgögnum.
3. Smella „Til baka í akstur“.
   - Vænt: prototype-slóðin er áfram notuð og route restore query er til
     staðar.
4. Smella conditions-feed target og fara til baka.
   - Vænt: prototype-slóð helst canonical compatibility destination.
5. Prófa saved-place sign-in CTA sem public.
   - Vænt: `next` vísar enn á prototype meðan page promotion hefur ekki farið
     fram.
6. Console:
   - engin runtime TypeError;
   - engin ný navigation loop;
   - MapLibre CSS virkar áfram með parent + child layouts.

Ekki prófa production, Supabase eða deployment.

## Næsta skref

Claude Code rýnir áfanga 1b. Ef engir blockers finnast og Stebbi gefur nýtt
framkvæmdarleyfi er næsti afmarkaði áfangi 1c:

- `/vedrid` og `/auth-mvp/vedrid` sem boundary-safe `drive` destinations í
  `pulseBack`;
- targeted tests fyrir canonical og evil/lookalike paths.

Station detail access, compatibility matrix og page promotion bíða áfram
sérstakra ákvarðana/skrefa.
