# TODO-090 v129 — Traustur ferðakafli og Google Maps síðasti spölur

## Findings fyrst

1. **Enginn sjálfvirkur release-blocker er eftir í afmörkuðum pakka.** Targeted
   próf, type-check, lint, full Vitest-svíta og clean-room production build eru
   græn.
2. **Raunleiðir þurfa enn handvirka localhost-rýni Stebba.** Sérstaklega þarf að
   staðfesta að Garðabær/Melás, sama þéttbýli og sveitaáfangastaður gefi
   mannamálslega rétt mörk á raunverulegum Google- og Teskeiðarleiðum.
3. **Traustslógíkin er viljandi fail-closed.** Opinber veggeometry þarf að fylgja
   valinni provider-leið innan 25 m á öllum punktum sem teknir eru með mest
   100 m millibili, án óeðlilegs bakslags. Þetta getur sent notanda oftar í
   Google Maps en frjálslegri lausn, en kemur í veg fyrir að samsíða einkavegur
   eða afleggjari sé ranglega kallaður staðfestur opinber ferðakafli.
4. **Vegakerfisgögn geta ekki alltaf staðfest samfelldan kafla.** Ef graph er
   ótiltækt, tekur lengri tíma en 5 sekúndur eða stenst ekki geometry-samanburð
   sýnir Teskeið ekkert tilbúið veðurmat og afhendir alla ferðina til Google
   Maps. Það er örugg og sannleiksmiðuð niðurstaða, ekki villa sem á að fela.
5. **Enginn browser-screenshot eða raun-GPS prófun var keyrð.** Mobile layout er
   varið með RTL/source prófum og buildi, en 360/390/460 px og raunverulegur
   GPS-puck þurfa handvirka staðfestingu fyrir útgáfu.
6. **Lint sýnir aðeins fyrirliggjandi repo-aðvaranir.** Engin ný lint-aðvörun
   varð til í þessum pakka.

## Plan áfangans

1. Halda nákvæmum upphafs- og áfangastað aðskildum frá mörkum veðurmats.
2. Finna route-aware þéttbýlismörk úr opinberum polygon-gögnum.
3. Staðfesta aðeins samfelldan kafla sem liggur á tengdu opinberu vegakerfi.
4. Meta veður aðeins á staðfesta kaflanum en halda vegalengd, aksturstíma og ETA
   miðað við alla ferðina.
5. Sýna keyless Google Maps handoff fyrir fyrsta, síðasta eða allan spölinn.
6. Einfalda live-kortið meðan staðsetning er elt og forðast stórt upphafslabel
   þegar GPS-puck er raunverulega kominn á kortið.
7. Keyra full prerelease-gates án þess að lesa `.env.local`, secrets eða
   ótengdan SQL/Supabase-pakka.

## Hvað var raunverulega gert

- Opinbera staðaskráin var endurmynduð úr núverandi opinberum Hagstofu-,
  Landmælinga- og Byggðastofnunargögnum. Snapshot v2 geymir nú canonical
  MultiPolygon-mörk fyrir 111 þéttbýlisstaði og áfram 174 póststaði.
- Runtime getur fundið einn ótvíræðan þéttbýlisstað sem inniheldur hnit. Holur,
  jaðarpunktar og skörun sem er ekki ótvíræð faila lokað.
- Nýr trusted-route resolver ber valda provider-leið saman við tengda leið úr
  opinbera vegagrafinu. Hann notar distance-spaced sampling, strangt 25 m
  hámarksfrávik, monotonic framvindu og samfellda graph-node keðju.
- `official_road_anchor` liggur nú á raunverulegri official-edge geometry, ekki
  bara á nærliggjandi provider-línu. Route fraction og ETA haldast samt miðað
  við nákvæma valda provider-leið.
- Sama-þéttbýlis niðurstaða er aðeins notuð þegar öll valda leiðin er innan sama
  polygons. Leið sem fer út og inn aftur heldur áfram í graph-staðfestingu.
