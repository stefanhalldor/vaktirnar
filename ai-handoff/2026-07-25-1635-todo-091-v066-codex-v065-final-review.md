# TODO 091 v066 — Codex loka-rýni á v065

Created: 2026-07-25 16:35  
Timezone: Atlantic/Reykjavik

## Niðurstaða

Atomic promotion-kóðinn er tæknilega samhangandi og full test/build gátt er
græn. Codex fann **engan staðfestan runtime-, auth-, RLS- eða
production-blocker** í diff-inu.

V065 er samt ekki alveg tilbúið til að afhenda Stebba í eitt loka
localhost-próf. Tvö mikilvæg ný contracts hafa engin sjálfvirk próf:

1. query-preserving legacy redirect og public/auth redirect-keðjan;
2. að `hasRoadIntelligence={false}` valdi í raun engum road-intelligence
   network-köllum eða surface UI.

Næsta skref er því stuttur test-hardening áfangi, síðan Codex loka-rýni, og
fyrst þá eitt sameinað localhost-próf hjá Stebba.

## Findings

### Medium — legacy redirect implementation er óprófuð

`app/auth-mvp/vedrid/road-map-prototype/page.tsx` er nýtt compatibility
boundary sem:

- await-ar Next.js 15 `searchParams`;
- varðveitir repeated query keys;
- redirectar public notanda á `/vedrid`;
- treystir á middleware fyrir authenticated canonicalization.

Full test suite er græn en engin testskrá vísar í
`RoadMapPrototypeLegacyPage`. Mistök í encoding, repeated params eða redirect
target myndu því ekki finnast sjálfvirkt.

**Krafa fyrir localhost handoff:** bæta targeted tests fyrir:

- tómt query → `/vedrid`;
- route restore query → nákvæmlega sama semantic query á `/vedrid`;
- repeated key varðveitist;
- special characters eru URL-encoded rétt;
- middleware authenticated `/vedrid?...` → `/auth-mvp/vedrid?...`;
- signed-out `/vedrid?...` fer í gegn;
- engin redirect loop.

Middleware-prófin ná þegar hluta keðjunnar; page redirect þarf samt eigið
test.

### Medium — capability network-silence er aðeins staðfest með kóðalestur

`RoadMapPrototypeMap` gates nú map-proxy source, segment fetch, surface fetch,
station-marker fallback og surface UI. Diff-ið lítur rétt út og API routes
eru áfram security boundary.

Engin component/test fixture renderar hins vegar kortið með
`hasRoadIntelligence={false}`. Full suite getur því ekki sannað að refactor
síðar bæti óvart gated fetch aftur inn eða að timer/moveend callback sleppi
í gegn.

**Krafa fyrir localhost handoff:** bæta eins afmörkuðu automated contract
testi og núverandi test architecture leyfir. Ef MapLibre-mock gerir slíkt
test óhóflega flókið skal Claude Code skrá það skýrt sem manual-only check og
ekki byggja brothætt fake-map test. Að lágmarki þarf localhost checklist að
krefjast Network-filteringar á öllum fjórum endpoints.

### Low — compatibility-default `true` á prop á að vera tímabundið

Báðir canonical wrappers senda capability explicit. Legacy prototype page er
nú redirect og enginn annar caller fannst. Því er ekki lengur þörf á
`hasRoadIntelligence = true` compatibility-defaulti.

Til að fail-closed hegðun haldist við framtíðar consumer ætti næsti
test-hardening áfangi að gera prop required eða default `false`.
Required prop gefur sterkari TypeScript-vörn.

### Low — útgáfu-scope má ekki innihalda `.obsidian/workspace.json`

Skráin er ótengd user-breyting og birtist í `git status`. Hún var ekki hluti
af TODO 091 og má ekki fara í commit eða vera afturkölluð.

## Það sem stenst rýni

- Public `/vedrid` er aðeins renderuð í `WEATHER_ENABLED=all` og fær road
  capability.
- Auth page varðveitir session/weather shell guards og reiknar capability
  fail-closed þegar feature-access lookup mistekst.
- Legacy prototype redirect fer á public canonical path; middleware sér um
  auth canonicalization.
- `/vedrid/ferdalagid` og authenticated counterpart eru óbreytt.
- Parent layouts hlaða MapLibre CSS og setja `viewportFit: cover`.
- Canonical public/auth `loading.tsx` skrár eru til og nota Teskeið-loader.
- `pulseBack` er boundary-safe fyrir canonical og legacy paths.
- Dauður `overview` type/consumer branch var fjarlægður.
- Engin Supabase-, RLS-, migration-, env- eða production-breyting er í
  diff-inu.

## Keyrðar release-gáttir

1. `npm.cmd run test:run`
   - Exit code 0.
   - 136 test files passed.
   - 3.607 tests passed, 27 skipped, 8 todo.
   - Tvö jsdom „Not implemented: navigation to another Document“ skilaboð,
     án test failure.
2. `npm.cmd run build`
   - Exit code 0.
   - Next.js 15.5.14 production compile, type/lint phase, 100/100 static pages
     og build traces lokið.
   - Fyrirliggjandi hook/img/caniuse warnings, engin build-villa.
3. Fyrri v065/v064:
   - targeted navigation tests 54/54;
   - type-check exit 0;
   - `git diff --check` exit 0.

Enginn dev server var ræstur eða endurræstur.

## Næsta skref

Claude Code framkvæmir einn lítinn **2-H test-hardening** áfanga:

1. targeted legacy redirect tests;
2. gera `hasRoadIntelligence` required eða fail-closed;
3. bæta capability contract test ef það er sanngjarnt með núverandi
   MapLibre mocks, annars skrá manual-only network check;
4. keyra targeted tests, full test suite, type-check, build og
   `git diff --check`;
5. skila nýju handoffi til Codex.

Eftir græna Codex-rýni fær Stebbi eitt stutt, sameinað localhost-prófunarflæði.
Stebbi þarf ekki að prófa einstaka milliskref.

## Route intelligence check

Promotion breytir consumer-slóð og capability-gating en ekki route-family,
vegkaflaþekkingu, provider matching, cache keys eða ferðagagnageymslu.
Engin ný þekking á heima í `IcelandRoadmap.md`.

## Design.md samræmi

Canonical loaders, full-height map shell, viewport-fit og capability-gating
fylgja app/mobile viðmiðum. Stebbi þarf í loka localhost-prófi sérstaklega að
staðfesta mobile overflow, tab state, browser/device back og loader feedback.

## Localhost checks for Stebbi

**Ekki nauðsynlegt strax.** Stebbi bað um að prófa aðeins þegar allar
verkfræðibreytingar væru búnar. Eftir 2-H og loka-rýni fær Stebbi eina
sameinaða checklistu sem nær yfir:

- public og authenticated canonical routes;
- legacy redirect með route restore;
- notanda með og án road-intelligence capability;
- Veðurstofu- og Vegagerðarspjöld og back navigation;
- browser/device back;
- sessionStorage route/place persistence;
- `/vedrid/ferdalagid` regression;
- mobile viewport/overflow;
- console og Network panel.

Ekki prófa production, Supabase, RLS, deploy eða raunveruleg notendagögn.

## Framkvæmdarstaða

Codex breytti engum runtime-, test-, route- eða config-skrám í þessari rýni.
Aðeins þessi review-skrá var búin til. Ekkert commit, push, deploy, migration
eða production-inngrip var gert.

