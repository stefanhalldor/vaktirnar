# Forecast table: full current day and bounded history — prerelease handoff

Created: 2026-07-26 16:39  
Timezone: Atlantic/Reykjavik  
Relevant TODO: #091 — Veðrið product/promotion work

## Skilningur á samþykki

Stebbi samþykkti að Codex framkvæmdi spátöflubreytinguna og allt sem henni tengist. Umfangið var kóði, þýðingar, próf, provider-neutral sögusamningur, afmörkuð bakgrunnssöfnun og SQL migration-skrá. Það fól ekki í sér að keyra SQL, breyta Supabase/production, breyta env/secrets, commit-a, push-a eða deploya.

## Plan áfangans

1. Halda sjö daga töfluglugga en festa sjálfgefinn upphafsdag við daginn í dag, óháð því hvort valinn klukkutími er liðinn.
2. Sækja spágildi dagsins í dag úr varðveittri spásögu og blanda þeim saman við núverandi/framtíðarspá.
3. Leyfa daglega flettingu aftur á bak, en aðeins að elsta raunverulega varðveitta gildi og að hámarki 14 daga.
4. Merkja eldri gildi skýrt sem eldri spá en ekki mælingu.
5. Nota provider-neutral canonical ID samning fyrir Veðurstofuna og met.no.
6. Safna met.no-sögu aðeins í afmörkuðu cron/admin-verki, ekki við hverja public töflubeiðni.
7. Vernda RLS/grants, forðast notenda-/leiðargögn og staðfesta með markprófum, heildarsvítu, type-check og build.

## Hvað var raunverulega gert

- Spátöflan byrjar nú alltaf á deginum í dag. Gildi kl. 00:00 eða 12:00 sjást áfram í dálki dagsins þótt sá tími sé liðinn.
- Bætt var við 40 px fyrri-/næsti-dag controls ofan við töfluna. Notandi getur aðeins farið aftur að elsta varðveitta degi og áfram aftur að deginum í dag.
- Eldri gluggi ber textann `Eldri spá, ekki mæling` / `Older forecast, not an observation`.
- Taflan birtir áfram fyrirliggjandi provider-gildi á meðan gildi vantar í einstaka reiti; tómur reitur sýnir loading-texta eða strik eftir stöðu.
- Nýtt POST API tekur 1–7 canonical stöðvar/staði og einn UTC-dag. Arbitrary coordinates og óþekkt ID eru höfnuð.
- Veðurstofusaga notar `vedurstofan_forecasts_history`. Fyrir hvert gilt tímagildi er valin nýjasta spáhringrás sem var gefin út í síðasta lagi á þeim tíma. Eftirá-spá getur því ekki birst sem fortíðargildi.
- met.no fær provider-neutral `road_map_place` projection í núverandi service-role-only history töflu. Provider `updated_at` er varðveitt sem raunverulegur spáhringur, líka þegar núverandi spá kemur úr cache.
- met.no-sagan er hituð á þriggja tíma fresti fyrir fastan `ROAD_MAP_PLACES` lista, fimm staðir samtímis. Public lestrar skrifa ekki sögugögn.
- Cron keyrir aðeins þegar `AUTH_MVP_ENABLED=true`, `WEATHER_ELTA_VEDRID_FLAG=true` og almenna weather-mode er ekki `off`. Partial collection skilar 503 svo monitoring feli ekki bilun.
- Saga er bundin við 14 daga og hreinsun fjarlægir eldri met.no forecast-times.
- Public API og cron middleware undanþágur eru exact-match; undirslóðir verða ekki sjálfkrafa public.
- Engin user ID, netföng, leit, leið, ferð eða arbitrary hnit eru vistuð.

## Skrár sem voru skoðaðar

- `AGENTS.md`
- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/metno.server.ts`
- `lib/weather/providers/vedurstofanStationsRegistry.ts`
- `lib/road-intelligence/roadMapPlaces.ts`
- `sql/84_metno_point_forecasts_history.sql`
- viðeigandi API routes, middleware, messages og tests

## Skrár sem voru breyttar

### Runtime/UI

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/metno.server.ts`
- `lib/weather/weatherChaseHistory.server.ts` (ný)
- `lib/weather/weatherChaseHistory.types.ts` (ný)
- `app/api/teskeid/weather/forecast-history/route.ts` (ný)
- `app/api/teskeid/weather/metno/point/route.ts`
- `app/api/cron/warm-metno-points/route.ts` (ný)
- `app/api/admin/weather/warm-metno-points/route.ts` (ný)
- `middleware.ts`
- `vercel.json`
- `messages/is.json`
- `messages/en.json`