- Veður- og stöðvagögn eru sótt aðeins fyrir `full` eða `partial` coverage.
  `same_urban_area` og `unavailable` hætta áður en met.no, Veðurstofa,
  Vegagerðin eða route-memory eru kölluð.
- Fyrir partial coverage eru sýnatökupunktar og stöðvamöppun klippt að staðfesta
  kaflanum. Full route audit-polyline, heildarvegalengd, heildaraksturstími og
  absolute ETA-offset haldast óbreytt.
- Nákvæmur áfangastaðarspápunktur er ekki sóttur þegar coverage endar fyrr.
- UI sýnir nákvæma ferðina áfram, en mörk eru merkt sérstaklega sem
  `Þéttbýlismörk` eða `Staðfestur vegpunktur`.
- Keyless Google Maps Directions URL notar nákvæm óstytt hnit og kallar hvorki
  Google API né SDK fyrr en notandi velur sjálfur ytri hlekkinn.
- Sama-þéttbýli og óstaðfest leið fá skýra heildarferðartengingu í Google Maps.
  Partial leið fær sjálfstæðan fyrsta og/eða síðasta spöl.
- Coverage-handoff birtist aðeins fyrir leiðina sem hefur verið beitt. Preview á
  annarri leið getur því ekki sýnt gömul mörk eða Google-tengla undir rangri
  valinni línu.
- Stóra samanburðarkortið sýnir nákvæm `frá → til` heiti fyrir beittu leiðina og
  handoffið fyrir neðan.
- Í live-location ham er græna Vegagerðin raster-lagið falið tímabundið og
  vector-lagið sýnir aðeins kafla sem eru ekki sérstaklega merktir `clear`.
  Fyrri layer-stillingar koma aftur þegar live ham lýkur.
- Nákvæmt origin-label er sýnilegt meðan leyfis/GPS-bið stendur. Það hverfur
  aðeins þegar raunverulegur puck er kominn; destination og coverage-labels
  haldast sýnileg.
- Eldri endpoint-merki eru hreinsuð um leið og ný leiðarútreikningur hefst.
- Vegagerðin exception diagnostics skrá nú aðeins fasta
  `layer_build_failed` flokkinn, aldrei raw error message, URL, query, hnit eða
  mögulegt secret.
- EN/IS textar og attribution-date próf voru uppfærð. Attribution-prófin lesa nú
  generated canonical dagsetningu í stað harðkóðaðs dags.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-28-1731-todo-090-v128-codex-start-driving-production.md`
- núverandi route API, road graph/runtime, provider geometry, weather
  assessment, stóra/smáa route-kortið, live-location lifecycle,
  official-place generator/runtime, þýðingar og tengd próf.

## Skrár sem voru breyttar

Production/runtime:

- `app/api/teskeid/weather/travel/route.ts`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RouteNavigationHandoff.tsx` (ný)
- `lib/iceland-routes/googleMapsDirectionsUrl.ts` (ný)
- `lib/iceland-routes/trustedRouteCoverage.ts` (ný)
- `lib/iceland-routes/trustedRouteCoverage.server.ts` (ný)
- `lib/road-intelligence/liveRouteMapPresentation.ts` (ný)
- `lib/places/officialPlaceDirectory.server.ts`
- `lib/places/officialPlaceDirectory.generated.json`
- `lib/places/officialPlaceAttribution.generated.ts`
- `lib/weather/assessment.ts`
- `lib/weather/travel.ts`
- `lib/weather/types.ts`
- `messages/is.json`
- `messages/en.json`
- `scripts/generate-official-place-directory.mjs`

Próf:

- `lib/__tests__/google-maps-directions-url.test.ts` (ný)
- `lib/__tests__/live-route-map-presentation.test.ts` (ný)
- `lib/__tests__/official-place-directory.test.ts`
- `lib/__tests__/place-map-picker-ui.test.tsx`
- `lib/__tests__/place-search-ui.test.tsx`
- `lib/__tests__/road-map-vegagerdin-live-ui.test.ts`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `lib/__tests__/route-navigation-handoff.test.tsx` (ný)
- `lib/__tests__/trusted-route-coverage.test.ts` (ný)
- `lib/__tests__/trusted-route-coverage-server.test.ts` (ný)
- `lib/__tests__/weather-assessment.test.ts`
- `lib/__tests__/weather-travel-api.test.ts`

