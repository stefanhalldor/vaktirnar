# TODO 086 v248 — Codex Road Intelligence core slice

Created: 2026-07-20 18:16
Timezone: Atlantic/Reykjavik
Agent: Codex
Relevant TODO: 086
Type: Implementation handoff for Claude review and next execution slice

---

## 1. Skilningur á samþykki

Stebbi bað Codex að rýna mjög vel:

- `ai-handoff/2026-07-20-1800-todo-086-v247-claude-road-intelligence-implementation-handoff.md`

og framkvæma sjálfur eins stóran fyrsta skammt og Codex treysti sér til.

Þetta var túlkað sem leyfi til afmarkaðra repo-kóðabreytinga og prófa, en ekki
leyfi fyrir commit, push, deploy, migration-keyrslu, SQL keyrslu eða production
breytingum.

---

## 2. Gagnrýnin rýni á v247 plan

Plan Claude er rétt í stóru myndinni, en of stórt sem einn fyrsti
framkvæmdarskammtur. Það blandar saman:

- SQL/schema fyrir feature access
- auth/feature-gating
- reusable route-domain kjarna
- UI rendering á `/auth-mvp/vedrid`
- messages
- tests

Codex valdi því öruggari fyrstu slísu:

- **RI-1 + RI-2 core only**
- engin SQL
- engin auth
- engin UI
- engin public eða production hegðunarbreyting

Helstu rýnipunktar fyrir næsta skref:

1. **RI-0 / feature access þarf sérstaka rýni.** `checkFeatureAccess` signature er `checkFeatureAccess(_userId, email, featureKey)`, og núverandi kallmynstur er t.d. `checkFeatureAccess('', email, key)`. Claude þarf að staðfesta nákvæma server-side notkun áður en UI flagg er tengt.
2. **Resolver matching í v247 var of hrátt.** Plan dæmið notaði `includes` á aliases. Codex útfærslan normaliserar bæði input og aliases með `slugifyPlaceKey()` svo þetta virki bæði með route-memory keys og display labels með íslenskum stöfum/bilum.
3. **`Hringvegurinn` til Akureyrar er family-level draft.** Codex bætti ekki við nýjum óstaðfestum norðurleiðarsegmenti bara til að fylla `segmentIds`. Alternative hefur tóman `segmentIds` lista og skýra note.
4. **East alternatives eru enn gróf.** `Um firðina` og `Til að sleppa við Öxi` nota nú sömu þekktu suður/east backbone stubs og `avoids: ['oxi-axarvegur']`. Þetta er nógu gott fyrir draft presentation, ekki map/routing.
5. **UI ætti ekki að koma fyrr en feature-gate og textar eru rýndir.** Næsti Claude skammtur ætti annaðhvort að gera RI-0 feature flag + tests eða litla read-only UI slísu bak við flagg, ekki bæði ef áhætta vex.

---

## 3. Hvað var framkvæmt

### Types

`lib/iceland-routes/types.ts`

Bætt við:

- `IcelandRouteAlternativeId`
- `IcelandRouteCautionId`
- `IcelandRouteAlternativeLabel`
- `IcelandRouteAlternative`
- `IcelandRouteCautionTag`
- `IcelandRouteCaution`
- `IcelandRoadIntelligenceConfidence`
- `IcelandRoadIntelligenceStatus`
- `IcelandRoadIntelligenceResult`

### Static registry

Ný skrá: `lib/iceland-routes/alternatives.ts`

Bætt við draft alternatives:

- `rvk-isafjordur-via-holmavik` — `Gegnum Hólmavík`
- `rvk-east-via-hellisheidi` — `Um Hellisheiði`
- `rvk-east-sleppa-oxi` — `Til að sleppa við Öxi`
- `rvk-east-um-firdi` — `Um firðina`
- `rvk-akureyri-hringvegurinn` — `Hringvegurinn`

Ný skrá: `lib/iceland-routes/cautions.ts`

Bætt við draft cautions:

- `hellisheidi-vindnaemt`
- `hellisheidi-fjallvegur`
- `oxi-lokad-kann`
- `oxi-fjallvegur`
- `oxi-eftirvagn`
- `holmavik-vindnaemt`
- `threngsli-fjallvegur`

