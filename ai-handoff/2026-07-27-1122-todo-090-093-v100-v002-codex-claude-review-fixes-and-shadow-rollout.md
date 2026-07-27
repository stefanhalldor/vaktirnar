# TODO-090 v100 + TODO-093 v002 — Codex-rýni á Claude-skýrslu og lagfæringar

**Agent:** Codex  
**Tími:** 2026-07-27 11:22  
**Rýnt:** `2026-07-27-1110-todo-090-093-claude-ryniskyrslur-v099-og-v001.md`  
**Staða:** Kóðarýni og afmarkaðar lagfæringar loknar; full test suite og production build græn. Engin SQL, HMS-innlesning, commit, push, deploy eða production-breyting framkvæmd.

## 1. Findings fyrst

### Medium — lagað: eldri TravelAuditMap reverse-label flæði var bilað

`lib/weather/reverseGeocode.client.ts` kallaði enn `GET /api/place/reverse-geocode?lat=...&lon=...` og bjóst við `{ name }`. Nýja endpointið er viljandi POST-only og skilar `{ location, distanceM }`. Þetta hefði gert `TravelAuditMap` staðarmerkingar tómar og sett hnit aftur í URL ef GET hefði síðar verið opnað.

**Lagfæring:** Helperinn notar nú same-origin POST, hnit í JSON body og les nested HMS/static location. Sérstakt regression-próf var bætt við.

### Medium — lagað: vantaði aðskilið shadow-rollout flagg fyrir production-only Supabase

`HMS_PLACE_DIRECTORY_REFRESH_ENABLED` stjórnaði innlestri en ekkert sjálfstætt flagg stjórnaði því hvort production search/reverse mætti nota virkt dataset. Þar sem aðeins production Supabase er til hefði innflutt dataset tekið strax við í deployuðum kóða.

**Lagfæring:** Nýtt exact opt-in `HMS_PLACE_SEARCH_ENABLED` stýrir HMS search og reverse óháð innlestri. Production getur haft flaggið false á meðan localhost, sem vísar á sömu production-töflur, prófar með true. Static og tímabundið Google fallback halda áfram að virka þegar HMS search er false.

### Medium — mildað, þarf enn raunmælingu: 38 MB import innan 300 sekúndna

Claude hafði rétt fyrir sér um ómældan import-tíma, en fullyrðingin um að venjulegt retry leysi timeout var of bjartsýn. Ef hver full keyrsla fer yfir 300 sekúndur byrjar retry aftur frá grunni eftir lease-recovery og leysir ekki orsökina.

**Lagfæring:** Chunk-stærð fór úr 500 í 2.000 rows. Núverandi 137.117-row snapshot fer því úr um 275 sequential PostgREST requests í um 69. Success log og admin/cron result skrá `insertRequestCount` og `durationMs`; error log skráir safe reason og duration.

**Eftirstöðvar:** Peak memory, payload-stærð, raun-tími og query plans verða ekki sönnuð fyrr en controlled production-shadow innlestur er keyrður. Fyrsta innlestur á að fara frá localhost/admin route á rólegum tíma, ekki treysta ómælt á Vercel 300 s cron.

### Medium — samþykkt með rökstuðningi: in-memory request limiter

Module-level rate limiter er best-effort og ekki sameiginlegur milli Vercel instances. Hann er því ekki security boundary.

Ekki var bætt við Supabase write við hvern 250 ms autocomplete request: það myndi tvöfalda database round-trips, auka latency og búa til pseudonymous request-log fyrir annars no-store leit. Endpointið er áfram weather-access varið, HMS RPC er capped og Google fallback er explicit tímabundið opt-in. Missing IP notar nú fail-open í stað sameiginlegs `unknown` bucket sem gæti throttlað óskylda notendur.

Fyrir opna leit í stærri skala þarf shared edge/managed limiter eða afmarkaðan provider-cost limiter áður en Google fallback yrði langlíft.

### Low — lagað: tvær normaliseringar og locale-áhætta