Handoff:

- `ai-handoff/2026-07-28-1931-todo-090-v129-codex-trusted-route-last-mile-prerelease.md`

## Scope-audit og varðveittar breytingar

Eftirfarandi fyrirliggjandi breytingar voru ekki snertar af þessum pakka og
skulu útilokaðar úr mögulegu seinna commit-i:

- `.obsidian/workspace.json`
- `sql/95_teskeid_agent_collaboration.sql`
- `lib/__tests__/sql-migration.test.ts`
- `lib/__tests__/sql95-security-regression.test.ts`
- `scripts/validate-agent-collaboration-disposable.mjs`
- `scripts/__tests__/`
- `sql/validation/`
- eldri ótrackuð handoff-skjöl.

Official-place schema-v2 snapshot/generator/runtime og place-attribution prófin
eru hins vegar raunveruleg dependency þessa pakka vegna route-aware
þéttbýlismarkanna.

## Skipanir og niðurstöður

1. `node scripts/generate-official-place-directory.mjs`
   - exit `0`;
   - 111 þéttbýlisstaðir og 174 póststaðir;
   - aðeins opinber source voru sótt;
   - engin Google-, Supabase-, `.env.local`- eða secret-lesning.
2. Fyrri targeted lota á 9 skrám
   - exit `0`;
   - 9/9 skrár og 156/156 próf græn.
3. Trust-hardening lota
   - exit `0`;
   - 2/2 skrár og 13/13 próf græn.
4. Fyrsta full suite
   - exit `1`;
   - tvö próf voru með retrieval-date `2026-07-27` harðkóðað eftir löglega
     endurmyndun gagnanna;
   - prófin voru tengd canonical generated attribution date og urðu græn.
5. Privacy regression targeted lota, fyrsta tilraun
   - exit `1` eingöngu vegna test-harness: diagnostic notar `console.info` en
     prófið hafði aðeins gripið `console.log/error`;
   - harness var lagaður; production-kóðinn lak ekki raw villutextanum.
6. Final targeted lota fyrir API/UI/live presentation
   - exit `0`;
   - 4/4 skrár og 76/76 próf græn.
7. `npm.cmd run type-check`
   - exit `0`.
8. `npm.cmd run lint`
   - exit `0`;
   - aðeins fyrirliggjandi hook/image viðvaranir.
9. Final `npm.cmd run test:run`
   - exit `0`;
   - 204 skrár passed, 1 skipped;
   - 4.320 próf passed, 28 skipped og 8 todo.
10. Fyrsta clean-room production build
    - exit `1` eingöngu vegna sandbox `EACCES` við opinbera Inter-font fetch;
    - `cleanRoomEnvFileCount=0` og TEMP-afrit hreinsað.
11. Sama clean-room build með einu afmörkuðu font-netleyfi
    - exit `0`;
    - compilation, lint/type validation, page data, 118/118 static pages og
      traces græn;
    - `cleanRoomEnvFileCount=0` og `cleanRoomExists=False` eftir cleanup.
12. `git diff --check`
    - exit `0`; aðeins Windows line-ending notices.

## Það sem var ekki gert

- Engin commit.
- Ekkert push.
- Ekkert deploy eða production smoke-próf.
- Engin SQL/migration var skrifuð eða keyrð.
- Engin Supabase-tenging, -lesning eða -skrif.
- Engin `.env.local`, secret eða Vercel environment variable var lesin eða
  breytt.
- Dev server og port 3004 voru ekki snert.
- Engin aukaleg Google provider request var gerð. Google Maps hlekkir voru
  aðeins unit-prófaðir sem URL.

