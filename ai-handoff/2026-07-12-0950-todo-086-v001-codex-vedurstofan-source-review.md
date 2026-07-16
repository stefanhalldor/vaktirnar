# TODO 086 - Veðurstofa Íslands sem annar spágagnagjafi

Created: 2026-07-12 09:50  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Detailed review / planning handoff  
Source reviewed: `ai-handoff/2026-07-12-0925-chatGPT-vedurstofan`

## Staða

Þetta er rýni á ChatGPT-hugmyndaskjal. Þetta er ekki framkvæmdarleyfi og ég breytti engum kóða.

Kjarnakonseptið er gott: Teskeið á ekki að skipta blindandi út Yr/MET Norway fyrir Veðurstofuna, heldur bæta Veðurstofu Íslands við sem sjálfstæðum gagnagjafa, halda heimildum aðgreindum, sýna þegar heimildir eru ósammála og nota varfærna samantekt þegar við höfum næga vissu.

En ChatGPT-skjalið er of stórt sem implementation plan. Það blandar saman MVP, langtíma product vision, hviðum, hliðarvindi, samanburðarham, source tabs, stöðvamappingu, UX-copy og cache-arkitektúr. Við eigum ekki að láta Claude framkvæma þetta allt í einu.

## Mikilvægasta niðurstaðan

Við eigum að byrja með source/provider-lag sem nærir núverandi domain-kjarna, ekki nýtt veðurkerfi.

Núverandi kóði er þegar með réttan samnýtingarpunkt:

- `lib/weather/assessment.ts` skilgreinir `assessRouteLeg()` sem eina route-leg domain seam-ið.
- `lib/weather/travel.ts` notar það fyrir núverandi Ferðaveðrið.
- `lib/weather/trip-assessment.ts` notar það fyrir Ferðalagið.

Það má ekki forka assessment-lógíkina fyrir Veðurstofuna. Veðurstofu-provider á að framleiða normalíseruð spágögn og metadata sem má síðan keyra í gegnum sama assessment-kjarna.

## Staðfest úr núverandi kóða

### Núverandi MET/Yr fetch og cache

`lib/weather/metno.server.ts`:

- sækir `https://api.met.no/weatherapi/locationforecast/2.0/compact`;
- notar Supabase `weather_cache`;
- cache key er source- og endpoint-specific:
  `metno:locationforecast:2.0:compact:{lat}:{lon}`;
- notar `If-Modified-Since`;
- fellur til baka á cache þegar fetch, 403, 429 eða HTTP-villa kemur.

Þetta er gott mynstur fyrir nýjan provider, en cache key þarf að vera source-specific fyrir Veðurstofuna líka.

### Núverandi normalísering

`lib/weather/forecast.ts` normalíserar MET-gögn í `HourPoint`.

Mikilvæg áhætta fyrir multi-source:

- `HourPoint` hefur bara tölugildi, ekki `null` eða `missing`.
- `airTemperatureC` defaultar í `0`.
- `windGustMs` defaultar í `wind_speed` ef hviða vantar.
- `windFromDegrees` defaultar í `0`.

Það er í lagi fyrir núverandi einnar-heimildar flæði, en fyrir samanburð við Veðurstofuna má ekki rugla saman "vantar gögn" og raunverulegu `0`.

### Route weather points

`lib/weather/routeSampling.ts`:

- dedupe-ar route points á um það bil 1 km grid;
- notar alla unique punkta ef þeir eru <= 120;
- annars velur punkta á um 10 km bili;
- `forecastLat/forecastLon` eru rounded coordinates fyrir MET cache.

Þetta passar við coordinate-based MET API. Veðurstofan er líklega station/model-location based, þannig mappingin má ekki bara nota sömu rounded coordinate-reglu og láta eins og það sé nákvæm punktaspá.

### Route endpoint

`app/api/teskeid/weather/travel/route.ts`:

- sækir route geometry;
- velur `weatherPoints`;
- kallar `fetchForecast()` fyrir hvern punkt;
- droppar einstaka route point ef fetch failar;
- skilar 503 aðeins ef enginn route point og engin destination forecast skila sér.

Fyrir multi-source þurfum við að varðveita missing/failed per source og per point. Annars getum við ekki sýnt "Veðurstofugögn vantar hér" eða reiknað source agreement.

### Domain seam

`lib/weather/assessment.ts`:

- `getForecastHoursNearEta()` notar ±1 klst glugga;
- `assessDrivingConditions()` notar thresholds;
- `assessRouteLeg()` finnur worst values, point statuses og displayPoint;
- `classifyWindDistance()` býr til nýju labels: `Innan marka`, `Nálgast óþægindi`, `Óþægilegt`, `Nálgast hættumörk`, `Hættulegt`.

Þetta á að lifa áfram. Veðurstofu-vinna má ekki duplicate-a þetta.

## Staðfest úr opinberum Veðurstofu-gögnum

Ég skoðaði opinberar upplýsingar Veðurstofunnar:

- XML þjónusta: https://www.vedur.is/um-vi/vefurinn/xml/
- PDF lýsing XML þjónustu: https://www.vedur.is/media/vedurstofan/XMLthjonusta.pdf
- API inngangur: https://api.vedur.is/

Atriði sem skipta máli:

- Veðurstofan býður XML/RSS/CSV þjónustu fyrir staðarspár, athuganir og textaspár.
- Þjónustan er opin og án skráningar, en Veðurstofan biður notendur um að sækja ekki of oft.
- IP-tölur sem valda óeðlilegu álagi geta verið lokaðar.
- Staðarspár nota station IDs úr stöðvalista.
- `forec` er sjálfvirk staðarspá.
- Spáskref geta verið `3h` eða `6h`, en gögn geta vantað fyrir sum skref vegna þess að líkanasamsetning breytist.
- XML docs nefna m.a. `F` vindhraða, `D` vindátt, `T` hita, `R` úrkomu, `FG` hviðu og `FX` hámarksvind.

Þetta styður kjarnann í ChatGPT-skjali, en undirstrikar líka að við þurfum rate-limit/caching og skýra station-mapping gæðamerkingu.

## Hvað er gott í ChatGPT-skjalinu

1. **Ekki replace-a MET/Yr.** Rétt. Veðurstofan á að bætast við sem sjálfstæð heimild.

2. **Halda heimildum aðgreindum.** Rétt. Ekki blanda gildum saman þannig að uppruni tapist.

3. **Sýna ósamræmi sem sjálfstæða upplýsingar.** Rétt. Ef Yr segir 9 m/s en Veðurstofan 16 m/s er það ekki bara "velja hærra", heldur mikilvægt merki um óvissu.

4. **Varfærin sjálfgefin Teskeið-samantekt.** Rétt sem product direction, en ekki fyrr en við höfum prófað gæði mappingarinnar.

5. **Provider abstraction.** Rétt. Restin af kerfinu á ekki að vinna beint með Veðurstofu XML tags.

6. **Station-distance / mapping quality.** Rétt. Þetta er product-critical.

7. **Cache.** Rétt og nauðsynlegt. Opinber Veðurstofuþjónusta má ekki vera hömruð fyrir hvern route point.

## Hvað þarf að leiðrétta eða fresta

### 1. Ekki setja hviður aftur inn sem notendastillt threshold núna

ChatGPT-skjalið fjallar mikið um hviður og hliðarvind. Það passar illa við nýjustu product-ákvörðunina:

- notandinn stillir bara óþægilegan og hættulegan vind;
- hviðutengt er ekki aðal UI/threshold-flæði;
- notandi er hvattur til að skoða Vegagerðina sérstaklega vegna hviða og færðar.

Tæknilega má geyma hviður í raw/normalized data ef þær eru til, en þær eiga ekki að stjórna MVP UI eða threshold labels fyrr en Stebbi ákveður það aftur.

### 2. Ekki gera "Veðurstofan eingöngu" og source tabs strax

`Teskeið | Samanburður | Yr | Veðurstofan` er áhugavert seinna. Fyrsti áfangi ætti frekar að vera:

- source-gögn sótt og normalíseruð;
- shadow comparison/debug;
- ekkert nýtt notendaviðmót nema mögulega internal/debug drawer undir flaggi.

Annars bætum við við mikilli UI-flækju áður en við vitum hvort station-mappingin sé nógu góð.

### 3. Ekki nota "hærra gildi vinnur" óskilyrt fyrir allt

Fyrir vind er varfærna reglan augljós: hærra er verra.

Fyrir úrkomu er hærra oft verra, en spáupplausn og skilgreiningar skipta máli.

