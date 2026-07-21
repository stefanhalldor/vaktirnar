# 2026-07-21 11:48 - TODO-086 v278 - Codex Vegagerdin route labels

Relevant previous handoff/review:
- `2026-07-21-1115-todo-086-v276-claude-vedurstofan-first-route-geometry`
- `2026-07-21-1119-todo-086-v277-codex-v276-review`

## Plan afangans

1. Laga helstu atridi ur v277 review:
   - Ekki lata synilega route-kortid treysta a MET/Yr sampling punkta.
   - Nota betri provider-matching geometry svo leidin fylgi veginum betur.
   - Forðast að route-memory hreinsun eyði provider-stodvum sem voru ekki raunverulega endurmetnar.
2. Syna strax Vegagerdarstodvar sem tilheyra valdri leid med vindtolum a kortinu, an thess ad notandi thurfi ad smella.
3. Nota somu vindmarkalogik og nuverandi `/vedrid`:
   - notandans `opthaegilegt` / `haettulegt` mork
   - gust/hvidur hja Vegagerdinni thegar hvidutalan er til
   - einfalt/nanar pillu-mode undir korti
4. Geyma Yr/MET sem fallback i bakenda i bili, en ekki setja MET/Yr route-punkta nidur a nyja Road Intelligence kortid.
5. Baeta test coverage fyrir Vegagerdar route-layer.

## Hvad var raunverulega gert

Bakendi:
- `app/api/teskeid/weather/travel/route.ts` byr til `vegagerdinLayer` i route response.
- Vegagerdarstodvar eru lesnar med `readVegagerdinCurrentWithHistoryFallback()`.
- Stodvar eru matchadar a route med `matchProviderPointsToRoute()` og nyrri `providerMatchingPoints` polyline.
- Status flokkun notar `classifyObservationWindDisplayStatus()`, sem notar hvidu/gust ef hun er til, annars medaltal.
- Response skilgreinir `statusWindMs` sem gildid sem flokkunin byggir a.
- Route-memory upsert notar nu `providersEvaluated` þannig ad vid hreinsum bara provider sem var raunverulega endurmetinn. Thetta minnkar ahattu a ad missa Vegagerdar rows vegna partial/fail-open.

Geometry:
- `lib/weather/google.server.ts` minnkar provider-matching RDP simplification ur 10m i 3m.
- Markmidid er ad missa sidur af smarri beygjum/afleggjarum/fjordaleidum. Thetta er samt enn Google route geometry yfir OSM/CARTO/Vegagerdar grunnkorti, ekki full eigin Vegagerdar road graph routing.

Client/kort:
- `components/weather/RoadMapPrototypeMap.tsx` synir ekki lengur MET/Yr sample route-punkta a kortinu.
- Vegagerdarstodvar a valdri leid birtast strax sem litil hvit label-spjold a korti med vind/hvidum, t.d. `8 / 16 m/s`.
- Vegagerdarstodvar hafa lika map layer til popup/click handling.
- Veðurstofustodvar eru enn studdar sem fallback/vidbot, en route-svar og pillur velja Vegagerd fyrst thegar Vegagerdarstodvar finnast.
- Pillu-filter undir korti notar sama einfalda/nanar mode og vindmarkalogik. Filter felur/synir baedi layer-punkta og HTML label-spjold.
- Popup a Vegagerdar label/stod synir nafn, fjarlagd a leid, maelt kl, vind, hvidu, lofthita og veghita thegar til.

Textar:
- Baett vid is/en skilabodum fyrir Vegagerdarstodva-fjolda, route-svar og route station detail texta.

Tests:
- Baett vid unit testi sem stadfestir ad `vegagerdinLayer` komi i `/api/teskeid/weather/travel` response og ad status flokkun byggi a hvidu/gust thegar hun er til.

## Skrar sem voru skodadar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/2026-07-21-1119-todo-086-v277-codex-v276-review.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/weather/google.server.ts`
- `lib/weather/providerRouteMatching.ts`
- `lib/weather/windDisplayStatus.ts`
- `lib/weather/providers/vegagerdinCurrent.server.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-travel-api.test.ts`