### Pure resolver

Ný skrá: `lib/iceland-routes/roadIntelligenceResolver.ts`

Bætt við:

- `resolveRoadIntelligence(fromPlaceKey, toPlaceKey)`

Eiginleikar:

- pure function
- bidirectional matching
- notar `ROUTE_FAMILIES`
- normaliserar input og aliases með `slugifyPlaceKey`
- skilar `unknown` ef ekkert family passar
- skilar `resolved` með alternatives og segment-derived cautions ef family passar
- kallar ekki Google, Supabase, Veðurstofu, Vegagerð eða network provider

### Exports

`lib/iceland-routes/index.ts`

- `ICELAND_ROUTES_FOUNDATION_VERSION` hækkað úr `0.3.0` í `0.4.0`.
- Exportaði nýjar types, registries og resolver.

### Docs

`lib/iceland-routes/README.md`

- Uppfært current scope til að nefna alternatives, cautions og static resolver.

`IcelandRoadmap.md`

- Bætt við R1 stöðu um static Road Intelligence registry.
- Uppfært skráalista til að innihalda nýju skrárnar.
- Tekið fram að þetta er án Google kalla, Supabase skrifa og production hegðunarbreytinga.

### Tests

Ný skrá:

- `lib/__tests__/iceland-routes-road-intelligence.test.ts`

Tests ná yfir:

- unique ASCII-safe IDs
- draft/unverified alternatives
- Reykjavík → Egilsstaðir: 3 alternatives + Hellisheiði/Öxi cautions
- bidirectional Egilsstaðir → Reykjavík
- display labels með íslenskum stöfum: Reykjavík → Ísafjörður
- Reykjavík → Akureyri: Hringvegurinn
- aliases með bilum: Reykjavík → Vík í Mýrdal
- unknown pör: Akureyri → Egilsstaðir og Reykjavík → Þykkvabæjarklaustur

---

## 4. Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/2026-07-20-1800-todo-086-v247-claude-road-intelligence-implementation-handoff.md`
- `ai-handoff/README.md`
- `lib/iceland-routes/types.ts`
- `lib/iceland-routes/segments.ts`
- `lib/iceland-routes/routeFamilies.ts`
- `lib/iceland-routes/lensTypes.ts`
- `lib/iceland-routes/lensResolver.ts`
- `lib/iceland-routes/routePlaceNormalization.ts`
- `lib/iceland-routes/index.ts`
- `lib/iceland-routes/README.md`
- `lib/__tests__/iceland-routes-segments.test.ts`
- `lib/__tests__/iceland-routes-lens.test.ts`
- `lib/loans/guard.ts`
- `app/auth-mvp/vedrid/page.tsx`

---

## 5. Skrár sem voru breyttar eða bættar við

Breytt:

- `IcelandRoadmap.md`
- `lib/iceland-routes/README.md`
- `lib/iceland-routes/index.ts`
- `lib/iceland-routes/types.ts`

Bætt við:

- `lib/iceland-routes/alternatives.ts`
- `lib/iceland-routes/cautions.ts`
- `lib/iceland-routes/roadIntelligenceResolver.ts`
- `lib/__tests__/iceland-routes-road-intelligence.test.ts`
- `ai-handoff/2026-07-20-1816-todo-086-v248-codex-road-intelligence-core-done.md`

Ótengt dirty/untracked sem var til staðar eða kom ekki frá þessari core slísu:

- `.obsidian/workspace.json`
- `ai-handoff/2026-07-20-1800-todo-086-v247-claude-road-intelligence-implementation-handoff.md`

---

## 6. Skipanir sem voru keyrðar

