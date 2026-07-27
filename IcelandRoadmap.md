# IcelandRoadmap.md - Teskeiðar Íslandsleiðagrunnur

Þessi skrá er lendingarstaður fyrir hugmyndina um eigin route- og
vegkaflagrunn Teskeiðarinnar fyrir Ísland.

Fyrsti consumer er Veðrið á Teskeið, en markmiðið er að grunnurinn verði
endurnýtanlegur domain-kjarni frekar en safn af sérlausnum í einstökum
components eða Google Routes wrappers.

## Af hverju

Teskeið er ekki að reyna að verða fullkomið turn-by-turn navigation kerfi fyrir
heiminn. Teskeið þarf að skilja Ísland nógu vel til að hjálpa fólki með langar
landsleiðir, veður, vegkafla, stöðvar, aðstæður, púlsgögn og öruggari
ákvarðanir áður en lagt er af stað.

Núverandi Google Routes integration er nytsamlegt, en við höfum ítrekað þurft
að bæta eigin þekkingu ofan á það:

- curated leiðir eins og `Gegnum Hólmavík` og `Til að sleppa við Öxi`
- vegkaflaviðvaranir fyrir erfiða eða óhentuga kafla
- control points til að grípa beygjur, firði og fjallvegi betur
- provider station matching fyrir Veðurstofu og Vegagerð
- route-cache og áhugahitakort yfir hvaða vegkafla fólk er að skoða
- yfirlitskort áður en notandi velur nákvæma ferð

Þessi þekking á að safnast á einn stað.

## Markmið

- Eiga canonical hugmynd um helstu vegkafla og route families á Íslandi.
- Gera provider-station matching minna háð tilviljanakenndum Google polyline
  punktum.
- Bjóða mannamálslegar leiðir og viðvaranir sem passa íslenskan veruleika.
- Styðja Veðurstofu, Vegagerð og síðar Yr-samanburð á sömu route/station
  hugmyndafræði.
- Minnka óþarfa Google-kostnað með cache og endurnýtingu þar sem það er
  leyfilegt.
- Safna route-interest sem aggregate segment-level innsýn, ekki persónulegum
  leiðum.
- Stefna að eigin Road Intelligence kortalagi þar sem road graph og segment
  state eru kjarninn, ekki Google Maps sem truth layer.

## Ekki markmið í fyrstu

- Ekki skipta Google Routes út í production strax.
- Ekki byggja nákvæma götunavigation niður í húsnúmer.
- Ekki geyma persónulegar ferðir eða heimilisföng án sér privacy-rýni.
- Ekki gefa opinbera færðar- eða öryggisyfirlýsingu sem gögnin styðja ekki.
- Ekki byggja canonical Teskeiðarvegakerfi með því að vista hráar Google Routes
  niðurstöður sem okkar eigin gögn. Google má vera provider/fallback, en
  Teskeiðarþekkingin á að vera okkar eigin provider-neutral afleiða.
- Ekki skipta Google kortinu eða Google Routes út í production fyrr en eigið
  kortalag, open-data leyfi, performance og UX hafa verið rýnd sérstaklega.

## Eigið Road Intelligence Kortalag Og Live Road OS

Sérstakt stefnuskjal er í `RoadIntelligenceMap.md`.

Kjarninn úr þeirri stefnu:

- Teskeið á ekki að byggja "annað Google Maps", heldur eigið íslenskt
  Road Intelligence lag.
- Google Maps og Google Routes mega vera provider/fallback á meðan, en
  Teskeiðar-road-graph á að verða langtíma truth layer.
- Opið grunnkort, Vegagerðin, Landmælingar Íslands og OSM þarf að rannsaka með
  leyfi, attribution, cache og performance í huga.
- Hver vegkafli á að verða `road_segment` með stöðu: spá, raungildi, hviður,
  færð, lokanir, vindnæmi, púlsgögn, sérfræðireglur og confidence.