Road-intelligence bridge var með afrit af normaliseringu og bæði föll notuðu `toLocaleLowerCase('is')`. Bridge endur-exportar nú canonical `lib/places/normalize.ts` fallið og það notar deterministic Unicode `toLowerCase()` ásamt skýrri íslenskri stafafellingu.

### Low — lagað: merkingarlaus Google penalty

Google `-20` relevance penalty var fjarlægð. Google fallback er aðeins keyrt þegar staðbundnar niðurstöður eru tómar, þannig að source-penalty þar hafði enga merkingu.

### Info — finding Claude lokað: RouteComparisonMiniMap er breytt

Núverandi staða er:

- `M components/weather/RouteComparisonMiniMap.tsx`
- `363` línur inn og `38` út gagnvart HEAD.

Athugasemd Claude um clean-status var því tímabundin eða byggð á annarri status-sýn og er ekki release-blocker.

### Info — finding Claude lokað: ARIA contract var fullrýnt

`PlaceSearch` hefur `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role="listbox"`, `role="option"`, `aria-selected`, keyboard navigation og `scrollIntoView`. Component-prófið staðfestir þetta contract. Mobile-only staðsetningarhnappur hefur nú einnig `sm:hidden` assertion.

### Open operational blocker — ekki hægt að laga eingöngu í kóða

- HMS endurnýtingar-/attribution-skilmálar eru enn óstaðfestir.
- `sql/94` og import hafa aldrei verið keyrð gegn Supabase.
- Raun-query plans, index-stærð, import-tími og memory eru ómæld.
- TODO-090 þarf áfram sjónræna route-card/drawer staðfestingu og aðskilda road-graph snapshot refresh heimild.

## 2. Plan áfangans

1. Staðfesta öll Claude findings gegn raunskrám og git-status.
2. Leita að regressions sem skýrslan náði ekki yfir.
3. Laga raunveruleg contract-, rollout- og rekstrargöt án production-aðgerða.
4. Rökstyðja findings sem ekki eiga að leiða til meiri flækju núna.
5. Keyra targeted próf, lint, type-check, fulla suite, production build og diff-check.
6. Skila production-only shadow-rollout og localhost checks.

## 3. Hvað var raunverulega gert

- Bætti við `HMS_PLACE_SEARCH_ENABLED` í search, reverse og `.env.example`.
- HMS search/reverse er fail-closed á nýja flagginu en static/Google bootstrap heldur áfram óháð því.
- Lagaði gamla GET reverse-label consumerinn yfir á POST-only contract.
- Sameinaði staðaleitar-normaliseringu í eitt fall.
- Fækkaði HMS import requests um u.þ.b. 75% og bætti við duration/request telemetry.
- Fjarlægði óvirka Google relevance penalty.
- Missing IP býr ekki lengur til sameiginlegan `unknown` rate-limit bucket.
- Staðfesti mobile-only `Nota núverandi staðsetningu` í component-prófi.
- Uppfærði TODO #93 stöðu og framkvæmdarnótur.
- Staðfesti að `RouteComparisonMiniMap.tsx` er raunverulega dirty og að ARIA contractið er til staðar/prófað.

## 4. Skrár sem voru skoðaðar

- `AGENTS.md`, `WORKFLOW.md`, `Design.md`
- Claude rýniskýrslan og v099/v001 handoffin í heild
- TODO-090 route comparison, drawer, sorting, weather-confidence og test-skrár
- TODO-093 place types, normalization, CSV/import, migration, API, GPS, UI, middleware og test-skrár
- Fyrirliggjandi auth/weather rate-limit helpers og `sql/42_ip_rate_limit.sql`
- Git status/diff fyrir `RouteComparisonMiniMap.tsx`

## 5. Skrár sem voru breyttar í þessari rýni

