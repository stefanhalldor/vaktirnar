# TODO-093 v001 — HMS-first staðaleit og núverandi staðsetning

**Agent:** Codex  
**Tími:** 2026-07-27 10:53  
**Staða:** Útfært, fullprófað og production-build staðfest; bíður HMS-skilmála, handvirks gagnarollouts og localhost-staðfestingar Stebba.

## 1. Plan áfangans

1. Kortleggja öll núverandi staðaleitar- og leiðaflæði og skilgreina eitt provider-hlutlaust location contract.
2. Greina raunverulega HMS Staðfangaskrá, auðkenni, hnit, sveitarfélög, gagnamagn og uppfærslumynstur.
3. Smíða versionaðan, service-role-only HMS leitargrunn og fail-closed last-known-good import.
4. Færa autocomplete af Google Places í browser yfir á same-origin HMS-first API.
5. Bæta við „Nota núverandi staðsetningu“ án sjálfvirkrar GPS-beiðni eða vistunar.
6. Tengja nýja contractið við Veðrið, Ferðalagið, RoadMap og route-provider adaptera.
7. Herða privacy, auth, rate limits, keyboard/mobile UX og rollout-gates.
8. Keyra raun-HMS schema-audit, targeted próf, type-check, fulla test suite, production build og diff-check.

## 2. Hvað var raunverulega gert

### Provider-hlutlaust staðacontract

- Nýtt `SelectedLocation` heldur uppruna, upprunaauðkenni, birtingarupplýsingum, WGS84-hnitum og mögulegu routing-auðkenni aðskildum.
- HMS `HEINUM` fer aðeins í `sourceId`; það getur aldrei orðið Google `placeId`.
- HMS, GPS, vistaðir og static staðir fara til leiðarveitu eftir staðfestum hnitum.
- Legacy Google-niðurstöður geta tímabundið borið Google-auðkenni í sérstöku `routingRef`/`googlePlaceId` contracti.
- Legacy non-string `placeId` er hunsað og fellur örugglega yfir í hnitaleiðsögn.

### HMS gagnagrunnur og innlestur

- `sql/94_hms_place_directory.sql` skilgreinir versionaðar `hms_place_dataset_versions` og `hms_places` töflur.
- RLS er virkt; PUBLIC, `anon` og `authenticated` fá engin table- eða RPC-réttindi. Aðeins server-side `service_role` fær afmörkuð grants.
- Nýtt snapshot er óbreytanlegt og verður ekki virkt fyrr en öllum schema-, hnit-, fjölda-, duplicate-, hash- og sveitarfélagaprófum er lokið.
- Promotion er atomic; síðasta góða snapshot verður `retired` og er hægt að virkja aftur.
- Villa eftir promotion getur ekki merkt eða eytt virka datasetinu.
- Stale refresh lease, concurrent refresh og óbreytt SHA-256 snapshot eru meðhöndluð idempotent.
- Exact og prefix niðurstöður raðast fremst. Full heimilisföng og multi-token leit nota indexað `to_tsvector('simple', ...)` GIN fallback án `pg_trgm` eða wildcard sequential scan.
- Sveitarfélaganöfn koma frá Hagstofu metadata með innbyggðum 2026 last-known-good lista. Snapshot stoppar ef óþekkt/missing sveitarfélagsþekja fer yfir afmörkuð mörk.

### Raungagnaaudit

- Opinbera HMS CSV-skráin 2026-07-27 var sótt í tímabundna möppu og aðeins lesin til schema-audits.
- Hún var 38.162.546 bytes með 139.297 línum og 137.117 canonical `HEINUM`.
- `HEINUM`, `HNITNUM`, hnit, textalengdir, `TEGHNIT`, `YFIRFARID`, `NAKV_XY` og SQL constraints pössuðu við raunskrána.
- Allir 61 `SVFNR` kóðarnir fundust í sveitarfélagakortlagningu; enginn var óþekktur.
- `DAGS_LEIDR` notar ISO `YYYY-MM-DD`, sem styður deterministic nýjustu-hnitaröðun.
- `VEF_BIRTING` er ekki notað sem display texti; það inniheldur landnúmer/tvöföld bil. UI byggir hreint heiti úr canonical dálkum.