- Fyrsta eigin-korts vinna á að fara bak við `road-intelligence-v1` feature flagg
  og vera prototype, ekki replacement á `/vedrid`.
- Langtímasýnin er Live Road OS: Teskeið hjálpar notanda að ákveða hvort hann
  eigi að fara núna, bíða, velja aðra leið eða stoppa áður en aðstæður versna.

Næstu practical skref eru því:

1. Open-data discovery og leyfisrýni fyrir Vegagerðina, Landmælingar og OSM.
2. Feature-flaggað map prototype með MapLibre/Leaflet/OpenLayers samanburði.
3. Segment-state prototype fyrir 10-20 þekkta vegkafla.
4. Route projection sem segir hvaða kafli verður erfiðastur þegar notandi kemur
   þangað.
5. Eigið routing experiment þegar road graph er orðinn nógu góður.

## Google Routes Sem Provider, Ekki Canonical Grunnur

Google Routes má hjálpa okkur að reikna leið þegar notandi þarf nákvæma
niðurstöðu, en það má ekki verða óvart að gagnalindinni sem við "eigum".

Leiðarlínur, route steps, duration, distance og önnur Google Routes content eru
háð Google skilmálum og caching-reglum. Því á Teskeið ekki að vista raw Google
route result sem varanlegan route-cache nema sérstök terms-rýni og samþykki liggi
fyrir. Place IDs eru sértilvik sem Google leyfir að geyma, en þau eru ekki
sjálfstætt vegakerfi.

Það sem við megum og eigum að byggja upp er provider-neutral Teskeiðarþekking:

- hvaða canonical vegkaflar leið snertir
- hvaða route-family eða leiðartegund á við
- hvaða varasömu kaflar eða cautions eiga við
- hvaða Veðurstofu- og Vegagerðarstöðvar tengjast leiðinni
- hvaða control points þarf að bæta við til að skilja Ísland betur
- aggregate route-interest á segment-level, ekki persónuleg raw route history

Þegar Google Routes er kallað í Veðrinu ætti það smám saman að keyra
`Route Intelligence Intake`: lítið, öruggt skref sem les provider-niðurstöðuna,
mátar hana við `lib/iceland-routes/` og bætir aðeins við eða notar eigin
Teskeiðarþekkingu. Ef eitthvað er vistað þarf það að vera afleitt,
provider-neutral og privacy-safe.

## Curated Leiðir Og Varasamir Vegkaflar

Curated leiðir og varasamir vegkaflar eiga bæði heima í IcelandRoadmap kerfinu,
en sem ólík hugtök:

- `IcelandRouteSegment`: canonical vegkafli, t.d. Öxi, Holtavörðuheiði,
  Dynjandisheiði, Hellisheiði eða ákveðinn kafli á Hringvegi.
- `IcelandRouteCaution`: viðvörun sem getur hangið á segmenti, t.d. varasamt með
  eftirvagna, vindnæmt, fjallvegur, vetraróvissa eða krefst sérstakrar athygli.
- `IcelandRouteFamily`: mannamálsleg leiðafjölskylda, t.d. Reykjavík til
  Akureyri, Reykjavík til Ísafjarðar eða Höfn til Egilsstaða.
- `IcelandRouteAlternative`: valkostur sem við getum boðið þegar ákveðin segment
  eða caution koma upp, t.d. `Gegnum Hólmavík`, `Til að sleppa við Öxi` eða
  `Um firðina`.

Reglan á að vera segment-driven: ef leið snertir varasaman kafla skiptir
uppruni og áfangastaður ekki öllu máli. Viðvörunin og möguleg alternative leið
eiga að koma frá því að route geometry eða route-family snertir canonical
segmentið.

## Route Intelligence Check

Allt route-tengt handoff/review/plan á að svara þessu stuttlega:

1. Hvaða leið, vegkafli, landshluti eða route-family er snert?
2. Á ný þekking heima í `IcelandRoadmap.md` eða `lib/iceland-routes/`?
3. Er lausnin provider-neutral þar sem það er eðlilegt?
4. Þarf canonical segment, control point, caution, station matching reglu,
   cache lykil eða test fixture?
5. Er privacy örugg, sérstaklega ef leiðir eða áhugi notenda er talinn?
6. Ef Google Routes eða Places eru notuð: er ljóst hvað má geyma, hvað má ekki
   geyma, og hvort við séum aðeins að geyma afleidda Teskeiðarþekkingu?
7. Ef roadmap/kjarninn er ekki uppfærður, af hverju ekki?

## Fyrstu fasar

### R0 - Foundation

Staða: byrjað.

- `IcelandRoadmap.md` heldur utan um stefnu, fasaskiptingu og opnar spurningar.
- `lib/iceland-routes/` er stofnað sem kóðalendingarstaður fyrir typed route
  domain.
- Engin production-hegðun breytist í þessum fasa.

### R1 - Critical Segment Registry

Skilgreina fyrstu hand-curated vegkaflana og route families:

- Hólmavík / suðurleið um Vestfirði
- Öxi / Axarvegur 939 og leið um firðina
- Vík / Reynisfjall / Mýrdalssandur / Vatnsskarðshólar
- Hellisheiði / Þrengsli / suðurstrandarleiðir
- Hringvegurinn sem backbone

Útkoma: typed registry með nöfnum, aliases, route numbers, control geometry,
safety flags og test fixtures.

**Byrjað (v248 — static Road Intelligence registry):**

Fyrsti provider-neutral kjarni fyrir curated alternatives og cautions er kominn
án production UI, routing-engine eða persistence:

- `lib/iceland-routes/alternatives.ts` — draft alternatives eins og
  `Gegnum Hólmavík`, `Um Hellisheiði`, `Til að sleppa við Öxi`, `Um firðina`
  og `Hringvegurinn`
- `lib/iceland-routes/cautions.ts` — segment-tengdar cautions fyrir
  Hellisheiði, Öxi, Hólmavík-suðurleið og Þrengsli
- `lib/iceland-routes/roadIntelligenceResolver.ts` — pure resolver sem mátar
  route-memory keys eða staðanöfn við `ROUTE_FAMILIES`
- Engin Google köll, engin Supabase skrif og engin production-hegðunarbreyting

### R2 - Google Polyline Adapter

Google Routes má áfram skila leiðum, en niðurstaðan er mappuð yfir í
Teskeiðar-segments:

- greina hvaða canonical segments leið snertir
- tengja route cautions við segments frekar en dreifðar sérreglur
- nota control points til að bæta provider-station matching
- halda Google sem fallback/validation source
- keyra Route Intelligence Intake án þess að vista raw Google route content sem
  canonical Teskeiðargögn

### R3 - Provider Station Matching

Veðurstofu- og Vegagerðarpunktar eiga að tengjast leiðum með sama
vegkaflagrunni:

- stöðvar tengjast nearest segment eða station corridor
- route order byggir á segment order, ekki bara hráum hnitum
- sama líkan á að geta nýst fyrir yfirlitskort og ferðalag

### R4 - Route Cache Og Interest Heatmap

Safna aggregate innsýn um hvaða vegkafla fólk er að skoða:

- segment-level teljarar frekar en nákvæmar from/to fyrirspurnir
- vinsælar route families út frá samsetningu vegkafla
- cache fyrir algengar leiðir og provider matching niðurstöður
- engin persónugreinanleg heimilisföng eða route history án sér samþykkis
- cache má byrja á okkar eigin afleiddu segment/provider matching niðurstöðum;
  ekki raw Google route content nema skilmálar og privacy hafi verið rýnd.

### R5 - Overview Map Og Domain Product

Nota leiðagrunninn fyrir fyrsta skjáinn í Veðrinu:

- landsyfirlit áður en notandi velur ferð
- filterar fyrir Veðurstofu, Vegagerð, Yr og síðar önnur lög
- scrubber fyrir spátíma
- ferðaleiðir, aðstæður og púlsgögn í sama route-intelligence samhengi

**Byrjað (v521 — curated corridor route lens, transitional):**

Létt `Frá`/`Til` leiðarsía er komin á `/vedrid` sem filterar yfirlitskortið
niður á stöðvar sem eru á valdri leið, án þess að kalla í Google Routes:

- `lib/iceland-routes/lensTypes.ts` — `OverviewRouteLensQuery`, `OverviewRouteLensResult`,
  `OverviewRouteLensRouteFamily`
- `lib/iceland-routes/routeFamilies.ts` — 4 leið-fjölskyldur (suðurströnd, austurland,
  norðurland, vestfirðir) með corridor-waypoints og place-name aliases
- `lib/iceland-routes/lensResolver.ts` — `resolveOverviewRouteLensCacheOnly()` —
  pure function, notar aldrei Google
- `lib/iceland-routes/lensFilter.ts` — `filterStationIdsForRouteLens()` —
  haversine-based stöðvasía
- `components/weather/OverviewRouteLensPanel.tsx` — UI með Frá/Til inputs,
  "Bráðabirgðaniðurstöður" badge, Ferðalagið CTA
- Sía gildir jafnt fyrir Veðurstofan og Vegagerðin
- `cache_miss` gefur hlutlægar skilaboð og Ferðalagið CTA án Google-kostnaðar
- 26 nýr próf í `lib/__tests__/iceland-routes-lens.test.ts`

Corridor lens er transitional lausn. Ný `/vedrid` stöðvasía kemur úr
route-memory (sjá neðar).

**Byrjað (v539+ — route-memory station sets):**

`/ferdalagid` vistar nákvæm provider station IDs í Supabase eftir hvern
trip-útreikning. `/vedrid` les þetta og filterar kortið án kilometer-nálgunar:

- `lib/iceland-routes/routePlaceNormalization.ts` — city-level place normalization
  (t.d. "Melás 8, Garðabær" → `gardabaer`); geymir aldrei raw heimilisföng
- `lib/iceland-routes/routeMemory.server.ts` — server-only write/lookup helpers;
  atomic upsert, `providersEvaluated` contract
- `sql/86_weather_route_memory.sql` — tvær töflur: `weather_route_memory_routes`
  og `weather_route_memory_stations`; service-role only, RLS, enginn user_id
- `app/api/teskeid/weather/route-memory/lookup/route.ts` — lookup API með
  provider access gating fyrir bæði Veðurstofu og Vegagerð
- Route variant key: `selectedRouteId` þegar til, `'default'` annars
- Vegagerðin station rows hreinsast þegar cache er tiltækt en 0 stöðvar passa;
  rows eru í friði þegar cache er unavailable

Privacy contract:
- Engin user_id
- Engin raw heimilisföng eða Google geometry
- Aðeins normalized public place keys/labels og provider station IDs geymdar

### R6 - Eigið Routing Prototype

Prófa einfalt graph fyrir langar Íslandsleiðir:

- node/segment graph fyrir helstu vegi
- route families með mannamálslegum nöfnum
- Google Routes sem comparison/fallback
- ekki production default fyrr en sannreynt með mörgum leiðum og browserprófum
- curated alternatives og cautions byggja á sama segment/caution grunni og
  Google adapterinn, svo eigið routing og Google-backed routing gefi sömu
  mannamálslegu viðvaranir.

**Byrjað (provider contract og shadow foundation):**

- `lib/iceland-routes/routingProvider.ts` skilgreinir provider-neutral request,
  result og provider contract fyrir Google- og Teskeiðar-adaptera.
- `lib/iceland-routes/routingShadow.server.ts` er server-only, fail-closed
  shadow runner bak við `TESKEID_ROUTING_SHADOW_ENABLED`.
