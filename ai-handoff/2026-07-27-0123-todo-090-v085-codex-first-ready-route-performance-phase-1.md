# TODO-090 — first-ready route performance, áfangi 1

**Staða:** Tilbúið fyrir localhost smoke hjá Stebba og síðan code review hjá Claude Code. Ekki commit-að, push-að eða deployað.

**Umfang:** Notendur með `teskeid-routing-v1` fá Google og Teskeiðarleið ræstar samhliða og niðurstöðusvæðið opnast þegar fyrri gild leiðin er tilbúin. Notendur án flaggs halda Google-only flæðinu. Engin Supabase-, Vercel- eða production-aðgerð var framkvæmd.

## 1. Plan áfangans

1. Aðskilja provider-discovery frá veðurútreikningi og ræsa leyfða providers samhliða.
2. Láta fyrstu gildu leið vinna án þess að síðkominn provider geti auto-switchað eða yfirskrifað notandaval.
3. Flytja route geometry örugglega frá discovery yfir í `/travel` svo ekki þurfi að sækja sömu Google- eða Teskeiðarleið aftur.
4. Halda feature gates, kill switch, rate limits og route-intelligence öryggisgáttum óbreyttum.
5. Vernda gegn stale responses, clear/new-submit race og útrunnum route payloads.
6. Loka privacy-áhættu þar sem eldri Google route IDs með sampled hnitum gætu annars birst í opinni route-memory leit.
7. Staðfesta með focused prófum, fullri test suite, type-check og production build.

## 2. Hvað var raunverulega gert

### Provider-neutral first-ready orchestration

- Nýr hreinn coordinator heldur utan um provider-stöður, winner, birtingarröð og manual selection.
- Bæði `discover()` föll eru kölluð samstundis áður en niðurstöður þeirra eru observeraðar.
- Fyrsta gilda provider-niðurstaðan verður winner og opnar niðurstöðuflæðið strax.
- Síðkomin provider-niðurstaða sameinast leiðavalinu en breytir hvorki winner, preview, focus né notandavali.
- Google `DEFAULT_ROUTE` er áfram sjálfgefið Google-val þótt Google leiðir séu birtar í duration-röð.
- Ef annar provider bregst getur hinn samt lokið flæðinu. Ef báðir bregðast fæst sameiginlegt error-state.

### Client-flæði

- Flagged notandi ræsir `/travel/routes` og `/travel/route-candidate` samhliða.
- Non-flagged notandi ræsir aðeins Google `/travel/routes`; enginn Teskeiðartexti eða candidate-kall lekur yfir gate.
- Um leið og fyrsta signed route envelope kemur:
  - niðurstöðusvæðið birtist,
  - leiðin kemur á kortið,
  - provider-neutral pending texti sýnir hvaða leið sé tilbúin,
  - nákvæmlega eitt `/travel` veðurmat hefst fyrir winner.
- Sérstakir `AbortController`-ar og run ID verja discovery, veðurmat, alternatives, clear, nýtt submit og unmount gegn stale state.
- Síðkominn provider sameinast án auto-switch.
- Manual route switch notar envelope áfram og gerir eitt nýtt `/travel` kall.
- Envelope er endurnýjað provider-sértækt ef minna en 60 sekúndur eru eftir eða ef server hafnar því; retry er aðeins einu sinni.
- Kortastækkun og preview/apply controls birtast ekki fyrr en veðurmati er lokið. Þar með er enginn virkur en dauður „Stækka kort“-hnappur í pending state.

### Signed route envelope

- Nýtt server-only, domain-separated HMAC-SHA256 envelope notar núverandi `AUTH_CODE_SECRET`.
- Secret þarf að vera minnst 32 bytes; first-ready flæðið failar lokað ef undirritun eða sannprófun er ekki tiltæk.
- TTL er 15 mínútur og ekki má gefa út lengra envelope.
- Sannprófun notar canonical JSON, `timingSafeEqual`, nákvæma origin/destination binding og stranga bounded `RouteOption` validation.
- Venjulegt first-ready flæði kallar provider aðeins einu sinni: `/travel` notar staðfesta geometry úr envelope í stað þess að endurreikna Google eða Teskeiðarleið.
- Teskeiðar-envelope fer samt aftur í gegnum bæði global `TESKEID_ROUTE_CANDIDATE_ENABLED` gate og per-user `teskeid-routing-v1` gate á final submit.
- Tampered, expired, endpoint-mismatched eða conflicting envelope skilar `422 route_envelope_invalid`.

