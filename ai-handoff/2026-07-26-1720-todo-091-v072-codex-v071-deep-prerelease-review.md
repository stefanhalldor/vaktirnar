# TODO-091 v072 — djúp Codex prerelease-rýni á v071 og sameinað release-handoff

**Tími:** 2026-07-26 17:20 (Atlantic/Reykjavik)  
**Rýnt skjal:** `2026-07-26-1639-todo-091-v071-codex-forecast-table-day-history-prerelease.md`  
**Tengd útgáfuverk:** TODO-046 OTP, TODO-090 leiðasamanburður/Teskeiðarleiðir/LKG road graph og TODO-091 spátöflusaga  
**Framkvæmdarleyfi:** Stebbi gaf afmarkað leyfi til kóða-, prófa- og handoff-breytinga. Ekki var heimilt að keyra SQL, breyta Supabase/production, env, commit-a, push-a, deploya eða ræsa dev server.

## Findings fyrst

### Hátt — lagað: dagurinn í dag gat enn horfið úr spátöflunni

`WeatherChasePanel` bjó áður dagadálka aðeins til út frá röðum sem höfðu þegar borist. Það braut kjarnakröfuna þegar valinn tími dagsins var liðinn eða met.no-saga var ekki enn komin: taflan gat stokkið beint á morgundaginn.

Lagað í `components/weather/WeatherChasePanel.tsx:262-315`: taflan býr nú alltaf til nákvæmlega sjö almanaksdaga frá `windowStartDay`. Vanti gildi fyrir stað/tíma birtist heiðarlegt strik, en dagurinn hverfur ekki.

### Miðlungs — lagað: gagnagrunnsbilanir gátu litið út eins og gild en tóm saga

Supabase read- og prune-villur voru að hluta gleyptar. Það hefði getað falið migration-vöntun eða gagnagrunnsbilun sem „engin eldri spá“.

Lagað í `lib/weather/weatherChaseHistory.server.ts:90-101`, `:213-242` og `:245-278`: query-, range- og prune-villur kasta nú stöðluðum server-villum. API skilar 503 og UI heldur núverandi töflu sýnilegri með einu retry-ástandi.

### Miðlungs — lagað: history-cache gat orðið úrelt og gömul röð unnið yfir nýja

History-beiðnir voru cache-aðar án útgáfu á viðmiðum. Breytt vind-/úrkomumörk gátu því skilið eftir gamlar status-litanir. Samruni gat líka varðveitt eldri röð fyrir sama dag/tíma.

Lagað í `components/weather/WeatherChasePanel.tsx:498`, `:637-675` og `components/weather/RoadMapPrototypeMap.tsx:7772`: request-lykill inniheldur nú threshold/provider-state útgáfu, cached `availableFromDay` er endurheimt og nýtt dagsvar skiptir út eldri röðum þess dags. Núverandi base-röð vinnur áfram yfir history-röð fyrir sama tíma.

### Miðlungs — lagað: Veðurstofu-gate gat lokað met.no-sögu hjá public notanda

Sameiginleg request með bæði Veðurstofu og met.no gat fengið 404 þegar aðeins Veðurstofan var per-user takmörkuð. Þá tapaðist met.no-hlutinn líka og væntanleg 404 gat birst í console.

Lagað í `app/api/teskeid/weather/forecast-history/route.ts:15-25` og `components/weather/RoadMapPrototypeMap.tsx:1922-1992`: API takmarkar aðeins request sem raunverulega biður um Veðurstofu; client skiptir providerum í afmarkaðar beiðnir, sleppir Veðurstofu meðan aðgangsstaða er óþekkt/takmörkuð og sameinar þau provider-svör sem tókst að sækja. Þetta veikir ekki Veðurstofu-gate.

### Miðlungs — lagað: ytri met.no-köll höfðu ekki fast tímamark

43 punkta warmup gat hangið á ytri fetch og farið fram úr Vercel glugga.