- Shadow scheduler notar Next.js `after()` og er tengdur final travel API bak
  við fail-closed `TESKEID_ROUTING_SHADOW_ENABLED`. Hann skrifar engin gögn og
  skilar aldrei shadow-niðurstöðu til client.
- Corridor-provider er aðeins integration fixture og verður ekki þróaður í
  handsmíðað leiðakerfi.

**Byrjað (v0.6 — sjálfvirkt all-Iceland road graph spike):**

- Opinbera `data/vegakerfi/MapServer/6` Vegir-lagið er topology source.
- Opinbera `data/slitlag/MapServer/0` lagið tengist með `IDKAFLI` sem
  surface-attribute; mixed kaflar eru ekki taldir fully paved.
- `roadGraph.ts` byggir directed graph og reiknar shortest/fastest/paved-only
  leiðir með priority queue og multi-component endpoint matching.
- `IcelandRoadGraphRoutingProvider` skilar sama provider-neutral contracti og
  shadow foundation.
- Read-only live audit 2026-07-25 byggði 1.226 segment / 1.363 node graph við
  20 m topology tolerance og fann sjálfvirkt Reykjavík → Akureyri:
  390,2 km, áætlaðar 4 klst. 35 mín., 57 kaflar, allt flokkað paved.
- Endpoint snapping var 767 m við Reykjavík og 1.091 m við Akureyri. Graphið er
  því sannreynt sem landsleiðaspike en þarf edge map-matching/local-road coverage
  áður en það má verða notendasýnilegt.
- Allur hraði í þessari niðurstöðu er enn afleiddur. Tíminn er engineering
  estimate, ekki production ETA, þar til official speed layer og regression
  calibration hafa verið tengd.
- Ekkert graph er vistað og Google er óbreytt primary provider.

**Framhald (v0.6.1 — nákvæmt slitlag með opinberum stöðvabilum):**

- Slitlagsfærslur eru áfram tengdar canonical vegakerfi með `IDKAFLI`, en
  `UPPH_STOD`/`ENDA_STOD` eru nú notuð til að skipta veglínunni nákvæmlega þar
  sem `GERD_SL` skiptir milli bundins slitlags og malar.
- Aðliggjandi bil með sömu slitlagsgerð eru sameinuð svo graph-stærð vaxi aðeins
  við raunveruleg slitlagsskil.
- Linear-reference skipting er fail-closed: eyður, skörun, röng lengd, óþekkt
  domain-gildi eða geometry-vandamál halda kaflanum `mixed/unknown`.
- Snapshot-validation leyfir ekki promotion ef unresolved `mixed/unknown`
  surface-edges standa eftir. Virkt last-known-good snapshot heldur þá gildi.

**Framhald (v0.7 — almenn localhost leiðastofa):**

- 20 para gullfylki nær yfir helstu landsleiðir og lifandi read-only úttekt
  finnur nú öll pörin innan skilgreindra fjarlægðarbila.
- `/preview/teskeid-routes` tekur við hvaða íslensku upphafs- og endastöðum sem
  núverandi staðaleit leysir í hnit; gullfylkið takmarkar því ekki leitina.
- Bounded alternative-leit finnur fleiri raunverulega ólíkar leiðir án
  handskrifaðra route-family reglna. Reykjavík → Ísafjörður skilar nú þremur
  öðrum candidates auk aðalleiðar og sýnir slitlagsblöndu hverrar leiðar.
- Núverandi vindur og hviður úr cache Vegagerðarinnar eru tengd við nálægar
  stöðvar á hverri candidate-leið. Þetta eru mælingar, ekki spá eða safety claim.
- Browser-GPS prófun færir bíl á route-sketch og sýnir vegalengd að næsta
  geometry-skrefi. Götunöfn, fullgildar beygjuleiðbeiningar, turn restrictions,
  off-route rerouting og lokanir eru enn blockers fyrir production navigation.