## Skrar sem voru breyttar

- `app/api/teskeid/weather/travel/route.ts`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/google.server.ts`
- `lib/road-intelligence/vegagerdinRouteLayer.ts` (ny)
- `lib/__tests__/weather-travel-api.test.ts`
- `messages/is.json`
- `messages/en.json`

Ath: worktree var adur ohreint med fleiri odrum breytingum fra Road Intelligence vinnu. Eg breytti ekki `package.json`, `package-lock.json`, `sql/`, `.env.local`, Supabase, deployment eda git state.

## Skipanir sem voru keyrdar

- `npm run type-check`
  - Exit code: 0
  - Nidurstada: TypeScript check passed.
- `npm run test:run`
  - Fyrsta keyrsla fann brot i einu existing travel API testi vegna nyrrar Vegagerdar mock forsendu.
  - Testid var lagad/adlagad og Vegagerdar route-layer test baett vid.
- `npm run test:run`
  - Exit code: 0
  - Nidurstada: 127 test files passed. 3533 tests passed, 27 skipped, 8 todo.
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
  - Exit code: 0
  - Nidurstada: `2026-07-21 11:48`
- `git status --short`
  - Exit code: 0
  - Nidurstada: worktree er enn ohreint fra storrri Road Intelligence vinnu, thar a medal nyjar/untracked skrár.

## Hvad mistokst eda var sleppt

- Eg klaraði ekki fulla eigin Vegagerdar/OSM road graph routing. Leidirnar eru enn reiknadar med nuverandi Google route bridge og sidan varpad a nyja kortid.
- Eg faldi MET/Yr route-punktana i UI, en bakendinn notar enn `checkTravelWeather()` sem fallback/legacy route assessment. Thetta er medvitud milliskref, ekki endanleg stefna.
- Eg setti ekki inn collision/decluttering kerfi fyrir Vegagerdar label. A thettum leidum geta label skarast. Vid thurfum nakvaemari reglur fyrir zoom, priority og route-order.
- Engin SQL var skrifud eda keyrd i thessum afanga.
- Enginn commit, push eda deploy var gert.

## Akvardanir sem Codex tok

- Vegagerdin er valin sem synileg route-observation layer fyrst, thar sem notandinn bad serstaklega um Vegagerdar-vindtölur a stodvum a valdri leid.
- MET/Yr er haldid sem bakenda/fallback i bili til ad brjota ekki nuverandi route API, en thad er ekki lengur synilegt sem punktar a Road Intelligence kortinu.
- Gust/hvidur vinnur yfir mean wind i status flokkun fyrir Vegagerd, i samraemi vid fyrri akvordun um `/vedrid`.
- Provider route-memory cleanup hreinsar bara provider sem var metinn i thessari keyrslu. Thetta er mikilvaegt fail-open atridi.
- 3m RDP epsilon var valinn sem praktiskt milliskref: meiri nakvaemni an thess ad senda of mikid geometry i provider matching.

## Ahaetta sem er enn til stadar

- Route geometry fylgir ekki alltaf veginum 100% af thvi ad vid erum enn ekki med eigin Vegagerdar/OSM road graph route engine.
- Vegagerdar route labels geta ordid of morg eda skarast a langri leid. Thad tharf label priority/collision logic.
- Vegagerdar current observations eru raungildi nuna, ekki forecast a ETA. Thetta leysir "hvernig er vindur a leidinni nuna", ekki alla ferdalagid-timalinu.
- Ef Vegagerdar history/cache er unavailable, kemur ekkert Vegagerdar route-layer og kerfid fellur aftur a Veðurstofu/MET legacy logic.
- Route status-svar notar provider-stodvar thegar thaer finnast, en departure-time/scrubber intelligence er enn ekki full provider-native.

## Tillaga ad naesta skrefi

1. Claude Code ryni thessa breytingu fyrst, serstaklega:
   - hvort `vegagerdinLayer` response contract se nogu stranggert
   - hvort map layer/source cleanup geti leakad event handlers eda markers
   - hvort route-memory provider cleanup se rett i ollum fail-open tilfellum
2. Naesti implementation skammtur:
   - Byggja label decluttering: syna bestu Vegagerdar labels eftir zoom/route-order/status, ekki allar alltaf.
   - Faera route assessment lengra yfir i Icelandic-provider-first logic: Vegagerdin current + Veðurstofa forecast, med MET/Yr bara sem explicit fallback.
   - Byrja undirbuning fyrir eigin graph-native route: velja road graph source, node/edge schema, og route snapping, frekar en ad reyna ad fullkomna Google geometry bridge.

## Spurningar fyrir Claude/Codex ryni

- Er rett ad hafa `vegagerdinLayer` alltaf server-side byggt i `/api/teskeid/weather/travel/route`, eda a thad ad vera ser endpoint fyrir Road Intelligence prototype til ad skilja legacy `/ferdalagid` fra?
- Er 3m RDP epsilon of mikid payload/perf risk fyrir langar leidir, eda er thetta rett milliskref?
- A route-svar ad byggja a Vegagerdarstodvum ef thaer eru til, jafnvel ef Veðurstofa forecast segir verra seinna a leidinni?
- Hvernig viljum vid forgangsraða labels: haettulegt fyrst, svo opthaegilegt, svo route-spacing?

## Supabase / SQL / auth / production

- Engin SQL migration var skrifud eda keyrd.
- Engar RLS policies, grants, auth flows eda feature_access rows voru breytt.
- Engin production data voru lesin eda skrifud.
- Engar env-breytur voru breyttar.
- Enginn deploy, push eda commit var framkvaemdur.

## Localhost checks for Stebbi

Setup:
- Nota localhost sem Stebbi er þegar með keyrandi.
- Innskráður notandi þarf að hafa `road-intelligence-v1` feature access og `ROAD_INTELLIGENCE_V1_ENABLED=true` i local env.
- Opna `/auth-mvp/vedrid/road-map-prototype`.

Prufa 1: Akranes til Akureyri
1. Slá inn `Akranes` sem Frá og `Akureyri` sem Til.
2. Smella á `Reikna`.
3. Vænt niðurstaða:
   - Route line birtist.
   - MET/Yr sample punktar eiga ekki að birtast sem grár/teal punktar eftir leiðinni.
   - Vegagerðarstöðvar a leidinni birtast strax sem lítil hvít vindspjöld, t.d. `8 / 16 m/s`, án þess að smella.
   - Pillu-fjöldi undir kortinu á að byggja á þessum route-stöðvum og vindmörkunum.
   - `Einfalt` sýnir bara grænt/appelsínugult/rautt status; `Nánar` sýnir ítarlegri flokka.

Prufa 2: Ísafjörður til Reykjavík
1. Slá inn `Ísafjörður` og `Reykjavík`.
2. Reikna.
3. Passa sérstaklega að leið og stöðvar fylgi veginum betur í fjörðum og á Vesturlandi.
4. Smella á Vegagerðar label eða punkt.
5. Vænt popup: nafn stöðvar, mælitími, vindur, hviða ef til, lofthiti/veghiti ef til.

Prufa 3: Filter/regression
1. Velja appelsínugula eða rauða pillu undir kortinu.
2. Vænt: bæði punktar og hvít Vegagerðar label sem passa ekki filter hverfa.
3. Smella `Sýna allt` eða græna pillu og staðfesta að label birtist aftur.
4. Hreinsa leið og reikna aðra leið. Gamlar labels eiga ekki að sitja eftir.

Regression checks:
- `/vedrid` legacy map má ekki missa venjulega punkta/pillur.
- `/auth-mvp/vedrid` má ekki fá horizontal overflow eða mobile zoom eftir input focus.
- `/api/teskeid/weather/travel` má ekki skila 500 ef Vegagerðar cache/history er unavailable; þá á það að fail-open.

Ekki prófa kæruleysislega:
- Ekki keyra SQL, production cron, deploy eða production feature-access breytingar fyrir þessa rýni.
- Engar database breytingar eru nauðsynlegar fyrir þennan kóðaskammt.