### SQL

- `sql/93_weather_chase_metno_place_history.sql` (ný, skrifuð en ekki keyrð)

### Prófanir

- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- `lib/__tests__/weather-chase-history.test.ts` (ný)
- `lib/__tests__/weather-forecast-history-api.test.ts` (ný)
- `lib/__tests__/weather-metno-history-routes.test.ts` (ný)
- `lib/__tests__/weather-chase-history-migration.test.ts` (ný)
- `lib/__tests__/weather-metno-point-route.test.ts`
- `lib/__tests__/weather-metno.test.ts`
- `lib/__tests__/middleware.test.ts`

Athugið að worktree inniheldur einnig eldri ócommittaðar breytingar frá OTP-, leiðavali- og road-graph-áföngum, auk `.obsidian/workspace.json`. Þær voru ekki afturkallaðar eða teknar eignarhaldi á í þessum áfanga.

## Skipanir sem voru keyrðar

- `npm run type-check` — exit 0.
- Afmörkuð Vitest keyrsla fyrir átta forecast/history/middleware testskrár — exit 0, 105 próf stóðust.
- `npm run test:run` — exit 0, 160 testskrár stóðust, 1 skipped; 3.789 próf stóðust, 28 skipped, 8 todo.
- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF viðvaranir.
- `npm run build` — exit 0; production build kláraðist. Fyrirliggjandi lint warnings birtust, engin build-villa.

Dev server var hvorki ræstur né endurræstur.

## SQL / Supabase

`sql/93_weather_chase_metno_place_history.sql` var aðeins skrifuð. Hún var **ekki keyrð**.

Migrationin:

- keyrir í transaction;
- víkkar existing `target_type` check úr aðeins `vedurstofan_station` yfir í `vedurstofan_station` og `road_map_place`;
- bætir idempotent index við fyrir place/time/cycle lestur;
- heldur RLS virku;
- afturkallar öll réttindi frá `PUBLIC`, `anon` og `authenticated`;
- veitir aðeins `service_role` SELECT/INSERT/UPDATE/DELETE;
- bætir ekki við auth policy eða browser-accessi;
- geymir engin notendagögn.

Recovery-leiðbeiningar eru kommentaðar neðst í migration-skránni. Þær fela í sér eyðingu safnaðrar `road_map_place` sögu og má ekki keyra án sérstöku samþykkis.

## Útgáfuröð

1. Stebbi rýnir og keyrir `sql/93_weather_chase_metno_place_history.sql` í Supabase.
2. Staðfesta að migration hafi klárast áður en kóðinn er deployaður.
3. Deploya kóðann með núverandi weather/auth flags eftir sérstakri heimild.
4. Cron safnar fyrsta met.no snapshot sjálfkrafa á næstu þriggja tíma keyrslu. Admin getur ræst afmarkað bootstrap eftir innskráningu ef vilji er til þess.

Ef kóði fer út áður en SQL 93 er keyrt heldur núverandi/current spátöflulestri áfram að virka, en met.no history-write mistakast og cron skilar 503. Þetta er ekki æskileg útgáfuröð.

## Hvað var ekki gert

- SQL 92 eða 93 var ekki keyrt.
- Engin Supabase-, production-, env- eða secret-breyting var gerð.
- Ekkert var commit-að, push-að eða deployað.
- Engin met.no-fortíð var tilbúin afturvirkt; hún byrjar að safnast eftir migration og fyrstu cron/admin keyrslu.
- `TODO.md` og `DONE.md` voru ekki breytt.

## Design.md samræmi

- Controls eru mobile-first, 40 px snertiflötur og valda ekki nýju láréttu overflowi utan fyrirliggjandi scrollable töflu.
- Loading-, failure- og retry-feedback er sýnilegt án þess að loka á fyrirliggjandi gögn.
- Allur nýr notendatexti er í `messages/is.json` og `messages/en.json`.
- Eldri spár eru orðaðar skýrt svo notandi rugli þeim ekki saman við mælingar.

## Route intelligence check

Breytingin snertir ekki route-family, canonical vegkafla, control points eða notendaleiðir. Hún notar aðeins núverandi canonical weather-place registry og geymir enga route geometry eða route-interest. Því var `IcelandRoadmap.md` ekki uppfært vegna þessa áfanga.

## Áhætta sem er enn til staðar