**Framhald (v0.8 — flaggaður candidate samhliða Google):**

- `TESKEID_ROUTE_CANDIDATE_ENABLED=true` opnar Teskeiðarleiðir fyrir alla sem
  hafa aðgang að Veðrinu, líka óinnskráða þegar public Veður er virkt. Flaggið
  er áfram global neyðarrofi. Óinnskráður notandi þarf stuttlíft undirritað
  Google-leiðarleyfi úr rate-limit-aða leiðavalsendpointinu áður en
  Teskeiðarleið er reiknuð. Endurtekningar og fleiri valkostir nota sér HMAC-IP
  þak án þess að geyma hrátt IP, warm-only er lokað og final submit samþykkir
  aðeins undirritaða Teskeiðarleið en ekki bert route-id. Google er áfram fyrst.
- Sameiginlegur server-helper reiknar leiðina bæði fyrir leiðaval og þegar valin
  leið er notuð í ferðaveðri. Þannig getur preview ekki sýnt leið sem final submit
  reynir síðan ranglega að finna hjá Google.
- Átta sekúndna response-budget ver Google-leiðina fyrir bið. Ef materialization
  úr virku snapshoti er enn í gangi verður Teskeiðarleiðin `pending`, vinnan fær
  að klárast með `after()` og clientinn reynir aftur án terminal timeout-villu.
- User request path sækir aldrei live Vegagerðargögn. Hann les aðeins virkt,
  fullsannreynt last-known-good snapshot og heldur materialized graph í
  process-minni sem hraðasta L1-lagi.
- Protected admin/cron refresh notar gagnagrunns-lease, 20 gullleiðir,
  magn-/samfelldnipróf, canonical SHA-256 og private immutable gzip-object.
  Atomic promote lætur gamla active snapshotið halda gildi nema nýja útgáfan
  standist allt; active og tvær fyrri útgáfur eru varðveittar til rollback.
- Read-only live bootstrap audit 2026-07-26 mældi stærsta weak component sem
  854 af 1.363 hnútum (62,66%) við canonical 20 m tolerance. Hinir 509
  hnútarnir dreifðust á 198 lítil component, að meðaltali 2,57 hnútar, á meðan
  allar 20 gullleiðir stóðust. Snapshot-vörnin notar því 60% absolute
  bootstrap-floor og krefst síðan að nýtt snapshot haldi að minnsta kosti 90%
  af connectivity-share síðasta active snapshots. Þetta varðveitir fail-closed
  drift-vörn án þess að hækka tolerance og falsa vegtengingar.
- Graph/source-villa, no-route eða flag-off hafa aðeins áhrif á
  Teskeiðarleiðina. Google-response helst óbreytt.
- UI merkir leiðina skýrt sem tilraun, segir að tíminn sé áætlaður og sýnir
  malarmerkingu þegar source facts innihalda skráð malarslitlag.
- Kerfið er production-virkt fyrir alla gjaldgenga Veðursnotendur, þar með talið
  óinnskráða í public ham, en er áfram merkt í vinnslu og er ekki
  öryggisleiðsögn. Lokanir, færð, official speed limits,
  turn restrictions og off-route rerouting eru enn blockers fyrir slíka notkun.

**Framhald (v0.9 — leiðasamanburður og hraður preview/apply):**

- Hver leið fær stöðugan, aðgreindan lit óháð provider og sama lit í korti,
  legendu og leiðaspjaldi.
- Litla samanburðarkortið má stækka í full-screen kort þar sem kortalínur og
  leiðaspjöld velja aðeins preview. Veður, stöðvar og scrubber eru ekki
  endurreiknuð fyrr en notandi velur sérstaklega að skoða veðurskilyrðin.
- MapLibre-lög uppfæra lit, breidd og opacity í stað þess að endurbyggja kortið
  við hvert preview-val.
