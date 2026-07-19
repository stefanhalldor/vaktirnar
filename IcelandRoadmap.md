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

## Ekki markmið í fyrstu

- Ekki skipta Google Routes út í production strax.
- Ekki byggja nákvæma götunavigation niður í húsnúmer.
- Ekki geyma persónulegar ferðir eða heimilisföng án sér privacy-rýni.
- Ekki gefa opinbera færðar- eða öryggisyfirlýsingu sem gögnin styðja ekki.
- Ekki byggja canonical Teskeiðarvegakerfi með því að vista hráar Google Routes
  niðurstöður sem okkar eigin gögn. Google má vera provider/fallback, en
  Teskeiðarþekkingin á að vera okkar eigin provider-neutral afleiða.

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

- `types.ts` — canonical types (IcelandRouteSegment, IcelandRouteFamily, LatLon, ...)
- `segments.ts` — R1 segment registry (6 stubs, öll `verified: false`)
- `lensTypes.ts` — route lens types (OverviewRouteLensResult, OverviewRouteLensRouteFamily)
- `routeFamilies.ts` — 4 curated route families með corridor waypoints og aliases
- `lensResolver.ts` — curated corridor resolver, pure function
- `lensFilter.ts` — haversine corridor filter
- `index.ts` — export contract v0.3.0

Næstu skrár koma aðeins þegar þær eru notaðar:

- `controlPoints.ts`
- `matching.ts`
- `cacheKeys.ts`
- `cautions.ts`
- `alternatives.ts`
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