Fyrir hitastig er "hærra" ekki alltaf betra eða verra. Frost, hálka, vindkæling og ferðategund skipta máli. Í MVP ætti hitastig fyrst og fremst að vera upplýsingagildi, ekki samsett risk score milli heimilda.

### 4. Tímalógíkin er ekki eins einföld

Núverandi assessment notar ±1 klst kringum ETA. MET gefur oft hourly. Veðurstofan gæti verið 3h/6h eða breytilegt eftir líkani.

Við þurfum `providerCapabilities` eða `timeResolution` áður en við segjum að sama tímareglan virki fullkomlega.

Regla í MVP:

- nota næsta Veðurstofu-spátíma við ETA;
- sýna `forecastTimeIso`;
- ef munurinn frá ETA er of mikill, merkja sem `low_time_confidence`;
- ekki láta eldri/grófari Veðurstofugögn yfirskrifa góð MET-gögn án merkingar.

### 5. Station mapping er stærsti óvissuþátturinn

Veðurstofustöð nálægt leiðarpunkti er ekki alltaf rétt lýsing á vegarkafla.

MVP þarf að geyma og sýna/nota:

- station id;
- station name;
- station lat/lon;
- distance from route point;
- mapping method: nearest station, curated road-segment station, manual override;
- confidence: good / ok / weak / unavailable.

Ef station er langt frá leiðarpunkti má ekki meðhöndla gildið eins og nákvæma punktaspá.

### 6. Núverandi `HourPoint` er ekki nóg fyrir multi-source

Ekki breyta öllu `HourPoint` strax, en bæta við source-aware wrapper frekar en að troða provider metadata inn í núverandi type.

Tillaga:

```ts
type ForecastSourceId = 'metno' | 'vedurstofan'

type ForecastSourceLocation = {
  kind: 'coordinate' | 'station'
  lat: number
  lon: number
  stationId?: string
  stationName?: string
  distanceFromRoutePointM?: number
}

type ForecastProviderResult = {
  sourceId: ForecastSourceId
  hours: HourPoint[]
  fetchedAtIso: string
  validFromIso?: string
  validToIso?: string
  sourceLocation: ForecastSourceLocation
  capabilities: {
    hourly?: boolean
    precipitation?: boolean
    windDirection?: boolean
    gusts?: boolean
    symbols?: boolean
  }
  quality: {
    status: 'ok' | 'partial' | 'stale' | 'unavailable'
    timeResolutionMinutes?: number
    mappingConfidence?: 'good' | 'ok' | 'weak'
    notes?: string[]
  }
}
```

Restin af assessment-kjarnanum getur áfram tekið `TravelPointForecast[]` byggt úr einni valinni source eða varfærnu combined source, en source comparison þarf að geyma meira metadata.

## Tillaga að fösum

### Phase 0 - read-only rannsókn og API sannreyning

Markmið: staðfesta Veðurstofu endpoint, station list, gögn og cache behavior án þess að breyta notendaviðmóti.

Verk:

1. Finna nákvæman endpoint fyrir staðarspár sem við ætlum að nota.
2. Sækja 1-3 þekkt station IDs handvirkt í server-side spike.
3. Parse-a XML/CSV í mjög lítið internal shape.
4. Staðfesta hvaða fields eru raunverulega til í forecast, ekki bara docs.
5. Staðfesta update tíðni og timestamps.
6. Skrá rate-limit/caching reglur.

Ekki:

- engin UI breyting;
- engin combined Teskeið niðurstaða;
- engin source tabs;
- engin production rollout nema sér leyfi.

### Phase 1 - provider abstraction án product breytingar

Markmið: búa til source interface sem MET provider getur líka notað, án þess að breyta núverandi hegðun.

Verk:

1. Búa til `lib/weather/providers/forecastProvider.types.ts`.
2. Wrap-a núverandi MET fetch í `metnoProvider.server.ts` sem skilar `ForecastProviderResult`.
3. Halda `fetchForecast()` sem compatibility wrapper svo núverandi flow brotni ekki.
4. Bæta tests sem sanna að MET wrapper skilar sömu `HourPoint[]` og áður.
5. Engin breyting á `checkTravelWeather()` output.

### Phase 2 - Veðurstofu provider bakvið flagg

Flagg tillaga:

```txt
WEATHER_VEDURSTOFAN_ENABLED=false
WEATHER_VEDURSTOFAN_SHADOW_COMPARE=false
```

Verk:

1. `vedurstofanProvider.server.ts` sækir og cache-ar Veðurstofu forecast per station.
2. Parser normalíserar í `HourPoint[]` þar sem mögulegt er.
3. Missing data verður ekki defaultað í 0 í provider-layer.
4. Cache key inniheldur source, endpoint, station id og time resolution:
   `vedurstofan:xml:forec:{stationId}:{timeStep}`.
5. Tests fyrir XML parser með fixture.
6. Tests fyrir cache key, stale fallback og provider failure.

### Phase 3 - station mapping

Markmið: tengja route points við Veðurstofu stations án þess að ljúga til um nákvæmni.

Verk:

1. Búa til station metadata source:
   - annaðhvort curated JSON í repo í fyrsta fasa;
   - eða cached station list fetch ef API er stöðugt.
2. `mapRoutePointToVedurstofanStation(point)` skilar station + distance + confidence.
3. Byrja með nearest-station og distance threshold.
4. Bæta síðar við curated road-segment overrides fyrir erfið svæði.

Mikilvægt:

- Ekki sækja Veðurstofugögn fyrir hvern route point.
- Finna unique station IDs fyrst, sækja hverja stöð einu sinni, deila á route points.

### Phase 4 - shadow comparison í logs/debug aðeins

Markmið: bera saman MET og Veðurstofu á raunleiðum án þess að breyta upplifun notenda.

Verk:

1. Þegar flaggið er virkt, sækja Veðurstofu samhliða MET.
2. Reikna source comparison fyrir route points:
   - wind difference;
   - precipitation difference ef sambærilegt;
   - time difference from ETA;
   - station distance/confidence.
3. Logga sanitized metrics, ekki raw payloads eða persónugögn.
4. Ekki breyta `travelPlan` default result enn.

### Phase 5 - internal comparison view undir flaggi

Markmið: sýna Stebba/innri notanda samanburð án þess að gera það að default product.

UI þarf að fylgja `Design.md`:

- mobile-first;
- engin nested cards;
- structured summary rows;
- litir mega ekki vera eina merkingin;
- texti stuttur og praktískur;
- loader/pending state ef source comparison bíður.

Tillaga:

- Í punktadetail eða debug drawer: "Heimildir".
- Sýna:
  - MET/Yr gildi;
  - Veðurstofu gildi;
  - Veðurstofu station name og fjarlægð;
  - "Sammála", "Nokkur munur", "Mikill munur" fyrir vind.

Ekki strax:

- engin stór tabs röð í aðal summary;
- engin default source switching;
- engin combined score fyrir alla notendur.

### Phase 6 - varfærin Teskeið samantekt

Þetta kemur aðeins eftir að Phase 4/5 hafa sýnt að gögnin eru nógu gagnleg.

Regla:

- Fyrir vind má nota varfærnara/særra gildi ef source confidence er næg.
- Ef Veðurstofu station mapping er veik, má ekki láta hana yfirskrifa MET án skýrrar merkingar.
- Ef heimildir eru mjög ósammála, sýna það sem eigið "óvissu" signal.

## Mælt architecture

### Nýjar skrár síðar

```txt
lib/weather/providers/forecastProvider.types.ts
lib/weather/providers/metnoProvider.server.ts
lib/weather/providers/vedurstofanProvider.server.ts
lib/weather/providers/vedurstofanParser.ts
lib/weather/providers/vedurstofanStations.ts
lib/weather/providers/sourceComparison.ts
lib/weather/providers/providerCache.server.ts
```

### Núverandi skrár sem á að vernda

```txt
lib/weather/assessment.ts
lib/weather/travel.ts
lib/weather/trip-assessment.ts
lib/weather/types.ts
app/api/teskeid/weather/travel/route.ts
```

Regla: `assessment.ts` má þróast, en ekki búa til nýtt Veðurstofu-assessment sem fer framhjá `assessRouteLeg()`.

## Sérstakar áhættur

### P0 - Veðurstofuþjónusta má ekki vera ofnotuð

Opinber docs segja að ekki eigi að sækja of oft og að IP-tölur geti verið lokaðar við óeðlilegt álag. Þess vegna er cache ekki optimization, heldur öryggisskilyrði.

### P1 - "0" má ekki þýða "vantar"