- met.no-fortíð verður sparse eða tóm fyrstu dagana eftir útgáfu; kerfið getur ekki búið til sanna gamla spáhringi afturvirkt.
- Sagan er bundin við canonical `ROAD_MAP_PLACES`. Nýr staður þarf að fara í registry áður en API samþykkir hann og cron safnar honum.
- Cron kallar á 43 canonical staði á þriggja tíma fresti, með cache og batch-size 5. Provider-/Vercel-kostnaður og latency þarf að fylgjast með eftir útgáfu.
- `metno_point_forecasts_history` geymir ekki sérstakt gust-gildi. Eldri met.no-gust notar því mean wind sem hlutlaust fallback; núverandi tafla sýnir hita, vind og úrkomu en ekki gust-röð.
- Build sýndi eldri eslint warnings í nokkrum components. Engin þeirra stöðvaði build og engin ný warning var tengd forecast-history effectinu.

## Localhost checks for Stebbi

### Uppsetning

- Stebbi keyrir dev server sjálfur.
- Opna `/vedrid` sem public notandi og `/auth-mvp/vedrid` sem innskráður notandi ef báðar sýnir eru í scope.
- Fyrir sannprófun met.no-fortíðar þarf SQL 93 að hafa verið keyrt í þeirri Supabase-vinnu sem localhost notar og að minnsta kosti eina admin/cron warmup keyrslu. Ekki prófa recovery DELETE-ið.

### Skref og vænt niðurstaða

1. Velja kl. 00 eftir að sá tími er liðinn. Taflan á samt að hafa dálk fyrir daginn í dag og sýna 00-gildið þar sem varðveitt spá er til.
2. Velja kl. 12 eftir hádegi. Dagurinn í dag á áfram að vera fyrsti dagur, ekki morgundagurinn.
3. Velja blöndu af Veðurstofustöð og Yr/met.no stað. Fyrirliggjandi gildi eiga að birtast strax; reitir sem enn eru að hlaðast mega sýna `… enn að sækja spár`/samsvarandi án þess að fela töfluna.
4. Smella á vinstri ör. Taflan á að færast einn dag aftur, sýna dagsetningu og textann `Eldri spá, ekki mæling`.
5. Halda áfram aftur á bak. Vinstri ör á að óvirkjast við elsta varðveitta dag, aldrei leyfa meira en 14 daga.
6. Smella á hægri ör. Hún á að færa gluggann einn dag fram og óvirkjast þegar komið er aftur á daginn í dag.
7. Skipta um valda stöð/stað. Mörk fyrri örvar eiga að endurreiknast fyrir nýja valið og gögn fyrri vals mega ekki leka inn.
8. Þrengja viewport að u.þ.b. 330 px. Örvar og titill mega ekki overlap-a; taflan má scrolla lárétt inni í eigin ramma en síðan sjálf má ekki fá nýtt horizontal overflow eða mobile zoom.
9. Aftengja net eða láta history API skila villu. Fyrirliggjandi tafla á áfram að sjást og retry-texti/takki á að birtast.
10. Með history flags slökkt á API að svara 404 og cron að sleppa söfnun. Ekki breyta production env til að prófa þetta án sérstaks samþykkis.

### Helstu regressions

- Stöðvaval, röðun, veðurviðmið, sýnilegir klukkutímar og medalíu-/litagreining eiga að virka óbreytt.
- Public notandi má ekki fá 401 console-noise frá nýja exact public API-inu.
- Current met.no point loader á að halda sama JSON response contracti og áður.
- Taflan má ekki verða blocking-loader þegar annað provider-gildi er þegar komið.

## Tillaga að næsta skrefi

Claude Code rýnir sérstaklega cycle-selection, SQL 93, public/auth boundary, cron load og React history-effect. Að lokinni rýni keyrir Stebbi SQL 93 og localhost-checklistann. Commit/push/deploy bíða sérstakrar heimildar.

## Spurningar sem Claude Code á sérstaklega að rýna

1. Er `latest issued cycle <= valid time` rétta sannleikslíkanið fyrir eldri spátöflu, eða á vara að velja síðasta cycle fyrir upphaf hvers dags?
2. Er 14 daga retention og þriggja tíma canonical met.no warmup hæfilegt miðað við Vercel/met.no/Supabase álag?
3. Eru allir query-error paths nægilega fail-soft fyrir public töfluna en fail-loud fyrir cron?
4. Getur React history-request cache orðið stale þegar selected items eða thresholds breytast?
5. Er deployment-röðin SQL 93 → code nægilega fail-closed og skýr?

## Óvissa / þarf að staðfesta

Confidence: high fyrir kóða- og prófasamninginn. Medium fyrir raunverulegt cron/provider-áframhaldandi álag þar til fyrsta sólahring production-söfnunar hefur verið mældur. Met.no-fortíð verður ekki retroactive og það þarf að útskýra í útgáfurýni ef Stebbi býst við fullum 14 dögum strax.