## Ákvarðanir

- Nákvæmur user-selected staður er alltaf ferðapunktur. Coverage boundary má
  aldrei skrifa yfir hann.
- Þéttbýlisgateway kemur úr því hvar valda leiðin sker official polygon, ekki
  centroid, sveitarfélagsmiðju eða loftlínu.
- Sveita-anchor kemur úr samfelldri official graph-leið og liggur á official
  edge geometry. Proximity eitt og sér dugar ekki.
- ETA á coverage-punktum er vegalengdarhlutfall af heildaraksturstíma því
  núverandi provider contract gefur aðeins route-level duration. Þetta er
  skráð í type/code og prófað.
- Ef ekki er hægt að sannreyna kafla er betra að sýna ekkert Teskeiðarveðurmat
  en að búa til falskt öryggi.
- Google handoff er venjulegur keyless URL og hefur því engan nýjan provider
  kostnað eða server-side gagnastraum.
- Live vector-lag sem vantar eða bilar leiðir viljandi til þess að engin
  vegskilyrðalína sé sýnd í stað þess að endurvekja yfirþyrmandi og hugsanlega
  villandi grænt raster.

## Privacy og öryggismat

- Nákvæm hnit fara aðeins í núverandi route request og í Google Maps URL sem
  notandinn opnar sjálfur. Nýi coverage-resolverinn skráir þau hvorki né vistar.
- Google tenglar nota `noopener noreferrer` og `referrerPolicy=no-referrer`.
- Raw provider exceptions fara ekki í diagnostics.
- Live GPS-hnit, heading, hraði og saga eru áfram aðeins í minni tækisins og
  fara ekki í fetch, Supabase, analytics, logs, handoff eða storage.
- Official-place snapshot er opinbert og server-only. Stærð generated JSON er
  um 768 KB og fór ekki í client bundle samkvæmt production buildi.
- Engin breyting var gerð á auth, RLS, grants, billing eða production gögnum.

## Áhætta sem stendur eftir

- Official og provider geometry geta sums staðar vikið meira en 25 m þótt um
  sama veg sé að ræða. Þá failar kerfið lokað og afhendir Google Maps meiri
  hluta ferðarinnar. Handvirk dæmaprófun ræður hvort vikmarkið þarf seinna að
  þróast með sterkari road-identity evidence í stað þess að hækka það blindandi.
- Google Maps getur reiknað annan síðasta spöl þegar ytri hlekkurinn opnast.
  Teskeið lofar því aðeins hvaðan handoff hefst, ekki nákvæmri Google-leið.
- Engin raunbrowser visual-regression mynd var tekin í þessum áfanga.
- Fyrirliggjandi lint-viðvaranir eru áfram í repo-inu og voru ekki innan scope.

## Localhost checks for Stebbi

Stebbi keyrir dev server sjálfur. Opnaðu `http://localhost:3004/vedrid` og prófaðu
kyrrstæður; ekki prófa ytri Google Maps tengla eða UI meðan þú ert að aka.

1. **Innan sama þéttbýlis**
   - Veldu tvö raunveruleg heimilisföng innan sama þéttbýlis, til dæmis tvö
     Garðabæjarföng.
   - Reiknaðu leið.
   - Vænt: engin tilbúin millibæjar-veðurspá; textinn segir að öll valda leiðin
     sé innan sama þéttbýlis og einn `Opna ferðina í Google Maps` takki birtist.
   - Nákvæm `frá → til` heiti eiga áfram að sjást.
2. **Þéttbýli í lok ferðar**
   - Reiknaðu Hella eða annan landsbyggðarstað → `Melás 8, Garðabær`.
   - Vænt: nákvæmur Melás 8 áfangastaður helst sýnilegur, en veðurmat lýkur við
     route-aware `Þéttbýlismörk: Garðabær` ef opinbera leiðin stenst.
   - `Opna síðasta spölinn ... í Google Maps` á að opna frá boundary-hnitum að
     nákvæmum Melás 8 hnitum.