- Þetta er áfram flaggað prófunarkerfi, en graph-líftíminn byggir nú á versioned
  last-known-good snapshoti fremur en serverless process-cache eða live fetchi.

**Framhald (v0.9.1 — gagnavissa í leiðavali):**

- Sjálfgefin röðun greinir nú ekki aðeins hvort slitlag sé óstaðfest heldur
  ber saman fjölda óstaðfestra kílómetra áður en malarlengd ræður röðinni.
- Google-leiðir fara aftast í sjálfgefnu röðuninni þar sem spjöld þeirra hafa
  ekki sambærilega Teskeiðar-greiningu eða confidence-merki. Sérstök röðun eftir
  aksturstíma, vegalengd eða veðri heldur áfram að fylgja völdum mælikvarða.
- Virkar Vegagerðin-stöðvar með nothæfum vindgögnum eru varpaðar á hverja
  candidate-línu. Ef engin slík stöð finnst eða einhver punktur leiðarinnar er
  meira en 50 km eftir leiðinni frá næstu stöð fær leiðin merkið `Takmörkuð
  veðurvissa`.
- Merkið er confidence-fullyrðing, ekki fullyrðing um slæmt veður eða
  eftirvagnahættu. Skýringin segir af hverju gögnin eru óvissari.
- Leið með takmarkaða veðurvissu fær ekki `Besta veðrið` merki og fer aftar í
  sjálfgefnu og veðurröðun. Leið án stöðvagagna útilokar ekki veðurröðun ef
  aðrar leiðir hafa nothæf gögn.
- Skýringar á route-caution og veðurvissu opnast í fullbreiðri focus-skúffu með
  eigin scrolli, backdrop, Escape/lokun og focus-restore á triggerinn.

**Framhald (v0.9.2 — mæld vindátt meðfram leið):**

- Núverandi vindátt frá Vegagerðinni er birt sem endurteknar, hlutlausar örvar
  sitt hvoru megin við valda leið í `Vegagerðin`/`Núna` ham. Hliðarbil er
  skjástöðugt og hornrétt á veginn svo báðar raðir haldist læsilegar líka í
  yfirlitszoom-i.
- Vindátt Vegagerðarinnar er meteorological „hvaðan“ átt. Sameiginlegur
  route-domain helper umbreytir henni í áttina sem vindurinn blæs og MapLibre
  heldur þeirri landfræðilegu stefnu réttri þegar kortinu er snúið.
- Örvar eru aðeins settar nálægt nothæfum mælistöðvum, aldrei blandaðar milli
  stöðva og langar mælingalausar eyður eru skildar eftir auðar. Mæling eldri en
  30 mínútur eða history-fallback býr ekki til örvar.
- Reiturinn er deterministic og capped fyrir mobile, fylgir sama status-filter
  og stöðvarnar, hverfur í forecast/overview og er uppfærður úr núverandi
  60 sekúndna cache-refresh án þess að endurbyggja kortið.
- Þetta er sjónræn framsetning á punktmælingum, ekki samfelld vindspá eða ný
  öryggisfullyrðing. Engin ný leiðar- eða staðsetningargögn eru vistuð.

### R7 - Eigið Kortalag Prototype

Staða: ekki byrjað.

Markmið er að prófa eigið kortalag án þess að breyta production `/vedrid`:

- velja einn prototype route bak við `road-intelligence-v1`
- bera saman MapLibre GL JS, Leaflet og OpenLayers fyrir mobile-first Teskeið UX
- prófa opið grunnkort frá Landmælingum og/eða Vegagerðinni
- teikna einfalt road overlay úr open-data eða hand-curated segmentum
- sýna núverandi Veðurstofu og Vegagerðar gögn ofan á sama korti
- staðfesta attribution, cache-reglur, hraða og mobile performance

Útkoma þessa fasa á að vera ákvörðunarskjal og mjög lítið prototype, ekki
production skipti.

