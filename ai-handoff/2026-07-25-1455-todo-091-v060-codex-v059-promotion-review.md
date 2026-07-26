# TODO 091 v060 — Codex review á v059

Created: 2026-07-25 14:55  
Timezone: Atlantic/Reykjavik

## Niðurstaða

**Ekki hefja page promotion enn.**

Áfangi 1c er tæknilega boundary-safe og targeted prófin eru græn, en v059
innleiðir tímabundið rangt notendaviðmót á núverandi canonical veðursíðum og
skilur fjórar mikilvægar promotion-ákvarðanir eftir óleystar. Áfangi 2 á því
ekki að fara af stað fyrr en Claude Code hefur leiðrétt 1c sequencing og
skilað afmörkuðu promotion-plani sem leysir atriðin hér að neðan.

## Findings

### High — 1c breytir merkingu virkra `/vedrid`-leiða áður en promotion á sér stað

`lib/weather/pulseBack.ts:38-45` flokkar nú bæði `/vedrid` og
`/auth-mvp/vedrid` sem `drive`. Þær síður rendera hins vegar enn
`WeatherOverviewClient`:

- `app/vedrid/page.tsx`
- `app/auth-mvp/vedrid/page.tsx`

Bæði Veðurstofu- og Vegagerðarspjöld sýna texta eftir `kind`:

- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:69-75`
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx:86-92`

Afleiðingin er að notandi sem kemur frá núverandi spákorti fær
„Til baka í akstur“. V059 kallar þetta sjálft mismatch sem lagist í áfanga 2,
en staged breyting á að vera sjálfstætt rétt og örugg. Hún má ekki treysta á
óframkvæmdan seinni áfanga.

**Krafa:** Annaðhvort:

1. halda canonical leiðunum sem `overview` þar til promotion og flytja
   semantic breytinguna inn í sama atomic promotion-skref; eða
2. ef breytingarnar eiga allar í sama óaðskiljanlega commit, skrá og prófa
   skýrt að 1c má ekki commit-a/deploya eitt og sér.

Fyrri kosturinn er einfaldari og öruggari í ócommittuðu localhost-flæði.

### High — v059 biður um framkvæmd á áfanga 2 en skilgreinir fjóra óleysta blockers

V059 telur sjálft upp:

1. óstaðfest `hasRoadIntelligence` access contract;
2. mögulega tapaðar `WeatherOverviewClient` props;
3. óákveðna framtíð `/vedrid/ferdalagid`;
4. óleyst query-preserving prototype redirect.

Þetta eru ekki eftirá-review atriði. Þau ákvarða auth/access, feature
availability, backward compatibility og navigation-state. Page promotion má
ekki hefjast fyrr en þau hafa verið rakin í raunverulegum consumers og
ákvörðun skráð fyrir hvert atriði.

Sérstaklega má ekki gera ráð fyrir að `RoadMapPrototypeMap` hafi sama
road-intelligence access contract og núverandi server-side
`checkFeatureAccess()` bara af því componentinn framkvæmir eigin API köll.

### Medium — `overview` er orðið óframleiðanlegt en er áfram hluti af public type

`lib/weather/pulseBack.ts:17-22` heldur `overview` í
`PulseBackDestination`, en resolverinn skilar því ekki lengur. Consumers halda
samt áfram unreachable `overview` branch.

Þetta felur semantic breytinguna og gerir exhaustive type checking minna
gagnlegt. Ef canonical leiðir eiga tímabundið áfram að vera overview leysist
þetta. Ef promotion er atomic þarf að fjarlægja `overview` úr type og
consumer-branches þegar engin gild leið getur lengur skilað því.

### Medium — handoff-tími v059 stenst ekki repository hard rule

V059 segir `Created: 2026-07-25 15:00`, en Codex keyrði staðartímaskipun við
rýnina kl. `14:55`. Skráin var því merkt með framtíðartíma. Þetta hefur ekki
runtime-áhrif en brýtur rekjanleika- og filename-reglu `WORKFLOW.md`.

Claude Code þarf að keyra raunverulega tímaskipun rétt áður en næsta handoff
er skrifað og nota úttakið óbreytt.

## Það sem stenst rýni

- Exact/query/hash matching á canonical leiðunum er boundary-safe.
- `/vedrid-anything` og prototype lookalike eru hafnað.
- External og protocol-relative URL eru áfram hafnað.
- Prototype compatibility path er áfram samþykkt.
- Targeted test run:
  - `lib/__tests__/pulseBack.test.ts`
  - `lib/__tests__/road-map-navigation.test.ts`
  - `lib/__tests__/pulseTarget.test.ts`
  - **54/54 tests passed, exit code 0.**

## Næsta afmarkaða skref fyrir Claude Code

Ekki framkvæma page promotion strax. Fyrst:

1. Leiðrétta 1c sequencing svo virkar overview-leiðir haldi réttri merkingu
   fyrir promotion.
2. Rekja og skjalfesta raunverulegt `hasRoadIntelligence` contract í
   `RoadMapPrototypeMap` og API routes.
3. Búa til prop/behavior compatibility matrix milli
   `WeatherOverviewClient` og `RoadMapPrototypeMap`.
4. Ákveða og prófa að `/vedrid/ferdalagid` haldist óbreytt í þessum áfanga,
   nema Stebbi samþykki annað sérstaklega.
5. Hanna query-preserving legacy redirect með tests fyrir public og auth,
   án redirect loop.
6. Skila nýju review/implementation handoffi. Ekki breyta page routes fyrr en
   Stebbi gefur skýrt, afmarkað framkvæmdarleyfi fyrir promotion.

## Route intelligence check

Engri route-family, vegkaflaþekkingu, provider matching, route cache eða
persónulegum ferðagögnum var breytt í rýninni. Þetta er navigation- og
promotion-contract vinna, þannig að `IcelandRoadmap.md` þarf ekki uppfærslu.

## Design.md samræmi

Finding 1 er bein UX-regression: navigation-label verður að lýsa skjánum sem
notandi fer aftur á. Að láta rangan texta lifa milli áfanga samræmist ekki
skýru app-navigation feedbacki í `Design.md`.

## Localhost checks for Stebbi

Áður en page promotion er samþykkt:

1. Opna núverandi `/vedrid` sem public notandi.
2. Opna Veðurstofustöð og skoða back-link.
   - Núverandi vænt hegðun fyrir promotion: „Til baka í spákort“.
3. Endurtaka frá `/auth-mvp/vedrid` sem innskráður notandi.
   - Núverandi vænt hegðun fyrir promotion: „Til baka í spákort“.
4. Opna stöð úr
   `/auth-mvp/vedrid/road-map-prototype?context=route&view=map&restoreRoute=1`.
   - Vænt: „Til baka í akstur“ og sama leið/view endurheimtist.
5. Fylgjast með að engin redirect loop, auth-bypass eða tapað query-state
   komi fram.

Ekki prófa production, deploy, Supabase, RLS eða notendagögn. Engin slík
aðgerð var framkvæmd í þessari rýni.

## Framkvæmdarstaða

Codex breytti engum runtime-, test-, route- eða config-skrám í þessari rýni.
Aðeins þessi review-skrá var búin til. Ekkert commit, push, deploy, migration
eða production-inngrip var gert.