### Search og reverse API

- `/api/place/search` er nú `POST`-only svo heimilisföng fari ekki í URL, browser history eða access-query logs.
- Endpointið sannreynir weather access, 2–100 stafa input, 8 niðurstaðna hámark, Iceland hnit, rate limit og `private, no-store`.
- Röðun sameinar HMS með litlum static bæjar-/þéttbýlislista; HMS er canonical address source en static listinn bætir við locality semantics.
- Google Places er aðeins afmarkaður server-side fallback þegar báðar staðbundnar heimildir skila engu og `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=true`.
- `/api/place/reverse-geocode` er einnig `POST`-only, `private, no-store` og notar aðeins HMS/static gögn. Nákvæm GPS-hnit fara ekki til Nominatim eða annarrar third-party reverse þjónustu.
- Gamla `ENABLE_REVERSE_GEOCODE` flaggið og Nominatim GET/cache hegðunin voru fjarlægð.

### „Nota núverandi staðsetningu“

- Geolocation er aldrei kölluð við render eða focus; aðeins eftir skýran smell notanda.
- Notað er eitt `getCurrentPosition`, ekki bakgrunns-`watchPosition`.
- Nákvæm device-hnit eru valdi punkturinn. Reverse lookup má aðeins bæta við secondary textanum `Nálægt …`; hann snappar ekki hnitið.
- Aðalheitið er alltaf `Núverandi staðsetning`, svo 25 km nearest lookup geti ekki litið út eins og nákvæmt heimilisfang.
- GPS-punktur er aldrei sjálfkrafa vistaður sem nýlegur staður, hvorki í session storage né Supabase.
- Route-flæði bjóða current location aðeins fyrir upphafsstað; almenn Veðrið-staðaleit býður það einnig. Áfangastaður krefst venjulegs staðavals.

### Sameiginlegt autocomplete UI

- `PlaceSearch` notar ekki lengur Google Places JavaScript library. Ónotaður `loadPlacesLibrary()` browser-helper var fjarlægður.
- 250 ms debounce, AbortController og request identity koma í veg fyrir stale niðurstöður.
- Combobox/listbox styður ArrowUp/Down, Home, End, Enter, Escape og stöðug ARIA tengsl.
- Input er 16 px og controls minnst 40 px; niðurstöður eru capped og scrolla innan listbox.
- 429 hefur sérstakan, þýddan notendatexta.
- RoadMap notar sama component fyrir Frá/Til. Val á Frá færir focus mjúklega í Til og endpoint identity ber saman source/sourceId, Google ID og hnit.

### Google transition

- Google Places er horfið úr browser og er sjálfgefið óvirkt í server search.
- `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED` er tímabundið rollout-öryggisnet, ekki framtíðar-contract.
- Google Maps kort og Google Routes eru aðskilin kerfi og voru ekki fjarlægð í þessum áfanga.
- HMS nær vel yfir staðföng, fasteignaheiti, bæi og `SERHEITI`, en er ekki tæmandi fyrirtækja-/POI-skrá. Provider-hlutlausa contractið leyfir annan POI-gjafa síðar án nýs UI- eða route-contracts.

## 3. Skrár sem voru skoðaðar

- `AGENTS.md`, `WORKFLOW.md`, `Design.md`, `TODO.md`
- Fyrra TODO-093 samhengi og viðhengi Stebba
- Öll `PlaceSearch` consumers, saved-place flæði og route endpoints
- Google client/server provider adapters og weather access guards
- Supabase service-role/RLS/RPC og cron/admin fyrirmyndir
- Opinber HMS Staðfangaskrá, CSV-sýnishorn og Hagstofa sveitarfélagametadata
- Viðeigandi middleware, message, test og handoff skrár

