# TODO-090 v089 — Teskeiðarleið cold-start performance áfangi 2

## Plan áfangans

1. Staðfesta hvort biðin væri client-röðun, grafhleðsla eða endurútreikningur.
2. Deila vegagrafi milli Next route-bundla innan sama Node-isolate.
3. Endurnýta nákvæmlega sömu Teskeiðar-útreikninga með afmörkuðu, snapshot-bundnu skyndiminni og single-flight.
4. Minnka CPU-vinnu án þess að breyta leiðaröryggi eða leiðarvali.
5. Hita grafið fyrir flaggaða notendur og stytta bið milli `pending` endurtilrauna.
6. Endurnýta nýlega undirritaða niðurstöðu í sama client-skjá fyrir nákvæmlega sömu endapunkta.
7. Þýða innri `TESKEID_*` merki á leiðarspjöldum stóra samanburðarkortsins.

## Hvað var raunverulega gert

- Vegagraf-cache og yfirstandandi grafhleðsla voru færð í `globalThis` runtime-state. Það deilir staðfestu grafi milli Next route-bundla og Fast Refresh innan sama Node-isolate; nýr isolate byrjar áfram kaldur.
- Bætt var við `cold | loading | warm` greiningarstöðu fyrir graf-cache.
- Teskeiðar-leiðir fengu 30 mínútna, hámark 128 færslna LRU-cache á server:
  - lykillinn inniheldur nákvæma origin/destination hnit og alternatives-stöðu;
  - cache er bundið við sjálft graf-objectið með `WeakMap`, þannig að ný snapshot-útgáfa notar sjálfkrafa nýtt cache;
  - samhliða eins köll deila sama Promise (single-flight);
  - aðeins `ready` og `no_route` eru cache-uð; bilanir eru ekki festar.
- Varúðarpunktaleit keyrir nú á lögun-varðveittri, takmarkaðri rúmfræði (mest 1.000 punktar) í stað allt að um 28 þúsund hrápunkta. Reiknuð leið og öryggisviðmið breytast ekki.
- Candidate API styður feature-gated `warmOnly` kall, hefur afmarkaðan biðtíma og leyfir hafinni grafhleðslu að klárast í bakgrunni.
- Candidate API skilar `Server-Timing` og `X-Teskeid-Graph-Cache` fyrir mælingar. Hrá undirritunarvilla er ekki sett í logg.
- Flaggaður client hitar grafið við mount án Google-kalls.
- `pending` endurtilraunabil voru stytt úr `1500/3000/6000 ms` í `250/750/1500 ms`; fjöldi kalla var ekki aukinn.
- Client geymir mest 16 nýlegar, nákvæmlega samsvarandi Teskeiðar-niðurstöður í minni þessa skjás. Cache:
  - er ekki persisted;
  - er aðskilið fyrir single/alternatives;
  - notar hnit með sex aukastöfum;
  - endurnýtir aðeins undirrituð envelopes sem eiga meira en 60 sekúndur eftir;
  - endurraðar þýddum UI-texta við lestur, svo locale-texti er ekki cache-aður.
- Innri Teskeiðar-flögg voru kortlögð á next-intl lykla í bæði íslensku og ensku. Óþekkt framtíðarflögg eru falin í stað þess að leka sem hráir constants á spjöld.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/iceland-routes/roadGraphRuntime.server.ts`
- `lib/iceland-routes/roadGraphCandidate.server.ts`
- `app/api/teskeid/weather/travel/route-candidate/route.ts`
- route-envelope, route-provider, matching og tengdar testskrár
- `messages/is.json` og `messages/en.json`

## Skrár sem voru breyttar í þessum áfanga

- `app/api/teskeid/weather/travel/route-candidate/route.ts`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/iceland-routes/roadGraphCandidate.server.ts`
- `lib/iceland-routes/roadGraphRuntime.server.ts`
- `lib/weather/routeOptionLabels.ts` (ný)
- `lib/__tests__/road-graph-candidate.test.ts`
- `lib/__tests__/road-graph-runtime-cache.test.ts`
- `lib/__tests__/weather-route-candidate-api.test.ts`
- `lib/__tests__/route-option-labels.test.ts` (ný)
- `messages/is.json`
- `messages/en.json`

Vinnusvæðið var þegar óhreint eftir fyrri samþykkta áfanga og breytingar Claude Code/Stebba. `.obsidian/workspace.json` og ótengdar breytingar voru hvorki snertar né afturkallaðar.

## Skipanir og niðurstöður

- `npm run type-check` — exit 0.
- Afmarkað 6 skráa Vitest-safn — exit 0, 62/62 próf.
- Fyrsta `npm run test:run` — exit 1, 3.868 próf stóðust en `log-safety` fann breytilegt villugildi í einu nýju `console.error`.
- Loggið var gert fast og öruggt.
- `npm run test:run` aftur — exit 0: 167 testskrár stóðust, 1 sleppt; 3.869 próf stóðust, 28 sleppt, 8 TODO.
- Eftir síðustu litlu hook/þýðingarhreinsun:
  - `npm run type-check` — exit 0.
  - afmarkað label, fullscreen-map og log-safety safn — exit 0, 115/115 próf.
- `npm run build` — exit 1 eftir að compile og type/lint-check stóðust. Next stöðvaðist í `Collecting page data` á fyrirliggjandi/stale `/contacts` og `/home` (`PageNotFoundError`). `.next` var ekki hreinsað og dev-server Stebba var ekki snertur.
- `git diff --check` — exit 0; aðeins line-ending viðvaranir frá Git.