Áður en við berum saman heimildir þarf provider-layer að varðveita missing data. Annars gæti "vantar vindátt" orðið norðanátt eða "vantar hita" orðið 0°C.

### P1 - Station mapping getur verið villandi

Það má ekki sýna "Veðurstofan segir X á þessum punkti" nema við vitum hvaða station/model point var notað og hversu nálægt það er.

### P2 - Tímasamanburður getur verið ósanngjarn

Ef MET er hourly og Veðurstofan 3h/6h má ekki bera þau saman eins og þau séu sama upplausn. Sýna þarf forecast time og mögulega confidence.

### P2 - UI getur orðið of þungt

Source tabs, samanburðartöflur og source mode eru áhugaverð, en ekki í fyrsta product áfanga. Byrja í debug/detail, ekki aðal summary.

### P2 - Hviður má ekki smygla aftur inn í threshold UI

Geyma raw hviður ef þær koma, en ekki láta þær stjórna notendastöðum eða texta fyrr en það er sér product ákvörðun.

## Hvað ég myndi senda Claude næst

```md
Claude Code, vinsamlegast ekki framkvæma stóra ChatGPT-skjalið beint.

Við viljum byrja á litlum future-proof undirbúningi fyrir Veðurstofu Íslands sem annan spágagnagjafa, án UI breytinga og án þess að breyta núverandi ferðaveðursniðurstöðu.

Markmið fyrsta áfanga:
1. Skoða núverandi `lib/weather/metno.server.ts`, `lib/weather/forecast.ts`, `lib/weather/types.ts`, `lib/weather/assessment.ts`, `lib/weather/travel.ts`, `lib/weather/routeSampling.ts` og `app/api/teskeid/weather/travel/route.ts`.
2. Leggja fram implementation plan fyrir provider abstraction sem verndar núverandi `assessRouteLeg()` domain seam.
3. Plan má innihalda nýtt `ForecastProviderResult` / source-aware wrapper utan um `HourPoint[]`, en má ekki breyta núverandi API output í fyrsta áfanga.
4. Plan þarf að útskýra hvernig Veðurstofu station mapping verður gerð án þess að láta station-gögn líta út eins og nákvæm punktaspá.
5. Plan þarf að útskýra cache og rate-limit strategy fyrir Veðurstofu XML/CSV þannig að við sækjum ekki of oft.
6. Plan þarf að halda hviðum utan user-facing threshold UI í bili. Raw hviður má geyma sem metadata ef þær eru til, en þær eiga ekki að breyta labels eða pillum.
7. Engar kóðabreytingar í þessum áfanga nema Stebbi gefi sérstaklega framkvæmdarleyfi.

Skilaðu handoff með:
- hvaða source/provider interface þú leggur til;
- hvaða skrár yrðu nýjar/breyttar í Phase 1;
- hvaða tests yrðu bætt við;
- hvaða feature flags yrðu notuð;
- hvaða production/data/API áhættur eru til staðar;
- Localhost checks for Stebbi.
```

## Localhost checks for Stebbi

Þetta review er ekki notendavirk breyting, þannig það er ekkert nýtt á localhost að prófa út af þessu skjali einu og sér.

Þegar Claude kemur með Phase 1 implementation síðar, þá þarf Stebbi að prófa:

1. `/vedrid` óbreytt með `WEATHER_VEDURSTOFAN_ENABLED=false`.
2. Sama route og áður sýnir sömu route options, sömu scrubber hegðun og sömu summary labels.
3. Enginn nýr texti um Veðurstofu birtist nema flagg/UI phase sé sérstaklega virkt.
4. Með debug/shadow flaggi virku má aðeins prófa á localhost eða preview, ekki setja í production nema cache og rate-limit sé yfirfarið.

Ekki prófa kæruleysislega:

- Ekki hamra Veðurstofu endpoint með mörgum route requests án cache.
- Ekki keyra SQL eða production deploy nema Stebbi gefi sérstakt leyfi.
- Ekki láta public notendur sjá samanburð fyrr en mapping quality hefur verið sannreynt.

## Næsta skref sem ég mæli með

Biðja Claude um Phase 1 plan eingöngu: provider abstraction og Veðurstofu spike plan, ekki implementation. Þegar planið kemur til baka, láta Codex rýna það áður en Claude fær framkvæmdarleyfi.