### API, kostnaður og bakgrunnsvinna

- `/travel/routes` getur skilað signed envelopes. Nýja client-flæðið biður um compact envelope response svo geometry sé ekki tvítekin í `routes` og `routeEnvelopes`.
- `/travel/route-candidate` gerir hið sama fyrir Teskeiðarleið.
- Analytics eru sett í `after()` þar sem við á svo þau haldi ekki first-ready response opnu.
- Google `/routes` heldur eina public abuse/rate-limit talningu. Strictly authenticated og per-user gated candidate-endpoint tvítelur ekki sama samhliða submit í sameiginlega guest-kvótann.
- Enginn nýr beinn Google-kostnaður var kynntur. Normal path fækkar tvíteknum provider-köllum.

### Route-memory concurrency og privacy

- Compact first-ready `/routes` response sleppir route-memory warming. Final `/travel` er canonical writer svo samhliða writers yfirskrifi ekki metadata hvors annars.
- Final writer varðveitir curated label og caution IDs.
- Raw Google route IDs eru ekki lengur vistuð. Ný non-curated identity er `provider:routeIndex`, t.d. `google:0` eða `teskeid:-2`; curated public labels halda `CURATED_*` identity.
- `provider:index` er öruggt sem latest provider-slot cache en á ekki síðar að nota sem varanlegt geographic route-family ID í longitudinal analytics, því provider getur endurraðað alternatives.
- Opin route-memory lookup sía nú fail-closed allar eldri variant-lyklategundir nema:
  - `default`,
  - canonical og bounded `google|mapbox|teskeid:<index>`,
  - öruggt `CURATED_*` identity.
- Public `routeKey` er alltaf endurbyggður úr normaliseruðum request-place keys og öruggu variant identity. Eldra coordinate-bearing DB `route_key` eða `route_variant_key` fer því aldrei yfir public API boundary.
- Eldri unsafe raðir kunna enn að vera í gagnagrunni en eru nú ólesanlegar í public response. Read-only talning og möguleg cleanup mega vera sérverkefni síðar og krefjast sérstaks leyfis.

## 3. Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `AGENTS.md`
- `Design.md`, sérstaklega mobile app, pending feedback og controls
- `IcelandRoadmap.md`, sérstaklega routing gates, snapshot/LKG og production öryggisreglur
- `ai-handoff/README.md`
- Fyrri TODO-090/TODO-091 prerelease og release handoff, m.a. v072, v080–v084
- Núverandi route APIs, route-memory server logic, provider types, candidate graph logic, feature guards, tests og translations

## 4. Skrár sem voru breyttar í þessum áfanga

### Kóði

- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route-candidate/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/route-memory/lookup/route.ts`
- `lib/iceland-routes/firstReadyCoordinator.ts` — ný
- `lib/iceland-routes/firstReadyDiscovery.ts` — ný
- `lib/iceland-routes/routeOptionEnvelope.server.ts` — ný
- `lib/iceland-routes/routeMemoryVariant.ts` — ný
- `messages/is.json`
- `messages/en.json`

### Próf

- `lib/__tests__/iceland-routes-first-ready-coordinator.test.ts` — ný
- `lib/__tests__/iceland-routes-first-ready-discovery.test.ts` — ný
- `lib/__tests__/route-option-envelope.test.ts` — ný
- `lib/__tests__/route-memory-variant.test.ts` — ný
- `lib/__tests__/weather-route-candidate-api.test.ts`
- `lib/__tests__/weather-routes-api.test.ts`
- `lib/__tests__/weather-travel-api.test.ts`

### Handoff

- `ai-handoff/2026-07-27-0123-todo-090-v085-codex-first-ready-route-performance-phase-1.md` — þessi skrá

## 5. Fyrri ócommittaðar breytingar sem voru varðveittar

Eftirfarandi voru til staðar úr fyrri authorized worst-point áfanga eða frá Stebba og eru ekki ný first-ready vinna:

- `.obsidian/workspace.json` — breyting Stebba; ósnert af Codex.
- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/DriveRouteMap.tsx`
- `lib/__tests__/drive-journey-panel-ui.test.tsx`
- `ai-handoff/2026-07-26-2253-todo-091-v084-codex-worst-point-selection-restored.md`
- `components/weather/RoadMapPrototypeMap.tsx` inniheldur líka fyrri `routeSelectionContextKey` worst-point breytingu; hún var varðveitt en skráin skarast við first-ready vinnuna.