Lagað í `lib/weather/metno.server.ts:7-8` og `:114-127`: hvert upstream-kall fær 12 sekúndna `AbortController`-mörk og notar áfram stale cache ef hann er til. Með fimm samhliða punktum í níu lotum er ytri bið nú bounded innan 300 sekúndna route-budget.

### Miðlungs — lagað: gateway-timeout í OTP gat sýnt rauða definitive villu eftir að póstur fór af stað

Fyrri lagfæring greindi provider-niðurstöðu, en client túlkaði enn öll non-2xx svör sem endanlega bilun. Fullt testasafn fann einnig að response-lagaður hlutur án `json()` fór ranglega í network-óvissu.

Lagað í `lib/auth/email.ts:4-19`, `components/teskeid/TeskeidLoginForm.tsx:54-89` og tengdum prófum: provider hefur 10 sekúndna mörk; skýr provider-höfnun er `failed`; timeout/network og 408/425/502/503/504 án `{success:false}` eru `uncertain`; skýr app-höfnun heldur notanda á netfangsskrefi. Virkur kóði er ekki ógiltur þegar niðurstaðan er óviss.

### Lágt — lagað: ólöglegar dagsetningar og óstöðug pagination

`2026-02-30` gat farið í gegnum regex og offset-pagination vantaði fullkomlega deterministic röðun við jafna timestampa.

Lagað í `lib/weather/weatherChaseHistory.server.ts:298-361` og `:392-430`: dagsetning er roundtrip-staðfest og query-röðun fylgir provider/id, forecast time og cycle time þannig að page-boundary sleppi hvorki né tvítelji raðir.

### Lágt/UX — lagað: endurtekinn loading-texti og fyrsta-render flash

Pending-texti gat birst í hverjum af sjö dagadálkum og blocking-loader gat blikkað þó önnur provider-röð væri þegar tiltæk. Textinn uppfyllti heldur ekki nýjustu orðalagsósk Stebba.

Lagað í `components/weather/WeatherChasePanel.tsx:563-566`, `:684-705` og `messages/is.json:1184`: eitt stöðuorð birtist við viðkomandi stöð, taflan birtist strax ef einhver provider-röð er til og textinn er nákvæmlega **„Sæki spá...“**. Enska er **“Fetching forecast...”**.

### Lágt — lagað: tvær nýjar React dependency-viðvaranir

Leiðakortabreytingarnar skildu eftir nýjar lint-viðvaranir fyrir `currentDrawableRoutes` og `formatDurationMinutes`.

Lagað með `useMemo`/`useCallback` í `components/weather/DriveRouteMap.tsx:94-107`, `:279-305` og `components/weather/RoadMapPrototypeMap.tsx:1436-1445`. Selection/style update heldur áfram að breyta MapLibre-lögum in-place án map rebuild.

## Óleyst findings / blockerar

Enginn óleystur kóðablocker fannst eftir lagfæringar, fullt testasafn og production-build.

Útgáfan er samt **ekki tilbúin til raunprófunar á history/LKG virkni fyrr en Stebbi hefur sjálfur keyrt SQL 92 og SQL 93 í réttri Supabase-uppsetningu og bootstrapað road graph snapshot**. Það er deployment-forsenda, ekki óleyst kóðavilla.

## Plan þessa áfanga

1. Rýna v071, diff, SQL 93 og tengd API/client boundaries.
2. Rýna tengda prerelease-pakkann: OTP, public console, leiðasamanburð og SQL 92/LKG graph.
3. Laga staðfest findings án production/SQL breytinga.
4. Keyra markpróf, allt testasafnið, type-check, diff-check og production-build.
5. Skila einum sameinuðum localhost/release gátlista.

## Hvað var raunverulega gert