## 4. Skrár sem voru breyttar í þessum áfanga

### Core/data

- `lib/places/types.ts`
- `lib/places/normalize.ts`
- `lib/places/hmsCsv.ts`
- `lib/places/municipalities.ts`
- `lib/places/hmsDirectory.server.ts`
- `lib/places/hmsImport.server.ts`
- `lib/places/currentLocation.client.ts`
- `lib/places/providerCandidate.ts`
- `sql/94_hms_place_directory.sql`

### API/ops

- `app/api/place/search/route.ts`
- `app/api/place/reverse-geocode/route.ts`
- `app/api/cron/refresh-hms-places/route.ts`
- `app/api/admin/weather/refresh-hms-places/route.ts`
- `app/api/teskeid/weather/ask/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `middleware.ts`
- `vercel.json`
- `.env.example`

### UI/integration

- `components/weather/PlaceSearch.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `components/weather/OverviewRouteLensPanel.tsx`
- `components/weather/TeskeidRouteLab.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `app/auth-mvp/vedrid/VedridClient.tsx`
- `lib/road-intelligence/placeSearchBridge.ts`
- `lib/weather/googleMaps.client.ts`
- `messages/is.json`
- `messages/en.json`
- `TODO.md`

### Próf/handoff

- `lib/__tests__/current-location-client.test.ts`
- `lib/__tests__/hms-csv.test.ts`
- `lib/__tests__/hms-municipalities.test.ts`
- `lib/__tests__/hms-place-api.test.ts`
- `lib/__tests__/hms-place-directory-migration.test.ts`
- `lib/__tests__/hms-place-directory-server.test.ts`
- `lib/__tests__/hms-place-import.test.ts`
- `lib/__tests__/hms-place-refresh-routes.test.ts`
- `lib/__tests__/place-search-api.test.ts`
- `lib/__tests__/place-search-ui.test.tsx`
- `lib/__tests__/places-normalize.test.ts`
- `lib/__tests__/places-provider-candidate.test.ts`
- `lib/__tests__/middleware.test.ts` (afmarkaðar nýjar assertions)
- Þessi handoff-skrá

Vinnusvæðið var þegar með miklar ócommittaðar TODO-090/leiðakerfisbreytingar. Þær voru varðveittar; ekkert var resettað eða afturkallað.

## 5. Skipanir sem voru keyrðar

| Skipun | Niðurstaða |
| --- | --- |
| Read-only HEAD/CSV/Hagstofa metadata og raun-CSV PowerShell audit | Opinber 38,2 MB skrá staðfest; 139.297 línur, constraints og 61/61 sveitarfélagskóðar staðfestir |
| `npm run test:run -- <HMS/location test files>` | 129/129 HMS/location próf græn; UI viðbót 5/5 græn |
| `npm run test:run -- lib/__tests__/weather-routes-api.test.ts lib/__tests__/places-provider-candidate.test.ts` | Exit 0, 49/49 eftir legacy-ID lagfæringu |
| `npm run type-check` | Exit 0; loka-keyrsla eftir sameiningu |
| `npm run test:run` | Exit 0; 179 passed, 1 skipped test files; 4011 passed, 28 skipped, 8 todo |
| `npm run build` | Exit 0; Next.js 15.5.14 production build, 107 static pages |
| Targeted ESLint á nýjum/breyttum scope skrám | Exit 0, engar errors; aðeins fyrirliggjandi RoadMap hook warnings þegar stóra skráin var tekin með |
| JSON parse á `messages/is.json`, `messages/en.json`, `vercel.json` | Exit 0 |
| `git diff --check` | Exit 0; aðeins Windows LF→CRLF viðvaranir |

## 6. Niðurstöður og exit codes

- TypeScript: grænt.
- Loka full test suite: **4011 passed**, 28 skipped, 8 todo, engin failure.
- Production build: exit 0.
- HMS/location targeted coverage: **134/134 passed** áður en full suite var keyrð.
- Build sýnir fyrirliggjandi hook dependency, `<img>` og Browserslist warnings; engin ný build-villa kom fram.
- Fyrirliggjandi jsdom `Not implemented: navigation to another Document` birtist tvisvar en er non-failing output.

## 7. Hvað mistókst eða var sleppt

- Fyrsta fulla test suite keyrslan var 4010/4011: gamalt test krafðist þess að numeric legacy `placeId` væri hunsað. Validator var lagaður til að fail-a örugglega yfir í staðfest hnit; targeted og full endurkeyrsla urðu grænar.
- Engin browser automation, sjónræn skjámynd eða raun-geolocation permission prófun var gerð; Stebbi keyrir localhost checks.
- SQL migration var skrifuð en **ekki keyrð**.
- HMS CSV var lesin í tímabundinni local audit skrá en **ekki flutt inn í Supabase**.
- Enginn dev server var ræstur eða endurræstur.
- Ekkert commit, push, deploy, Vercel env change, cron-call eða production change var gert.

## 8. Ákvarðanir sem Codex tók

- HMS er canonical opinber address/special-name source; static locality listi fyllir í þá merkingu sem heimilisfangaskrá veitir ekki.
- Leitarstrengir fara í POST body og svör eru `private, no-store`; privacy var sett framar shared query-cache.
- Google fallback er exact opt-in og aðeins keyrður þegar local sources finna ekkert.
- Provider identity og place provenance eru aðskilin svo nýir POI-gjafar geti komið síðar án þess að endurtengja route/weather flows.
- GPS er user-triggered one-shot og aldrei auto-save. Reverse lookup er eingöngu heiðarlegt secondary label, ekki coordinate snapping.
- HMS töflur/RPC eru service-role-only; client fær aldrei beinan HMS table access.
- Built-in FTS var valið fremur en ný `pg_trgm` extension: það styður indexað multi-token prefix search með minna migration-yfirborði.
- Refresh er disabled-by-default þar til HMS reuse/attribution skilmálar hafa verið staðfestir.

## 9. Áhætta sem er enn til staðar

- HMS-síðan skýrir gagnasnið og uppfærslur en endurnýtingar-/attribution-skilmálar fundust ekki nógu skýrt í auditinu. `HMS_PLACE_DIRECTORY_REFRESH_ENABLED` á að vera false þar til þetta er staðfest.
- Migration og import hafa ekki verið keyrð gegn Supabase. SQL contract er prófað statically, en raun-query plan, index-stærð og import-tími þarf staging/production-safe mælingu.
- Án virks HMS datasets eru aðeins static staðir tiltækir nema tímabundni Google fallback sé explicitly virkjaður. Rollout-röðin hér að neðan er því mikilvæg.
- 38 MB/137k-place import notar chunked PostgREST inserts og 300 sekúndna route budget. Það er ekki mælt gegn raun-Vercel/Supabase latency enn.
- Nearest HMS label getur verið allt að 25 km frá GPS-punkti. Textinn segir því `Nálægt …` og aðalheitið helst `Núverandi staðsetning`.
- HMS er ekki fullkomin fyrirtækja-/POI-skrá; fyrirtækjaleit getur þurft nýjan provider síðar.
- Google Maps og Google Routes eru áfram notuð fyrir kort/leiðir. Þessi breyting losar staðaleitina, ekki allt veðurkortakerfið, undan Google.
- Mobile keyboard/focus og browser permission þarf raunprófun þótt component tests og build séu græn.

## 10. Tillaga að næsta skrefi

1. Stebbi keyrir localhost checks hér að neðan með núverandi local gögnum/static leit.
2. Staðfesta opinbera HMS endurnýtingar- og attribution-skilmála.
3. Fyrir rollout: virkja tímabundið `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=true` svo enginn address-search gluggi myndist meðan HMS er bootstrap-að.
4. Keyra `sql/94_hms_place_directory.sql` með sérstöku production/Supabase leyfi.
5. Deploya kóðann með `HMS_PLACE_DIRECTORY_REFRESH_ENABLED=true` aðeins eftir skilmálastaðfestingu og kalla authenticated admin refresh einu sinni.
6. Staðfesta active dataset, fjölda, search/reverse latency og nokkur raunföng.
7. Setja `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=false` og staðfesta að engin Places-köll fari til Google.
8. Halda TODO-093 opnu þar til localhost og rollout hafa verið staðfest; færa þá í DONE.

## 11. Atriði sem næsta rýni ætti sérstaklega að skoða

- HMS reuse/attribution heimild og hvort attribution þurfi að birtast í UI eða skjölum.
- `EXPLAIN (ANALYZE, BUFFERS)` fyrir exact, prefix, multi-token og reverse query á active dataset.
- Raun-import-tíma, peak memory og fjölda PostgREST requests í staging/controlled production run.
- Hvort 25 km reverse-label radius eigi að vera minni eftir raunprófun á dreifbýli.
- Hvort fyrirtækja-/POI-leit þurfi afmarkaðan annan íslenskan gagnagjafa.
- Mobile keyboard focus-handoff Frá → Til og permission denial á iOS/Safari/Android.

## 12. Supabase, SQL, auth og production

- **SQL skrifað:** `sql/94_hms_place_directory.sql`.
- **SQL keyrt:** nei.
- **Supabase gögn lesin/skrifuð:** nei.
- **Fyrirhuguð gögn:** opinber HMS staðföng í versionuðum service-role-only töflum; engar leitarskipanir, GPS-hnit eða notendagögn vistuð.
- **RLS/grants:** nýju töflurnar hafa RLS, engar client policies og grants aðeins til `service_role`.
- **Auth:** public/auth weather access er áfram ákvarðað server-side; exact middleware pass-through veitir ekki sjálft aðgang.
- **Secrets:** engin secrets lesin eða birt. `CRON_SECRET` og service-role eru áfram server-only.
- **Production/deployment/billing:** engin breyting framkvæmd. Tímabundinn Google fallback getur valdið Places-kostnaði ef hann er virkjaður; local HMS leit gerir það ekki.
- **Rollback:** promote RPC getur virkjað nýjasta `retired` dataset aftur; full schema rollback er skjalfest neðst í migrationinni.

## Route intelligence check

- Route geometry og provider route computation voru ekki breytt af HMS importinu.
- Valdir HMS/GPS/static staðir nota staðfest WGS84-hnit og `placeId='confirmed'` sentinel gagnvart núverandi route adapter.
- Aðeins explicit Google source má bera Google routing ID.
- RoadMap direct typing, autocomplete og map/static paths sameinast nú í sama provider-neutral contract.
- GPS er leyft sem origin en ekki destination í route-formum; það passar venjulegt „hér → þangað“ flæði og dregur úr óvart permission-beiðnum.

## Design.md samræmi

- 16 px input kemur í veg fyrir óæskilegt mobile zoom.
- Interactive controls eru minnst 40 px og niðurstöður scrolla innan capped listbox.
- Combobox/listbox ARIA, keyboard navigation, loading, empty, rate-limit og error feedback eru til staðar.
- Engin auto-focus/geolocation á initial render; mobile keyboard og permission prompt opnast aðeins eftir notandaaðgerð.
- RoadMap focus-handoff færir notanda frá Frá yfir í Til eftir gilt val.
- Allur nýr notendatexti er í `messages/is.json` og `messages/en.json`.

## 13. Localhost checks for Stebbi

**Slóð/state:** Opnaðu `/vedrid` og `/auth-mvp/vedrid/ferdalagid` eða núverandi RoadMap-flæði á localhost. Prófaðu bæði public mode og innskráðan notanda ef báðir mode-ar eru virkir. Ekki keyra SQL/import á production sem hluta af þessum checks.

1. Opnaðu staðaleit og sláðu inn `Reykjavík`, `Akureyri` og `Höfn`.
   - Vænt: niðurstöður birtast eftir stutta bið; engin Google Places library request þarf að eiga sér stað.
   - Án HMS migration/imports er static locality leit væntanlegt fallback.
2. Eftir controlled HMS bootstrap, prófaðu `Laugavegur 10`, `thingholtsstraeti`, fullt heimilisfang með póstnúmeri, aðeins póstnúmer, dreifbýlisbæ og `SERHEITI`/sumarhús.
   - Vænt: að hámarki 8 niðurstöður, exact/prefix fremst og multi-token orð mega vera í annarri röð.
   - Vænt: íslenskir stafir og ASCII leit skila sömu canonical stöðum.
3. Skoðaðu Network tab meðan leitað er.
   - Vænt: `POST /api/place/search` með query í body; engin heimilisfangaleit í URL.
   - Vænt: response hefur `Cache-Control: private, no-store`.
4. Prófaðu ArrowDown/ArrowUp, Home, End, Enter, Escape og Tab.
   - Vænt: sýnilegt val fylgir lyklum, Enter velur nákvæmlega einn stað og Escape lokar niðurstöðum án þess að eyða texta.
5. Veldu Frá í RoadMap/Ferðalaginu.
   - Vænt: focus færist mjúklega í Til og ný innsláttur yfirskrifar ekki Frá.
   - Vænt: ekki er hægt að velja sama HMS source/sourceId sem báða enda.
6. Smelltu `Nota núverandi staðsetningu` fyrir origin.
   - Vænt: browser biður um leyfi aðeins eftir smellinn.
   - Vænt: valið heitir `Núverandi staðsetning`; secondary texti má segja `Nálægt …` en route marker notar nákvæmu GPS-hnitin.
   - Vænt: GPS-staðurinn birtist ekki sjálfkrafa undir `Nýlegir staðir` eftir refresh/nýtt flæði.
7. Prófaðu að hafna permission, láta request timeout-a ef hægt er og prófa óöruggt/non-Iceland mock state í DevTools.
   - Vænt: stuttur, rólegur og þýddur villutexti; notandi getur strax leitað handvirkt.
8. Prófaðu 360, 390, 460 og iPad 768x1024 með keyboard opið og lokað.
   - Vænt: ekkert mobile zoom, horizontal overflow, overlap eða tap á combobox/listbox focus.
9. Prófaðu hæga leit, tvær hraðar mismunandi queries og 429 response.
   - Vænt: stale fyrra svar yfirskrifar ekki nýrri niðurstöðu og rate-limit texti segir að bíða aðeins.
10. Veldu HMS stað og reiknaðu leið/veður.
    - Vænt: route request ber `source='hms'` + `sourceId`, en HMS HEINUM kemur aldrei fram sem Google `placeId`; leiðin notar valin WGS84-hnit.
11. Prófaðu almenna Veðrið-spurningu sem finnur ekki stað og veldu síðan stað úr PlaceSearch.
    - Vænt: staðfest hnit og sama birtingarheiti fara í veðurútreikning og kort.
12. Eftir bootstrap skaltu leita að fyrirtæki sem er ekki HMS `SERHEITI`.
    - Vænt: með Google fallback false er í lagi að engin niðurstaða finnist; UI má ekki fullyrða að HMS sé tæmandi fyrirtækjaskrá.

**Regressions:** Saved places eiga áfram að virka og eyðast einu sinni; route calculation, Google map rendering og Google Routes mega ekki bila; current location má aldrei verða destination-button sjálfkrafa; GET `/api/place/search?q=...` á að skila 405.

**Rollout-varúð:** Ekki setja `HMS_PLACE_DIRECTORY_REFRESH_ENABLED=true`, keyra `sql/94`, kalla admin refresh eða prófa með production GPS/notendagögnum án sértæks rollout-leyfis. Ef kóðinn er deployaður áður en active HMS dataset er tilbúið skal tímabundni Google fallback vera explicit virkur til að forðast address-search regression og svo slökktur aftur þegar HMS hefur verið staðfest.