Claude Code má ekki afturkalla þessar breytingar við review eða commit-skiptingu.

## 6. Skipanir sem voru keyrðar og niðurstöður

### Lokastaðfesting

- `npm run type-check`
  - Exit code 0.
- Focused Vitest, 8 skrár sem ná yfir coordinator, discovery, envelope, route-memory privacy og þrjú API-flæði.
  - Exit code 0.
  - 8/8 test files passed.
  - 111/111 tests passed.
- `npm run test:run`
  - Exit code 0.
  - 165 files passed, 1 skipped.
  - 3.854 tests passed, 28 skipped, 8 todo; samtals 3.890.
- `npm run build`
  - Exit code 0.
  - Next.js 15.5.14 production build compiled successfully.
  - 105/105 static pages generated.
- `git diff --check`
  - Exit code 0.
  - Aðeins line-ending viðvaranir fyrir working-copy skrár; engin whitespace-villa.

### Read-only greining

- `rg`, `Get-Content`, `git status --short`, `git diff`, `git diff --stat` og handoff-listun voru notuð til að rekja flæði, contracts og dirty worktree.
- Dev server var hvorki ræstur né endurræstur.

### Build warnings sem voru þegar til staðar

- React hook dependency warnings í nokkrum components.
- Eitt `<img>`/LCP warning.
- `caniuse-lite`/Browserslist er um sex mánaða gamalt.

Engin þessara viðvarana varð að build error og ekkert þeirra var stækkað yfir í ótengdan lagfæringarpakka.

## 7. Hvað mistókst eða var sleppt

- Fyrsta intermediate type-check fann type narrowing í envelope-helper; það var lagað áður en lokapróf voru keyrð.
- Fyrsta API-prófunarlota hafði test-fixture endpoint fields sem pössuðu ekki exact envelope binding; fixtures voru leiðréttar.
- Tvær intermediate assertions voru uppfærðar eftir að compact contract og canonical writer voru staðfest.
- Ein `apply_patch` tilraun fann ekki gamalt context og gerði enga breytingu; patch var síðan settur á rétt núverandi context.
- Engin browser automation var keyrð. Raunverulegur first-ready tími, scroll/focus og mobile behavior þurfa localhost smoke hjá Stebba.
- Engin performance phase 2 mæling eða cold graph optimization var framkvæmd í þessum áfanga.

## 8. Ákvarðanir sem Codex tók

- First-ready er provider-neutral; enginn provider fær hardcoded sigur.
- Google `DEFAULT_ROUTE`, ekki endilega hraðasta alternative, er automatic Google choice.
- Winner breytist aldrei vegna late provider response; aðeins skýrt notandaval má skipta um leið.
- Non-flagged notendur eru Google-only og fá hvorki Teskeiðar-teaser né candidate request.
- Existing `AUTH_CODE_SECRET` er notað með domain separation í stað nýs secret/env-variable.
- Envelope er signed capability, ekki encryption; route geometry er þegar ætlað viðkomandi client en má ekki breyta því óuppgötvað.
- Final `/travel` er eini route-memory writer í compact first-ready flow.
- Public route-memory lestrarlagið failar lokað fyrir óþekkta legacy key formats.
- `provider:index` er aðeins latest cache identity, ekki framtíðar analytics identity.

## 9. Öryggi, route intelligence og eftirstandandi áhætta