- `.env.example`
- `TODO.md`
- `app/api/place/search/route.ts`
- `app/api/place/reverse-geocode/route.ts`
- `lib/places/hmsImport.server.ts`
- `lib/places/normalize.ts`
- `lib/road-intelligence/placeSearchBridge.ts`
- `lib/weather/reverseGeocode.client.ts`
- `lib/__tests__/hms-place-api.test.ts`
- `lib/__tests__/hms-place-import.test.ts`
- `lib/__tests__/place-search-api.test.ts`
- `lib/__tests__/place-search-ui.test.tsx`
- `lib/__tests__/reverse-geocode-client.test.ts` (ný)
- þetta handoff

`components/weather/PlaceSearch.tsx` var þegar breytt rétt fyrir þessa rýni til að gera current-location control mobile-only. `.env.local` hefur local-only `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=true`; skráin er gitignored og gildið á að vera tímabundið.

## 6. Skipanir sem voru keyrðar

| Skipun | Niðurstaða |
| --- | --- |
| Targeted HMS/search/reverse/UI test run | Exit 0, 8 files og 68/68 próf |
| `npm run type-check` | Exit 0 |
| Targeted `npm.cmd run lint -- --file ...` | Exit 0, engar warnings/errors |
| `npm run test:run` | Exit 0, 180 passed files, 1 skipped; 4016 passed, 28 skipped, 8 todo |
| `npm run build` | Exit 0, Next.js 15.5.14, 107 static pages |
| `git diff --check` | Exit 0; aðeins fyrirliggjandi LF→CRLF viðvaranir |
| `rg` fyrir reverse GET, HMS flags og normalization duplicates | Enginn virkur reverse GET consumer; nýtt flagg á báðum endpointum; canonical normalization sameinuð |

## 7. Niðurstöður og exit codes

- Full test suite: **4016 passed**, 28 skipped, 8 todo; exit 0.
- Targeted: **68/68 passed**; exit 0.
- TypeScript: exit 0.
- Targeted lint: exit 0, engar warnings/errors.
- Production build: exit 0.
- Build sýnir fyrirliggjandi hook dependency, `<img>` og Browserslist warnings; engin ný build-villa.
- Tvö fyrirliggjandi jsdom `Not implemented: navigation to another Document` skilaboð eru non-failing.

## 8. Hvað mistókst eða var sleppt

- Fyrsta targeted run eftir nýja shadow-flaggið féll í tveimur eldri tests sem höfðu ekki sett flaggið og einu cache-prófi þar sem tvö hnit röðuðust í sama viljandi 1 km bucket. Test-state var leiðrétt; endurkeyrsla 68/68 og full suite urðu græn.
- Fyrsta lint-skipun rakst á Windows execution policy fyrir `npm.ps1`. Sama read-only lint var keyrt með `npm.cmd` og varð grænt.
- Engin browser automation, raun-GPS permission, Supabase RPC, migration, HMS import, `EXPLAIN`, commit, push eða deploy var gert.
- HMS terms voru ekki staðfest í þessum kóðaáfanga.

## 9. Ákvarðanir og rökstuðningur

- Search activation og refresh activation eru tveir ólíkir rekstrarrofar. Það er nauðsynlegt þegar aðeins production gagnagrunnur er til.
- Fyrsta production-shadow import verður keyrt frá localhost/admin route svo Vercel 300 s gluggi stjórni ekki bootstrapinu. Cron verður ekki virkjað fyrr en raun-tími hefur verið mældur.
- Chunk 2.000 er enn bounded en fækkar dýrum sequential HTTP round-trips verulega.
- In-memory limiter er soft guard. Shared database write fyrir hvert autocomplete keystroke er ekki rétt tradeoff fyrir latency/privacy; þetta þarf endurmat ef scope eða abuse-risk vex.
- Google fallback er tímabundið continuity-lag. Provider-hlutlausa UI contractið má ekki gera Google að framtíðar default.
- HMS search failure loggar aðeins generic operational message, aldrei query eða hnit.

## 10. Eftirstandandi áhætta