## Hvað mistókst eða var sleppt

- Fullt production-build kláraðist ekki vegna `/contacts` og `/home` page-data villu eftir successful compile. Ekki var talið öruggt að hreinsa `.next` meðan Stebbi keyrir dev-server sjálfur.
- Engin browser automation var keyrð; Stebbi sér um localhost-prófið.
- Engin SQL, Supabase, Vercel, deployment, commit eða push aðgerð var framkvæmd.

## Ákvarðanir

- Ekki var breytt reikniriti Dijkstra eða route-preference röðun í þessum áfanga; cache, warm-up og afmörkuð eftirvinnsla gefa minni regression-áhættu.
- Client-cache geymir raw undirrituð envelopes en ekki þýdda spjaldtexta. Þannig helst þýðing rétt og undirritun/expiry áfram canonical.
- `globalThis` leysir endurhleðslu milli route-bundla innan sama isolate en þykist ekki vera dreift cache milli serverless-isolates.
- Warm-up er aðeins fyrir notendur með Teskeiðarleiða-flaggið og kallar ekki Google.

## Design.md samræmi

- Engu nýju control-i eða layout-i var bætt við.
- Spjaldtextar eru stuttir, þýddir og núverandi truncation verndar mobile-breidd.
- Enginn innri tæknilykill birtist notanda; óþekkt merki eru falin.
- Núverandi first-ready pending/feedback hegðun er varðveitt.

## Eftirstandandi áhætta

- Fyrsta beiðni í alveg nýjum production-isolate getur enn verið köld ef notandi reiknar leið áður en warm-up nær að klárast.
- `globalThis` cache er isolate-local, ekki sameiginlegt milli Vercel-instances. Dreift cache væri stærra innviðaverkefni og gæti bætt beinum kostnaði við.
- Raunhraði þarf browsermælingu. Markmiðið er Teskeið fyrst þegar warm-up hefur lokið; client-cache á að gera nákvæmlega sömu endurteknu leið nánast samstundis.
- Build-frávikið `/contacts` og `/home` þarf að staðfesta í hreinu build-umhverfi eða eftir að dev-server er stöðvaður af Stebba; það er ekki rakið til þessa áfanga.

## Tillaga að næsta skrefi

Stebbi keyrir eina sameinaða localhost-mælingu hér að neðan og sendir skjámynd eða þrjár tímasetningar. Ef fyrsta Teskeiðarleið er enn verulega á eftir Google þrátt fyrir `graph=warm`, á næsti performance-áfangi að nota `Server-Timing` til að afmarka routing, eftirvinnslu og envelope-signing áður en meira er flækt.

## Spurningar fyrir Claude Code review

1. Sér Claude Code concurrency eða cache-scope galla í `globalThis` + `WeakMap` nálguninni á Next/Vercel?
2. Er 30 mínútna/128 server LRU og 16 færslna ephemeral client LRU hæfilega afmarkað?
3. Getur 1.000 punkta caution-input misst einhverja raunhæfa <1,5 km nálægð miðað við lögun-varðveitta einföldun?
4. Er `after()` notkun warm-up leiðarinnar rétt fyrir núverandi Next/Vercel runtime?
5. Staðfestir Claude að engin hrá `TESKEID_*` merki eða óþýddur fallback geti birst á fullscreen-spjöldum?

## Localhost checks for Stebbi

**Forsenda:** Innskráður notandi með Teskeiðarleiða-flaggið. Dev-server er þegar keyrður af Stebba. Ekki breyta env, Supabase eða production.

1. Opnaðu `http://localhost:3004/auth-mvp/vedrid`, gerðu hard refresh og bíddu þar til console sýnir `[RoadMap] Teskeið graph warm:`.
2. Reiknaðu `Reykjavík → Ísafjörður` einu sinni.
   - Niðurstaðuskjár á að opnast um leið og fyrri provider er tilbúinn.
   - Skráðu hvort Teskeið eða Google kom fyrst.
   - Í console á `[RoadMap] Teskeið candidate API:` að sýna heildartíma, `graph=cold|loading|warm` og `Server-Timing`.
3. Reiknaðu nákvæmlega sömu leið aftur án hard refresh.
   - Teskeiðarleiðin á að koma nánast samstundis.
   - Console á að sýna `[RoadMap] Teskeið candidate client cache: hit`; hún á ekki aftur að vera 8–10 sekúndum á eftir Google.
4. Opnaðu `Stækka kort`/leiðarvalið.
   - Spjöld mega sýna náttúruleg orð eins og `Tilraunaleið`, `Áætlaður aksturstími`, `Valkostur` og `Möl á leið`.
   - Enginn texti sem byrjar á `TESKEID_` má sjást.
   - Spjöld mega ekki valda nýju láréttu overflowi eða overlap-i á mobile/iPad breidd.

**Vænt niðurstaða:** Fyrsta Teskeiðarleið keppir við eða kemur á undan Google þegar warm-up er lokið; endurtekin nákvæm leið er near-instant; fullscreen-spjöld eru þýdd og mobile-safe.

**Ekki prófa kæruleysislega:** Engin SQL, cache-hreinsun, feature-flag breyting, production refresh, Vercel/Supabase aðgerð eða eyðing eldri route-memory raða tilheyrir þessu localhost-prófi.