- Engin breyting var gerð á graph validation thresholds, golden routes, connectivity gate, LKG promotion eða snapshot storage.
- Global candidate kill switch og per-user flag eru bæði endurstaðfest í final `/travel` áður en Teskeiðar-envelope er notað.
- Engin raw Google geometry eða coordinate-bearing route ID er skrifuð með nýja flæðinu.
- Legacy coordinate-bearing route-memory rows geta verið áfram í DB en public read boundary lokar þeim nú. Cleanup er ekki release-blocker en ætti að vera sérlega authorized hygiene-verkefni.
- Teskeiðarleið getur enn verið hæg á cold graph/runtime path. First-ready kemur henni fyrr á skjá ef hún vinnur, en tryggir ekki að hún vinni Google í hvert skipti.
- Signed envelope gildir í allt að 15 mínútur. Notandi sem velur leið eftir langa bið getur séð eitt provider refresh; þetta er viljandi fail-closed hegðun.
- Candidate endpoint er ekki lengur tvítalinn í sameiginlega guest IP kvótanum. Hann er áfram authenticated, strict per-user gated og undir graph/runtime budget-vörnum. Ef almenn útgáfa verður síðar þarf að endurmeta sértækan per-user abuse limiter.
- Component-level first-ready integration er að mestu tryggð með pure coordinator/discovery og API contract tests; full browser automation er enn prófunargat.

Tvær óháðar lokarýnir fundu enga eftirstandandi release-blockera eftir pending-control og public route-memory varnarlagfæringarnar.

## 10. Supabase, auth, RLS og production áhrif

- Engin SQL-skrá var skrifuð.
- Engin migration var keyrð.
- Engin breyting var gerð á schema, RLS, grants, policies, auth eða service-role functions.
- Engin production gögn voru lesin, breytt eða hreinsuð.
- Kóðinn breytir route-memory skrifhegðun eftir framtíðar deploy en framkvæmdi engin skrif í þessari vinnu.
- Eldri unsafe route-memory rows voru ekki hreinsaðar; slík hreinsun þarf sérstakt framkvæmdarleyfi og afmarkað SQL review.

## 11. Vercel, secrets og deployment

- Engin Vercel-stilling var lesin eða breytt.
- Ekkert env var var bætt við.
- Núverandi production `AUTH_CODE_SECRET` verður að vera áfram til staðar og minnst 32 bytes, eins og gildandi auth contract gerir þegar ráð fyrir.
- Ekkert commit, push eða deploy var framkvæmt.

## 12. Localhost checks for Stebbi

Notaðu `http://localhost:3004/auth-mvp/vedrid` með dev servernum sem þú keyrir sjálfur. Prófaðu helst fyrst með notanda sem hefur `teskeid-routing-v1`, síðan eitt Google-only próf án flaggs ef það er handhægt.

### A. Stóri flagged first-ready smoke pakkinn

1. Gerðu hard refresh og opnaðu Akstur.
2. Veldu t.d. **Reykjavík → Ísafjörður** og sendu leiðina einu sinni.
3. Fylgstu með kortinu og Network-flipanum.

Vænt niðurstaða:

- Google `/travel/routes` og Teskeið `/travel/route-candidate` byrja mjög nálægt hvort öðru.
- Niðurstöðusvæðið opnast um leið og fyrri gilda leiðin kemur, ekki eftir að báðir providers klára.
- Texti á borð við „Google-leið er tilbúin. Reikna veðurskilyrði…“ eða Teskeiðar-samsvörun sést á meðan `/travel` vinnur.
- Fyrsta leiðin birtist strax á kortinu.
- Nákvæmlega eitt upphaflegt `/travel` kall fer af stað fyrir winner.
- Síðkominn provider bætist við route cards án þess að kortið hoppi, scroll breytist eða valin leið skiptist sjálfkrafa.
- Google automatic choice er Google-leiðin merkt `DEFAULT_ROUTE`, ekki bara hraðasta alternative.

### B. Warm repeat og Teskeiðarhraði

1. Hreinsaðu leiðina.
2. Sendu sömu leið aftur eða prófaðu öfuga átt.

Vænt niðurstaða:

- Warm Teskeiðarleið ætti almennt að koma mun fyrr en cold leið.
- Ef Teskeið vinnur birtist hún og veðurmat hennar áður en Google kemur.
- Ef Google vinnur opnast Google strax; Teskeið bætist inn síðar án auto-switch.