- Production-only shadow import skrifar nýjar public-address töflur og indexa í production og getur aukið DB load/storage þótt engin notendagögn séu snert.
- 2.000-row payload og heildarminni/tími eru áætluð, ekki mæld gegn production Supabase.
- In-memory limiter er ekki distributed.
- HMS er ekki full POI/fyrirtækjaskrá.
- 25 km reverse radius er varfærnislega merkt `Nálægt`, en þarf dreifbýlispróf.
- TODO-090 50 km weather-confidence mörk og fullbreið drawer þurfa sjónræna raunleiðaprófun.
- Road-graph snapshot refresh er aðskilin production-aðgerð með sérstöku leyfi.

## 11. Production-only shadow-rollout — tillaga að næsta skrefi

1. Staðfesta HMS reuse/attribution heimild.
2. Með sérstöku leyfi setja production deployment í continuity-state:
   - `HMS_PLACE_SEARCH_ENABLED=false`
   - `HMS_PLACE_DIRECTORY_REFRESH_ENABLED=false`
   - `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=true`
3. Deploya kóðann með sérstöku commit/push/deploy leyfi. Production heldur áfram á static + Google fallback; HMS töflur eru ekki notaðar.
4. Með sérstöku Supabase-leyfi keyra `sql/94_hms_place_directory.sql` í production.
5. Á localhost sem vísar á production Supabase:
   - halda `HMS_PLACE_SEARCH_ENABLED=false` meðan import fer fram;
   - setja local-only `HMS_PLACE_DIRECTORY_REFRESH_ENABLED=true`;
   - kalla authenticated admin refresh á rólegum tíma.
6. Staðfesta active dataset, um 139.297 source rows, um 137.117 canonical rows, `insertRequestCount`, `durationMs`, index-stærð og villulaus logs.
7. Setja aðeins localhost:
   - `HMS_PLACE_SEARCH_ENABLED=true`
   - `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=false`
   og keyra localhost checks hér að neðan.
8. Keyra `EXPLAIN (ANALYZE, BUFFERS)` á exact, prefix, multi-token og reverse RPC queries.
9. Ef allt stenst: virkja production `HMS_PLACE_SEARCH_ENABLED=true`, slökkva Google fallback og staðfesta smoke test.
10. Virkja weekly refresh aðeins eftir að raun-import er undir öruggum tímamörkum; annars þarf resumable/background import áður en cron er virkjað.

## 12. Atriði fyrir næstu rýni

- Raunmældur first-import tími, peak memory, payload-stærð og DB load.
- Query plans og index hit-rate fyrir `Melás`, `Melás 8`, íslenska/ASCII leit og multi-token heimilisföng.
- HMS attribution texti í UI/skjölum ef leyfið krefst þess.
- Hvort distributed limiter þarf áður en search verður opið breiðari hópi.
- Sjónræn staðfesting TODO-090 og hvort 50 km mörkin séu rétt stillt.

## 13. Supabase, SQL, auth og production

- **SQL skrifað í fyrri áfanga:** `sql/94_hms_place_directory.sql`.
- **SQL breytt í þessari rýni:** nei.
- **SQL keyrt:** nei.
- **Supabase lesið/skrifað:** nei.
- **RLS/grants:** óbreytt; HMS töflur/RPC verða service-role-only þegar migration er keyrð.
- **Auth:** weather access guard áfram server-side; shadow flag veitir engan aðgang eitt og sér.
- **User/GPS data:** ekkert vistað; search/reverse svör áfram `private, no-store`.
- **Production, billing, deploy:** engin breyting. Local Google fallback getur valdið Google Places-kostnaði við local leit.
- **Versta mögulega næsta-skrefsáhætta:** production import hækkar DB load eða klárast ekki. Líkur eru ómældar; þess vegna er search flag false, import keyrt controlled og active promotion last-known-good varið.

## Route intelligence check