- Sjö daga taflugluggi var gerður calendar-fastur og heldur deginum í dag inni óháð því hvort valinn tími er liðinn.
- Dagafletting aftur á bak, history retry, cache-versioning og replacement semantics voru hert.
- Provider-history var aðskilið svo leyfilegt met.no tapist ekki með takmarkaðri Veðurstofu.
- Supabase read/prune/range failures voru gerð sýnileg.
- met.no upstream fetch fékk 12 sekúndna tímamörk með stale-cache fallback.
- OTP provider/gateway óvissa var aðgreind frá endanlegri höfnun og 10 sekúndna provider-tímamörk bætt við.
- Loading-texti var breytt í „Sæki spá...“, aðeins einu sinni á stöð, og fyrsta-render blocking flash fjarlægt.
- Nýjar React dependency-viðvaranir úr leiðakortabreytingunum voru fjarlægðar.
- SQL 92 og SQL 93 voru rýnd read-only. Hvorugt var keyrt.

## Skrár skoðaðar

Meðal annars:

- `WORKFLOW.md`, `Design.md`, `AGENTS.md`
- v071, v014, v016, v017 og Claude v018 handoff-skjölin
- `sql/84_metno_point_forecasts_history.sql`
- `sql/92_teskeid_road_graph_snapshots.sql`
- `sql/93_weather_chase_metno_place_history.sql`
- öll history-, route candidate-, graph snapshot-, OTP- og route comparison files sem tengjast þessum release-pakka

## Skrár breyttar í þessari djúprýni

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DriveRouteMap.tsx`
- `components/teskeid/TeskeidLoginForm.tsx`
- `lib/weather/weatherChaseHistory.server.ts`
- `lib/weather/metno.server.ts`
- `lib/auth/email.ts`
- `app/api/teskeid/weather/forecast-history/route.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- `lib/__tests__/weather-chase-history.test.ts`
- `lib/__tests__/weather-forecast-history-api.test.ts`
- `lib/__tests__/weather-metno.test.ts`
- `lib/__tests__/login-form.test.tsx`
- `lib/__tests__/auth-email-delivery.test.ts`
- þetta handoff

Ath.: vinnusvæðið var þegar mjög dirty vegna samþykkta release-vinnupakkans og inniheldur einnig `.obsidian/workspace.json`. Sú skrá var ekki snert í þessari rýni og engu user/Claude-verki var rúllað til baka.

## Skipanir og niðurstöður

- `npm run type-check` — exit 0 (endurkeyrt eftir lokabreytingar).
- Markpróf fyrir forecast/history/auth/route map — 64/64 pass í lokin.
- Fyrsta fulla `npm run test:run` — 2 OTP client-próf fundu raunverulegt response-shape regression; það var lagað.
- Lokalegt `npm run test:run` — exit 0; **160 test files passed, 1 skipped; 3796 tests passed, 28 skipped, 8 todo**.
- Lokalegt `npm run build` — exit 0; Next.js production-build, type/lint phase og 105 static page generation pass.
- `git diff --check` — exit 0.
- JSON parse á `messages/is.json` og `messages/en.json` — exit 0.

Build sýnir eldri `react-hooks/exhaustive-deps` viðvaranir í stórum map/components og eina `<img>` viðvörun. Tvær nýju viðvaranirnar sem komu frá þessum leiðakortspakka voru lagaðar. Engin build-villa er eftir.

## Hvað mistókst eða var sleppt

- Fyrsta fulla testakeyrsla mistókst í tveimur OTP client-prófum; orsökin var greind og lagfærð, síðan allt endurkeyrt grænt.
- Engin browser-/localhost-/rauntækjaprófun var keyrð af Codex; Stebbi á dev server og prófar sjálfur.
- SQL 92 og 93 voru ekki keyrð.
- Road graph refresh/bootstrap var ekki kallað.
- met.no warmup endpoint var ekki kallað.
- Engu var commit-að, push-að eða deployað.

## Ákvarðanir