Phase 1 tryggir first-ready hegðun, ekki að Teskeið sigri Google í öllum keyrslum. Cold performance er næsti séráfangi.

### C. Manual route choice

1. Bíddu þar til báðir providers/leiðakort sem eiga að birtast eru komin.
2. Veldu aðra leið og staðfestu valið.

Vænt niðurstaða:

- Valin leið verður preview og síðan applied route.
- Eitt nýtt `/travel` kall fer af stað.
- Provider er ekki sóttur aftur ef envelope er enn ferskt; provider refresh má aðeins sjást eftir langa bið eða server rejection.
- Engin gömul leið eða veðurspjald kemur aftur eftir nýja valið.

### D. Stale/clear smoke

1. Sendu leið A.
2. Hreinsaðu strax eða sendu leið B áður en A klárast.

Vænt niðurstaða:

- Niðurstaða A má aldrei birtast yfir B.
- Engin late provider niðurstaða má enduropna hreinsað route surface.
- Enginn dauður „Stækka kort“-hnappur sést meðan veðurmat er pending; hnappurinn birtist þegar kortið er fullgilt.

### E. Non-flagged regression

Með notanda án `teskeid-routing-v1`:

- aðeins Google `/travel/routes` er kallað,
- niðurstöður opnast þegar Google-leið er tilbúin,
- ekkert `/travel/route-candidate` kall, Teskeiðartexti eða Teskeiðarleiðakort birtist.

### F. UI regression sem þarf að líta yfir

- Rétti fulli varúðartextinn er áfram til staðar.
- Versti punktur er valinn sjálfkrafa eftir veðurmat og birtist undir korti.
- Notandavalinn punktur kemur í stað versta punktsins.
- „Stækka kort“ virkar eftir að niðurstaða er tilbúin.
- Mobile skjár fær ekki page-level lárétt overflow, óvænt zoom, focus-jump eða fastan loader. Route-card röðin má sjálf scrolla lárétt.

### Öryggis- og gagnavarúð við localhost

- Ekki keyra admin road-graph refresh, SQL eða Supabase cleanup sem hluta af þessu smoke-prófi.
- Localhost kann að nota ytri Google/Supabase þjónustur samkvæmt `.env.local`; sendu hverja prófleið aðeins eins oft og þarf svo prófið valdi ekki óþarfa API-notkun.
- Ekki breyta feature flags eða production env án sérleyfis.

## 13. Tillaga að næsta skrefi

1. Stebbi keyrir smoke A–F og skráir aðeins frávik.
2. Claude Code rýnir diffið, sérstaklega punktana hér fyrir neðan.
3. Ef localhost smoke og Claude review eru græn má Claude, eftir skýrt leyfi Stebba, sjá um commit/deploy.
4. Eftir stóru útgáfuna má hefja performance phase 2: provider latency instrumentation, cold/warm graph mælingar og runtime snapshot/cache optimization með það markmið að Teskeiðarleið verði fyrri oftar án Google-kostnaðar.

## 14. Atriði sem Claude Code á sérstaklega að rýna

1. Að allir stale response og abort paths virði `routeBridgeRunIdRef` og réttan controller.
2. Að Google `DEFAULT_ROUTE` sé automatic choice þótt cards séu duration-röðuð.
3. Að global Teskeið kill switch og per-user gate séu authoritative bæði í candidate og final submit.
4. Að envelope canonicalization, TTL, endpoint binding og constant-time signature check séu fail-closed.
5. Að compact response sé backward-compatible fyrir legacy callers og valdi ekki tvöfaldri route-memory writer hegðun.
6. Að `sanitizePublicRouteMemoryLookup` hleypi engum legacy coordinate-bearing key yfir public API boundary.
7. Að ný route-memory identity sé ekki endurnýtt síðar sem geographic analytics identity.
8. Að engar fyrri worst-point breytingar eða `.obsidian/workspace.json` breyting Stebba séu teknar út.
9. Að ekkert sé commit-að, push-að eða deployað fyrr en Stebbi hefur staðfest localhost smoke og gefið sérstakt leyfi.