- TODO-090 route geometry, HMAC envelope, provider route IDs og candidate computation voru ekki breytt í þessari rýni.
- TODO-093 HMS/static/device staðir halda áfram að route-a eftir WGS84 hnitum; aðeins explicit Google source fær Google routing ID.
- Reverse-helper lagfæringin breytir eingöngu display label í TravelAuditMap, ekki route geometry eða veðurútreikningi.
- `RouteComparisonMiniMap.tsx` breytingarnar eru staðfestar í worktree og full suite/build ná yfir þær.

## Design.md samræmi

- Current-location control er nú mobile-only með CSS (`sm:hidden`), án hydration/media-query state.
- 16 px input, 40 px controls, keyboard/ARIA contract og capped scroll eru óbreytt og prófuð.
- POST-only leit/reverse kemur í veg fyrir address/GPS texta í URL.
- Enginn nýr hardcoded notendatexti var settur í components.

## Localhost checks for Stebbi

### A. Núverandi bootstrap-state, áður en HMS er flutt inn

**Slóð/state:** `/auth-mvp/vedrid` eða núverandi RoadMap-flæði. Local `.env.local` má hafa Google fallback true; HMS search flag á að vera false.

1. Við breidd 768 px eða desktop: opnaðu Frá-leit.
   - Vænt: `Nota núverandi staðsetningu` sést ekki.
2. Við 360, 390 og 460 px: opnaðu sömu leit.
   - Vænt: hnappurinn sést, er minnst 40 px og permission kemur aðeins eftir smell.
3. Leitaðu að `Melás`.
   - Vænt í bootstrap-state: Google fallback getur skilað niðurstöðu; þetta sannar UI continuity en ekki HMS.
4. Í Network tab:
   - Vænt: `POST /api/place/search`; engin query í URL.
   - Vænt: reverse notar `POST /api/place/reverse-geocode`; engin `?lat=...&lon=...` request.

### B. Eftir controlled shadow import, aðeins með sérstöku leyfi

**Local env:** `HMS_PLACE_SEARCH_ENABLED=true`, `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=false`. Production Vercel flag heldur áfram false meðan prófað er.

1. Leitaðu að `Melás`, `Melás 8`, `melas 8`, `Laugavegur 10`, póstnúmeri og multi-token heimilisfangi.
   - Vænt: HMS niðurstöður, mest 8, exact/prefix fremst og íslensk/ASCII leit samræmd.
2. Veldu HMS stað og reiknaðu leið.
   - Vænt: HMS `sourceId` verður aldrei Google `placeId`; routing notar hnit.
3. Prófaðu current location á mobile.
   - Vænt: `Núverandi staðsetning`, optional `Nálægt …`, nákvæm route-hnit og engin sjálfvirk saved-place geymsla.
4. Opnaðu TravelAuditMap punkt sem er hvorki origin né destination.
   - Vænt: staðarlabel birtist eftir POST reverse lookup; engin hnit í URL.
5. Prófaðu denied permission og leit strax á eftir.
   - Vænt: stuttur þýddur villutexti og handvirk leit áfram virk.

### C. TODO-090 sjónræn regression

1. Opnaðu fullscreen `Veldu leið á korti` með Teskeiðar- og Google-leiðum.
2. Staðfestu Google aftast í `Sjálfgefið`, óstaðfest slitlag áður en möl er borin saman og carousel reset við sort.
3. Opnaðu caution/weather-confidence drawer á fremsta og aftasta cardi við 360/390/460/iPad.
   - Vænt: fullbreið sýnileg sheet, focus á close, Escape/backdrop virkar og focus fer aftur á trigger.
4. Prófaðu leið án nálægra nothæfra vindstöðva.
   - Vænt: `Takmörkuð veðurvissa`, engin fullyrðing um slæmt veður og ekkert grænt best-weather merki.

**Öryggisvarúð:** Ekki keyra migration, import, Vercel env change, road-graph refresh eða production toggle sem hluta af venjulegu localhost-prófi án sértæks leyfis. Production GPS/notendagögn eiga ekki að vera notuð í tilraunaskyni.