- Taflan sýnir alltaf sjö **almanaksdaga**, ekki aðeins daga sem núverandi provider-response inniheldur.
- Vanti gildi er birt `–`; UI má ekki færa daginn hljóðlega.
- „Eldri spá“ er forecast-as-known-at-valid-time, ekki mæling og ekki núverandi hindcast.
- Provider-history er fail-soft milli providera en fail-closed innan Veðurstofu access-gates.
- Aðeins canonical `ROAD_MAP_PLACES` og skráðar Veðurstofustöðvar mega fara í history API; engin arbitrary coordinates eða user routes eru vistuð.
- OTP timeout er óviss niðurstaða, ekki sönnun um bilun. Skýr provider-höfnun er áfram endanleg bilun.
- Google er áfram default/applied leið þar til notandi ýtir á „Skoða veðurskilyrði fyrir þessa leið“; kort-preview sjálft endurreiknar ekki veður.
- Teskeiðarleiðakerfið er strict opt-in: global env þarf að vera nákvæmlega `true` og notandi þarf `feature_access` fyrir `teskeid-routing-v1`.

## SQL / Supabase / öryggi

### SQL 92 — `sql/92_teskeid_road_graph_snapshots.sql`

- **Skrifuð, rýnd, ekki keyrð.**
- Service-role-only metadata og private Storage bucket.
- RLS virkt; `PUBLIC`, `anon` og `authenticated` afturkölluð; engin user gögn.
- Eitt `active` og eitt `building` hámark, advisory locks og 20 mínútna stale lease.
- Promotion/rollback er atomic. Claude v018 fann engan blocker; Codex fann heldur engan nýjan blocker.

### SQL 93 — `sql/93_weather_chase_metno_place_history.sql`

- **Skrifuð, rýnd, ekki keyrð.**
- Transactional og endurkeyranleg fyrir ætlaða schema-stöðu eftir SQL 84.
- Bætir aðeins canonical `road_map_place` við check constraint og index fyrir provider/id/forecast/cycle lestur.
- Taflan er áfram service-role-only með RLS; engin user ID, leit, route eða arbitrary coordinates.
- Rollback-comment er destructive fyrir uppsafnaða `road_map_place` sögu og má ekki keyra án sérstaks leyfis.

### Deployment-röð

1. Stebbi keyrir SQL 92.
2. Stebbi keyrir SQL 93.
3. Sem admin, á réttu umhverfi, bootstrapar Stebbi road graph með `POST /api/admin/weather/refresh-road-graph`.
4. Staðfesta nákvæmlega einn `active`, engan `building`, golden pass = total og private bucket/object.
5. Deploya kóða með candidate global flag áfram þröngu og aðeins afmörkuðum `teskeid-routing-v1` notendum.
6. Sem admin kalla `POST /api/admin/weather/warm-metno-points` einu sinni eða bíða eftir cron áður en met.no history er metið.
7. Keyra localhost/preview smoke-listann hér að neðan.
8. Víkka per-user aðgang aðeins eftir staðfestingu.

## Áhætta sem er enn til staðar

- SQL/migrations og raunveruleg Supabase schema-staða hafa ekki verið staðfest af Codex.
- Fyrsta met.no history eftir SQL 93 er eðlilega strjál. Kerfið má ekki falsa fortíð sem var aldrei vistuð.
- Cold road graph runtime þarf virkt snapshot; án bootstrap er rétt hegðun `pending/unavailable`, ekki live Vegagerðin bygging á user request.
- MapLibre, safe-area, keyboard/focus, lárétt overflow og raunveruleg provider latency þurfa browser/rauntækjaprófun.
- Build heldur áfram að sýna eldri hook-warning backlog. Hann blokkar ekki þennan release en ætti að vera sérverkefni, ekki laumubreyting hér.

## Tillaga að næsta skrefi

Stebbi keyrir SQL 92 og 93, bootstrap/warmup á afmörkuðu umhverfi og fer síðan í prófanir hér að neðan. Ef þær eru grænar má Claude Code gera loka diff-review fyrir commit/deploy; ekki ætti að bæta nýjum feature-scope inn í sama release.

## Spurningar fyrir Claude Code

1. Sér Claude einhverja access-/RLS-leið fram hjá provider-aðskilnaðinum eða service-role-only töflunum?
2. Er production deployment-röðin rétt miðað við raunverulega Supabase/Vercel stillingu Stebba?
3. Eru einhver current hook-warning í `RoadMapPrototypeMap` sem Claude telur release-blocker fyrir breyttu state-flæðin, fremur en eldri backlog?
4. Er `after()` studd eins og gert er ráð fyrir í núverandi Vercel/Next 15 runtime fyrir candidate warm-up?