Read-only / skoðun:

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'Design.md'`
- `Get-Content -Encoding UTF8 'IcelandRoadmap.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\\2026-07-20-1800-todo-086-v247-claude-road-intelligence-implementation-handoff.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\\README.md'`
- `Get-ChildItem -File 'lib\\iceland-routes'`
- `Get-Content` á afmarkaðar línusneiðar í route-domain og test skrám
- `rg` leit í route-domain, guard og `/auth-mvp/vedrid`
- `git status --short`
- `git diff --stat`
- `git diff --check`
- `Get-Date -Format "yyyy-MM-dd HH:mm"`

Validation:

- `npm run type-check`
- `npm run test:run -- iceland-routes-road-intelligence`
- `npm run test:run -- iceland-routes`
- `npm run build`

File edits:

- `apply_patch`

---

## 7. Niðurstöður og exit codes

- `npm run type-check` — exit code `0`
- `npm run test:run -- iceland-routes-road-intelligence` — exit code `0`
  - 1 test file passed
  - 8 tests passed
- `npm run test:run -- iceland-routes` — exit code `0`
  - 3 test files passed
  - 50 tests passed
- `npm run build` — exit code `0`
  - compiled successfully
  - generated 93 static pages
  - build warnings voru fyrirliggjandi lint warnings, m.a. í `WeatherOverviewClient.tsx`, `TravelAuditMap.tsx`, `IcelandOverviewMap.tsx`, `app/s/[sessionId]/page.tsx` og `components/landing/Avatar.tsx`
- `git diff --check` — exit code `0`
  - aðeins LF/CRLF warnings, engar whitespace villur

---

## 8. Hvað var ekki gert

- Engin SQL migration var skrifuð.
- Engin SQL migration var keyrð.
- `sql/89_feature_access_road_intelligence_v1.sql` var ekki búin til.
- `lib/loans/guard.ts` var ekki breytt.
- `app/api/admin/feature-access/route.ts` var ekki breytt.
- `/auth-mvp/vedrid` UI var ekki breytt.
- `messages/is.json` og `messages/en.json` voru ekki breytt.
- Enginn dev server var ræstur.
- Engin browserpróf voru keyrð.
- Enginn commit, push eða deploy.

---

## 9. Ákvarðanir sem Codex tók

- Byrjaði á provider-neutral core þar sem það er öruggasti foundation skammturinn.
- Forðaðist SQL/auth/UI í fyrsta skammti til að minnka blast radius.
- Normaliseraði aliases með `slugifyPlaceKey()` til að styðja bæði route-memory keys og display labels.
- Lét `Hringvegurinn` alternative hafa tóman `segmentIds` lista frekar en að búa til of víðan, óstaðfestan segment stub.
- Setti `verified: false` á alla first-pass alternatives.
- Setti Road Intelligence result `confidence: 'draft'` þar til data/UX hafa verið yfirfarin betur.
- Uppfærði `IcelandRoadmap.md` því breytingin bætir raunverulegri route-domain þekkingu í `lib/iceland-routes/`.

---

## 10. Áhætta sem er enn til staðar

- `Um firðina` og `Til að sleppa við Öxi` eru enn grófar alternatives. Þær eru nógu góðar sem draft-presentation, ekki sem routing/map source.
- Cautions eru derived úr `segmentIds + avoids`. Það þýðir að Öxi cautions birtast fyrir east family af því alternatives vísa í avoided Öxi. UI þarf að orða þetta varlega.
- `Hringvegurinn` til Akureyrar er ekki segment-driven ennþá. Næsta route-domain slís ætti að bæta við norðurleiðar backbone segmentum þegar þau eru skilgreind.
- `resolveRoadIntelligence()` skilar `resolved` fyrir þekkt route family jafnvel þótt alternatives séu tómar, t.d. South Coast í þessari fyrstu slísu. UI þarf að ákveða hvort það sýnir unknown, empty panel eða bara felur panel.
- Feature flag / auth er óútfært. Það má ekki tengja UI við þetta án RI-0 gate.

---

## 11. Tillaga að næsta Claude skrefi

Mælt næsta skref: **RI-0 feature flag + tests**, áður en UI er tengt.

Claude ætti að:

1. Búa til `sql/89_feature_access_road_intelligence_v1.sql` með öllum núverandi feature keys + `road-intelligence-v1`.
2. Bæta `road-intelligence-v1` við `lib/loans/guard.ts` með env gate:
   - `ROAD_INTELLIGENCE_V1_ENABLED === 'true'`
   - síðan `checkPerUserAccess(email, 'road-intelligence-v1')`
3. Skoða `app/api/admin/feature-access/route.ts` og uppfæra allowed keys ef þar er whitelist.
4. Bæta guard tests.
5. Ekki keyra SQL. Stebbi þarf sérstakt leyfi fyrir migration execution.

Eftir það má taka **RI-3 read-only UI bak við flagg** sem sér skammt.

---

## 12. Spurningar sem Claude á sérstaklega að rýna

- Er type contractið of stórt eða passlega lítið fyrir fyrsta Road Intelligence core?
- Er `resolved` með tómar alternatives rétt fyrir South Coast, eða á resolver að skila `unknown` þegar family er til en engin alternatives/cautions eru til?
- Á `ICELAND_ROAD_CAUTIONS` að innihalda cautions fyrir `avoids`, eða þarf resultið að aðgreina `activeCautions` og `avoidedCautions` áður en UI kemur?
- Er tómt `segmentIds` á `rvk-akureyri-hringvegurinn` ásættanlegt sem draft, eða á næsti skammtur fyrst að bæta við norðurleiðarsegmentum?
- Á `IcelandRoadmap.md` að vera enn ítarlegra uppfært fyrir R1 áður en RI-3 UI fer í gang?

---

## 13. Supabase / SQL áhrif

Engin SQL-skrá var skrifuð eða keyrð í þessum skammti.

Engin breyting á:

- Supabase schema
- RLS
- grants
- auth policies
- service role
- production gögnum
- notendagögnum

Road Intelligence core er static TypeScript registry + pure resolver.

---

## 14. Localhost checks for Stebbi

Þessi skammtur hefur enga notendasýnilega UI-breytingu ennþá. Það er því ekkert
nýtt panel á `/vedrid` eða `/auth-mvp/vedrid` sem Stebbi getur prófað í browser
eftir þennan skammt einan og sér.

Það sem Stebbi má samt sannreyna á localhost eftir að Claude hefur rýnt:

1. Keyra ekki SQL fyrir þennan skammt.
2. Opna `/vedrid` og `/auth-mvp/vedrid`.
3. Velja nokkur route-memory pör eins og Reykjavík → Egilsstaðir.
4. Staðfesta að núverandi kort, route picker, route variant pillur og WeatherWatchers hegðun hafi ekki breyst.
5. Staðfesta að ekkert nýtt `Teskeið þekkir þessar leiðir` panel birtist ennþá. Það á að bíða eftir feature flag/UI skammti.

Expected:

- Engin ný visible UI breyting.
- Engin console villa vegna route-domain imports.
- Núverandi `/vedrid` hegðun helst óbreytt.

Varúð:

- Ekki bæta `road-intelligence-v1` feature access röð í production fyrr en SQL89 og guard hafa verið samþykkt og keyrð með sérstöku leyfi.

---

## 15. Route intelligence check

- Snertir route families:
  - `capital-east-iceland`
  - `capital-westfjords`
  - `capital-north-iceland`
  - `capital-south-coast` í resolver test, en án alternatives ennþá
- Snertir segments:
  - `ring-road-hellisheidi`
  - `ring-road-vik-west`
  - `ring-road-vik-east`
  - `oxi-axarvegur`
  - `holmavik-sudurleid`
  - `threngsli`
- Ný route-domain þekking fór í `lib/iceland-routes/` og `IcelandRoadmap.md`.
- Lausnin er provider-neutral. Hún er ekki bundin Google Routes, Veðurstofunni eða Vegagerðinni.
- Engin raw route geometry, Google place IDs, heimilisföng eða persónulegar ferðir eru geymd.
- Engin segment-interest talning, cache eða Supabase persistence var bætt við.
- Google Routes er ekki notað.

---

## 16. Óvissa / þarf að staðfesta

Confidence: medium-high fyrir core TypeScript og tests.

Óvissa er mest product/UX megin:

- hvernig UI á að greina milli cautions á valinni leið og cautions á leið sem alternative forðast
- hvort `Hringvegurinn` án segmenta sé nógu gagnlegt í fyrsta flagged UI
- hvort `resolved` með tómar alternatives sé rétt fyrir South Coast family

Engin þessara óvissa blokkar core slísuna, en þær eiga að blokka UI útgáfu þar til Claude og Stebbi hafa tekið ákvörðun.
