# TODO #90 — Teskeið routing shadow foundation

Created: 2026-07-25 22:39  
Timezone: Atlantic/Reykjavik

## Samþykktur rammi

Stebbi samþykkti provider-neutral route contract, feature flag og shadow-mode
grunn fyrir Teskeiðarleiðir. Engar UI-breytingar, migrations, commit, push eða
deployment voru samþykkt.

## Plan áfangans

1. Halda nýja routing-kjarnanum inni í `lib/iceland-routes/`.
2. Skilgreina provider-neutral request/result/provider contract.
3. Bæta við server-only, fail-closed shadow runner með sér kill-switch.
4. Ekki tengja runnerinn við núverandi route API í þessum áfanga.
5. Staðfesta hegðun með afmörkuðu einingaprófi og TypeScript.

## Hvað var gert

- Bætt við provider-neutral gerðum fyrir staði, ökutæki, avoidance-reglur,
  geometry, canonical segment IDs, confidence og route provider.
- Bætt við `TESKEID_ROUTING_SHADOW_ENABLED`; aðeins exact `true` virkjar.
- Bætt við server-only runner sem skilar typed `disabled`, `completed` eða
  `failed` outcome og kastar ekki provider-villu áfram.
- Runnerinn skrifar engin telemetry eða route-gögn og er ekki tengdur við
  production request path.
- Foundation version hækkuð úr `0.4.0` í `0.5.0` og README/roadmap uppfærð.

## Skrár skoðaðar

- `WORKFLOW.md`
- `IcelandRoadmap.md`
- `lib/iceland-routes/*`
- `lib/weather/provider.types.ts`
- `lib/weather/google.server.ts`
- `lib/loans/guard.ts`
- núverandi route API og route tests með `rg`

## Skrár breyttar

- `.env.example`
- `IcelandRoadmap.md`
- `lib/iceland-routes/README.md`
- `lib/iceland-routes/index.ts`
- `lib/iceland-routes/routingProvider.ts` (ný)
- `lib/iceland-routes/routingShadow.server.ts` (ný)
- `lib/__tests__/iceland-routing-shadow.test.ts` (ný)

## Skipanir og niðurstöður

- `npm run test:run -- lib/__tests__/iceland-routing-shadow.test.ts`
  - Exit 0; 1 test file, 4 tests passed.
- `npm run type-check`
  - Fyrsta keyrsla exit 1 vegna of þröngrar `NodeJS.ProcessEnv` test-gerðar.
  - Gerðin var leiðrétt í read-only string map.
  - Önnur keyrsla exit 0.
- `git diff --check`
  - Exit 0. Aðeins væntanleg CRLF warnings frá Git á Windows.

## Hvað var ekki gert

- Engin tenging við Google route API eða Aksturs-UI.
- Engin Teskeið routing engine eða graph-leit.
- Engin telemetry, gagnavistun, Supabase eða migration.
- Engin env-breyting utan skjölunar í `.env.example`.
- Engin full test suite eða build.
- Enginn dev-server, browserprófun, commit, push eða deployment.

## Ákvarðanir

- Sérstakt shadow flagg er notað í stað `road-intelligence-v1`, svo hægt sé að
  slökkva á leiðarreikningi óháð korta-/Road Intelligence aðgangi.
- Nýi samningurinn er í domain-kjarnanum en ekki í Weather-specific provider
  contractinu.
- Shadow keyrsla verður að vera utan primary response path þegar hún verður
  tengd síðar. Núverandi grunnur gerir enga sjálfvirka keyrslu.

## Route intelligence check

1. Snertir allar route families almennt; engan sérstakan vegkafla enn.
2. Nýja þekkingin á heima í `lib/iceland-routes/`; `IcelandRoadmap.md` var uppfært.
3. Contractið er provider-neutral; aðeins provider IDs greina uppruna.
4. Engin ný segment/control-point fixture er nauðsynleg fyrr en provider
   experiment skilar raunverulegri leið.
5. Engin gögn eru vistuð. Request labels eru request-scoped og telemetry er ekki
   hluti þessa áfanga.
6. Engin Google payload eða geometry er vistuð eða gerð canonical.

## Áhætta sem stendur eftir

- Enginn Teskeið-provider notar contractið enn; þetta er foundation, ekki
  notendasýnileg virkni.
- `onOutcome` þarf síðar privacy-safe samanburðarlíkan áður en telemetry er bætt
  við.
- Næsta API-tenging verður að ræsa shadow vinnu án þess að tefja eða breyta
  primary Google response.
- Open-data leyfi, attribution og heimild til varanlegrar gagnavinnslu eru enn
  rannsóknaratriði.

## Tillaga að næsta skrefi

Búa til mjög lítinn `teskeid_routes` provider experiment sem notar staðfest
open-data fixture fyrir eina route family og skilar nýja contractinu. Eftir
prófun má óska sér samþykkis fyrir að tengja hann við núverandi route API í
shadow mode, áfram án UI eða persistence.

## Localhost checks for Stebbi

Engin notendasýnileg breyting er í þessum áfanga og ekkert nýtt localhost-flæði
á að prófa. Núverandi `/vedrid` og Akstur eiga að haga sér nákvæmlega eins því
shadow runnerinn er ekki tengdur við route API og flaggið er sjálfgefið slökkt.

Ef Stebbi gerir almenna smoke-prófun má reikna eina núverandi Google-leið og
staðfesta að leiðir og UI séu óbreytt. Ekki setja
`TESKEID_ROUTING_SHADOW_ENABLED=true` enn; enginn provider er tengdur og slíkt
myndi því ekki bæta notendasýnilega virkni.

## Óvissa / þarf að staðfesta

- Hvaða routing engine verður valin er viljandi óákveðið.
- Fyrsta route family/fixture fyrir provider experiment þarf sérstaka ákvörðun.
- Confidence: hátt fyrir einangrun þessa foundation-áfanga; medium fyrir næstu
  engine-/open-data skref þar til leyfi og gagnagæði hafa verið staðfest.