## Localhost checks for Stebbi

### A. Spátöflan og dagsaga — TODO-091, hæsti forgangur

**Forsenda:** SQL 93 keyrt og helst eitt admin met.no warmup. Prófa bæði `/vedrid` sem public og `/auth-mvp/vedrid` sem innskráður notandi.

1. Stilltu sýnilegan tíma á `00` eða `12` eftir að sá tími er liðinn.
   - Vænt: dagurinn í dag er fyrsti dagur, ekki morgundagurinn.
   - Ef gildið var vistað sést það; annars sést `–`. Dagurinn má ekki hverfa.
2. Staðfestu nákvæmlega sjö dagsetningar í töflunni.
3. Notaðu blandað val af Veðurstofu og met.no.
   - Vænt: taflan birtist um leið og önnur veitan hefur gögn.
   - Hver óklár stöð sýnir aðeins einu sinni `Sæki spá...`; ekki texta í hverjum dagsdálki og ekki þrefaldan loader.
4. Ýttu á vinstri ör dag fyrir dag.
   - Vænt: textinn segir „Eldri spá, ekki mæling“.
   - Fletting stoppar við elsta raunverulega retained day, að hámarki 14 daga.
   - Hægri ör fer aftur að deginum í dag.
5. Breyttu stöðvavali meðan eldri dagur er opinn.
   - Vænt: engin gömul röð lekur milli staða; range/loading uppfærist.
6. Breyttu vind-/úrkomumörkum.
   - Vænt: litir/status endurreiknast; history-cache sýnir ekki gamla flokkun.
7. Hermdu eftir history-bilun ef þú hefur örugga local leið.
   - Vænt: núverandi tafla helst sýnileg, ein villa og einn „Reyna aftur“ takki.
8. Ef `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`, prófaðu public með met.no-stað.
   - Vænt: met.no birtist; engin Veðurstofu 401/404 beiðni eða rauð console-villa.
9. Staðfestu að núverandi met.no point response og venjuleg spásýn hafi ekki breyst.
10. Mobile 330/360/390/460 px: ekkert zoom, overlap eða page-level lárétt overflow; innri tafluscroll má vera láréttur.

### B. OTP / innskráning — TODO-046

**Notaðu controlled test mailbox. Ekki breyta production secrets eða provider-configi til að framkalla villu.**

1. Opna `/innskraning`, slá inn netfang og fá fyrsta kóða.
2. Vænt: kóðaskjár og 120 sek. niðurtalning; kóðinn virkar í 10 mínútur.
3. Reyna strax aftur innan 120 sek.
   - Vænt: ekki endilega nýr póstur; fyrsti ónotaði kóðinn virkar áfram.
4. Eftir niðurtalningu velja „Senda aftur“.
5. Ef network/gateway niðurstaða er óviss:
   - Vænt: amber skilaboð segja að kóðinn gæti hafa farið af stað; skoða póst áður en reynt er aftur.
6. Skýr server/provider-höfnun:
   - Vænt: rauð almenn villa og notandi helst á réttu skrefi; engin fölsk success-niðurstaða.
7. 360/390/460 px og iPhone Safari: enginn input zoom, clipping eða overlap; bak/resend controls auðvelt að ýta á.
8. Smoke-prófa eldri admin/waitlist email-flæði ef þau eru tiltæk, því sameiginlegur `send()` helper breyttist.

### C. Public console og manifest

**Forsenda:** signed out, `AUTH_MVP_ENABLED=true`, `WEATHER_ENABLED=All`.

1. Opna `/vedrid`; prófa Spágögn, Kort og Akstur Reykjavík → Ísafjörður.
2. Vænt: engar 401/404 console-villur frá public forecast/history/road-intelligence lestri.
3. Public notandi má ekki senda Teskeið candidate request.
4. Opna `/manifest.json` beint.
   - Vænt: gilt JSON, ekki auth HTML/syntax error.