3. **Þéttbýli í byrjun ferðar**
   - Reiknaðu `Melás 8, Garðabær` → Hella eða annan landsbyggðarstað.
   - Vænt: veðurmat hefst við útgöngupunkt valinnar leiðar úr Garðabæ og fyrsti
     Google Maps spölurinn er frá nákvæmum upphafsstað að þeim mörkum.
4. **Sveitaáfangastaður eða afleggjari**
   - Veldu raunverulegan sveitastað eins og Víðibakka ef HMS-leitin býður hann.
   - Vænt: Teskeið stoppar við `Staðfestur vegpunktur: ...` á tengdu opinberu
     vegakerfi og afhendir síðasta spölinn. Ef ekki tekst að staðfesta kaflann
     á að birtast heildarhandoff í Google Maps, aldrei tilbúið veðurmat.
5. **Leiðar-preview**
   - Opnaðu stóra leiðakortið og veldu aðra leiðarlínu/spjald án þess að ýta á
     sticky staðfestingarhnappinn.
   - Vænt: boundary/Google handoff gömlu beittu leiðarinnar hverfur þar til nýja
     leiðin er staðfest. Það má aldrei hanga undir preview á annarri leið.
6. **Merki á korti**
   - Vænt: nákvæmur upphafs- og áfangastaður eru aðskildir frá amber coverage
     start/end merkjum. Engin gömul merki mega sjást meðan ný leið er reiknuð.
7. **Live location, innskráður notandi**
   - Farðu í `Á ferðinni núna`, veldu að sýna staðsetningu og bíddu fyrst í
     permission/GPS state.
   - Vænt: origin-label helst þar til blái puckurinn birtist; þá má puckurinn
     koma í stað origin-labelsins. Destination og coverage-merki haldast.
   - Vænt: grænt `clear` vegakerfis-clutter hverfur aðeins meðan live tracking
     er virkt og fyrri lagastillingar koma aftur við opt-out/mode exit.
8. **Mobile og tungumál**
   - Skoðaðu 360, 390 og 460 px breidd, bæði með fullum og löngum staðanöfnum.
   - Vænt: ekkert lárétt overflow, Google Maps takkar eru a.m.k. 44 px háir,
     sticky aðgerð hylur ekki content og details-svæðið scrollar.
   - Ef þú skiptir í ensku, staðfestu `Urban boundary`, `Confirmed road point`
     og first/last/whole Google Maps textana.

Þessi localhost-prófun krefst hvorki SQL né Supabase-aðgerðar. Venjuleg
leiðarútreikningur getur þó skráð núverandi privacy-safe usage event eins og
fyrir breytinguna. Ekki breyta environment variables vegna þessarar rýni.

## Næsta skref

Stebbi framkvæmir localhost-checklistann hér að ofan og sendir Codex niðurstöðu
fyrir þrjú lykildæmi: sama þéttbýli, Melás/Garðabær og einn sveitaáfangastað.
Ef þau líta rétt út þarf nýtt, afmarkað framkvæmdarleyfi áður en Codex má
commit-a, push-a eða deploya pakkann.

## Spurningar til næstu rýni

1. Er 25 m fail-closed vikmarkið of íhaldssamt á raunleiðum án þess að það valdi
   falskri staðfestingu?
2. Eru route-aware þéttbýlismörkin mannamálslega skýrari en nákvæmur
   heimilisfangsáfangastaður áfram sýnilegur?
3. Opnar Google Maps fyrsta/síðasta spölinn frá réttum hnitum á iOS og Android?
4. Er live-kortið læsilegra þegar `clear` vegalínur hverfa, án þess að notandi
   túlki vöntun vector-gagna sem gott ástand?

## Supabase / SQL

- Engin SQL-skrá tengist þessum pakka.
- Engin migration var skrifuð eða keyrð.
- Engin Supabase-tenging eða production-gagnaskrif voru gerð.
- Engin áhrif eru á RLS, grants, auth, policies eða functions.