### R8 - Live Road OS

Staða: framtíðarsýn, ekki implementation í næsta release.

Þegar road graph, segment state og eigið kortalag eru orðin traust getur
Teskeið þróast í live ferðafélaga:

- GPS staðsetning mappast á núverandi vegkafla
- kerfið reiknar ETA á næstu segment
- spá og raungildi eru borin saman við komu notanda á hvern kafla
- notandi getur valið ökutækjaprófíl, t.d. eftirvagn, mótorhjól eða vörubíl
- Teskeið getur bent á betri brottfarartíma, stoppistað eða alternative leið

Þessi fasi þarf sér privacy, battery, push-notification og safety rýni áður en
hann verður product.

## Data, Privacy Og Kostnaður

- Route-interest má bara byrja sem aggregate, segment-level insight.
- Ekki geyma nákvæm heimilisföng, persónulegar leiðir eða raw user routes nema
  sérstakt privacy plan liggi fyrir.
- Ekki geyma raw Google Routes niðurstöður sem varanlegan Teskeiðar route-cache
  nema sérstök terms-rýni og samþykki liggi fyrir. Geymum frekar afleidda
  segment-level Teskeiðarþekkingu.
- Ef OSM eða önnur open data verða notuð þarf að staðfesta leyfi, attribution og
  cache-reglur áður en það fer í product.
- Ef Google Routes er notað áfram þarf að virða API-skilmála og caching rules.
- Allur kostnaður sem fylgir route cache, cron, Supabase storage, Google eða AI
  þarf að vera sýnilegur í handoff áður en framkvæmd hefst.

## Kóðalendingarstaður

`lib/iceland-routes/` er ætlað fyrir reusable route-domain logic.

Fyrsta útgáfa á að vera lítil:

- `types.ts` fyrir canonical types
- `index.ts` fyrir export contract
- `README.md` fyrir reglur og notkun

Skrár sem nú eru til:

- `RoadIntelligenceMap.md` — stefna fyrir eigið kortalag, open-data rannsókn,
  road graph og Live Road OS.
- `DataLicenses.md` — canonical attribution, leyfi og production varúð fyrir
  open-data uppsprettur.
- `types.ts` — canonical types (IcelandRouteSegment, IcelandRouteFamily, LatLon, ...)
- `segments.ts` — R1 segment registry (6 stubs, öll `verified: false`)
- `openDataSources.ts` — typed registry fyrir open-data sources, CORS stöðu,
  attribution og proxy-readiness.
- `alternatives.ts` — draft curated Road Intelligence alternatives
- `cautions.ts` — draft segment-level Road Intelligence cautions
- `roadIntelligenceResolver.ts` — pure static resolver fyrir route families,
  alternatives og cautions
- `lensTypes.ts` — route lens types (OverviewRouteLensResult, OverviewRouteLensRouteFamily)
- `routeFamilies.ts` — 4 curated route families með corridor waypoints og aliases
- `lensResolver.ts` — curated corridor resolver, pure function
- `lensFilter.ts` — haversine corridor filter
- `index.ts` — export contract v0.4.0

Næstu skrár koma aðeins þegar þær eru notaðar:

- `controlPoints.ts`
- `matching.ts`
- `cacheKeys.ts`
- `intake.ts`
- `__tests__/iceland-routes-*.test.ts`

## Opin Atriði

- Byrjum við með hand-curated registry eða OSM import?
- Hvaða 10-20 leiðir verða regression test grunnur?
- Á graph að búa í TS registry fyrst eða Supabase síðar?
- Hvaða segment-level gögn má geyma án þess að privacy flækist?
- Hvaða afleiddu gögn úr Google Routes köllum má geyma samkvæmt skilmálum, og
  hvað þarf að vera aðeins ephemeral í request/session?
- Hvernig merkjum við óvissu í route intelligence án þess að notandi haldi að
  Teskeið sé opinber færðarheimild?