5. Preload warnings mega vera browser/Next noise, en rauðar auth/API villur mega ekki vera væntanleg hegðun.

### D. Leiðasamanburður og fullscreen kort — TODO-090

**Forsenda:** innskráður route-enabled notandi; Google leiðir tiltækar; candidate má vera þröngt flaggaður.

1. Reikna leið með tveimur eða fleiri valkostum.
2. Vænt: hver leið hefur stöðugan og greinilega ólíkan lit í korti, legend og korti/cards.
3. Aðeins ein leið fær „Besta veðrið ef lagt er af stað núna“, nema nákvæmlega sama station-set og sama lágmarksskor gefi löglegt tie.
4. Smella milli leiða í cards og korti.
   - Vænt: aðeins preview-kort breytist lightning fast; MapLibre endurbyggist ekki og veður/stöðvar/scrubber endurreiknast ekki enn.
5. Ýta á „Stækka kort“ í litla leiðakortinu.
   - Vænt: fullscreen dialog, lokun með X og Escape, background scroll læstur, safe-area virt.
6. Velja leið og ýta á „Skoða veðurskilyrði fyrir þessa leið“.
   - Vænt: þá fyrst endurreiknast veður, stöðvar og scrubber fyrir valda leið.
7. Loka án apply.
   - Vænt: applied veðurútreikningur helst á fyrri leið.
8. Athuga textann undir leiðavali.
   - Vænt: hann nefnir raunheiti þeirrar Google-leiðar sem veðurgögnin eiga enn við, þar til ný leið er applied.
9. Stækka venjulega route map líka.
   - Vænt: „Stækka kort“ er efst til hægri og attribution/disclaimer hylur hann ekki.
10. 360/390/460 px: cards, attribution, CTA og modal controls valda ekki page overflow eða overlap.

### E. LKG road graph og Teskeiðarleiðir — SQL 92

**Þetta snertir Supabase/storage og á aðeins að prófa á vísvitandi umhverfi. Ekki beina local admin-kalli óvart á production.**

1. Eftir SQL 92, sem admin á réttu umhverfi:
   - `fetch('/api/admin/weather/refresh-road-graph',{method:'POST'}).then(r=>r.json())`
2. Vænt: `ok`, `skipped: unchanged` eða `already_running` eftir stöðu, ekki hang eða raw stack.
3. Staðfesta í DB:
   - nákvæmlega eitt `active`
   - enginn fastur `building`
   - `golden_route_pass_count = golden_route_total_count`
4. Staðfesta að bucket/object sé private og ekki lesanlegt anon/authenticated.
5. Með global `TESKEID_ROUTE_CANDIDATE_ENABLED=true` og per-user `teskeid-routing-v1`:
   - Teskeið candidate birtist aðeins þeim notanda.
   - Endurtekin sams konar leið kemur hratt úr warm/LKG state.
6. Slökkva annaðhvort global eða per-user gate.
   - Vænt: candidate hverfur; Google heldur áfram að virka.
7. Cold runtime/preview smoke eftir deploy:
   - virkt snapshot má ekki enda í varanlegu `route_unavailable`.
   - tímabundið `pending` á cold materialisation á að retry-a sjálfkrafa og birta leið þegar hún er tilbúin.

### F. Prerelease loka-smoke

1. Prófa bæði public `/vedrid` og auth `/auth-mvp/vedrid`.
2. Prófa Google-only notanda og route-enabled notanda.
3. Prófa desktop og raunverulegan síma, sérstaklega iPhone Safari safe-area/keyboard.
4. Skoða Network og Console meðan:
   - Spágögn opnast
   - stöð bætist við
   - eldri dagur er sóttur
   - leið er preview-uð
   - leið er applied
   - OTP er beðið um/resend-að
5. Ekki samþykkja release ef rauðar expected 401/404/503 beiðnir birtast í eðlilegu public flæði, ef dagurinn í dag hverfur eða ef route apply skilar ekki fullum scrubber/station state.

