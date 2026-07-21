# Open Data Research

Created: 2026-07-20
Scope: M1 fyrir Road Intelligence eigið kortalag

Þetta skjal skráir fyrstu open-data niðurstöðu fyrir eigið Teskeiðar
Road Intelligence kortalag. Þetta er rannsóknarskjal, ekki production plan.

Niðurstaðan í stuttu máli:

- Vegagerðin er sterkasti kandídat fyrir road overlay, færð, lokanir,
  vefmyndavélar, umferð og raungildi.
- Landmælingar Íslands er sterkasti kandídat fyrir opið grunnkort og bakgrunn,
  en þarf layer/renderer spike áður en við veljum MapLibre/Leaflet/OpenLayers.
- OpenStreetMap er gagnlegt sem auka POI/road metadata lag, en ODbL
  share-alike þýðir að við eigum ekki að blanda OSM beint inn í proprietary
  Teskeiðar-road-graph án sér leyfis- og gagnahönnunarrýni.

## Recommendation Fyrir M2

Byrja ekki á fullu MapLibre/vector-tile platformi strax.

Besti næsti skammtur er:

1. Búa til feature-flaggaðan, read-only map spike bak við
   `road-intelligence-v1`.
2. Nota Landmælingar Íslands WMS/WMTS eða annað opið raster grunnkort sem
   bakgrunn.
3. Teikna 1-2 Vegagerðin road/færð overlay layer sem client-side eða
   server-proxy read-only proof.
4. Sýna enga nýja user-facing ráðleggingu og vista engin gögn.
5. Nota niðurstöðuna til að velja hvort M2B fari í MapLibre GL JS, Leaflet eða
   OpenLayers.

Fyrir hraðasta sýnilega proof er Leaflet líklega einfaldast með WMS/WMTS.
Fyrir langtíma eigið vector-kortalag, PMTiles og segment styling er MapLibre GL
JS líklega betra markmið. Því er skynsamlegt að M2 sé tvískipt:

- M2A: Leaflet/WMS proof til að sannreyna gögn, attribution og mobile UX hratt.
- M2B: MapLibre/PMTiles/vector proof ef M2A sýnir að eigin kortalag er
  raunhæft.

`package.json` er ekki með MapLibre, Leaflet eða OpenLayers í dag. Dependency
val og install á að bíða sér samþykkis frá Stebba.

## M1B Framkvæmd: Source Registry Og CORS Preflight

Eftir devil's advocate rýni var næsti öruggi skammtur að loka license/CORS
óvissu áður en map dependency er valin.

Bætt við:

- `DataLicenses.md` sem canonical attribution og leyfisskjal
- `lib/iceland-routes/openDataSources.ts` sem typed source registry
- `lib/__tests__/iceland-routes-open-data-sources.test.ts` til að passa að
  source IDs, license URLs, attribution og proxy flagging haldist rétt

CORS preflight 2026-07-20 með `Origin: https://www.teskeid.is`:

- LMÍ WMS GetCapabilities: `Access-Control-Allow-Origin: *`
- Vegagerðin `data/vegakerfi/MapServer?f=json`: ekkert
  `Access-Control-Allow-Origin`
- Vegagerðin `data/faerd/FeatureServer?f=json`: ekkert
  `Access-Control-Allow-Origin`
- Vegagerðin OPTIONS svaraði með allowed methods/headers en án
  `Access-Control-Allow-Origin`

Túlkun:

- LMÍ er góður kandídat fyrir direct browser basemap í M2.
- Vegagerðin ArcGIS þarf líklega same-origin allowlisted proxy fyrir browser
  map/overlay notkun.
- Proxy má ekki vera almennur open proxy. Hann þarf allowlist á host, path,
  query params og content-type.

## Vegagerðin GIS Og Gagnaveita

### Staðfest endpoints og þjónustur

Opinber þjónustusíða Vegagerðarinnar segir að gögn séu uppfærð reglulega; sum
gögn, eins og veður og færð, eru uppfærð á nokkurra mínútna fresti.

Staðfestar slóðir:

- Vefþjónustusíða: https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur
- Skilmálar: https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur/skilmalar-vefthjonustur
- ArcGIS data folder: https://vegasja.vegagerdin.is/arcgis/rest/services/data
- Vegakerfi MapServer: https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer
- Færð FeatureServer: https://vegasja.vegagerdin.is/arcgis/rest/services/data/faerd/FeatureServer
- Færð gagnasnið: https://www.vegagerdin.is/vegagerdin/gagnasafn/faerd-gagnasnid
- Vefmyndavélar: https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur/vefmyndavelar
- Núverandi veðurmælingar, þegar í Teskeiðarkóða:
  https://gagnaveita.vegagerdin.is/api/vedur2014_1

ArcGIS data folder listar m.a.:

- `data/bryr_fag` FeatureServer/MapServer
- `data/faerd` FeatureServer/MapServer
- `data/frkvbrotlinur` FeatureServer/MapServer
- `data/info` MapServer
- `data/slitlag` MapServer
- `data/utbodvidhald` FeatureServer/MapServer
- `data/vegakerfi` MapServer
- `data/Yfirlagnir` FeatureServer/MapServer

`data/vegakerfi/MapServer` lítur sérstaklega vel út fyrir road graph discovery:

- lög fyrir jarðgöng
- stöðvasetningu
- vegi
- vegflokka
- aðra vegi í gagnasafni
- akbrautir og rampa
- spatial reference `ISN93 / EPSG:3057`
- supported query formats: JSON og GeoJSON
- WMS og WFS linkar eru sýnilegir á ArcGIS service page

`data/faerd/FeatureServer` lítur vel út fyrir segment-state seinna:

- vegavinnu layer
- þungatakmarkanir
- færð skilti/punktar
- færð línu/segment layers
- supported query format: JSON

Vegagerðin Færð gagnasnið gefur sérlega gagnlegt domain signal:

- færð er skipt í marga mislanga búta
- `IdButur` er einkvæmt auðkenni fyrir bút
- bútar hafa færðarástand, veðurviðbót, framkvæmdir og ásþungatakmarkanir
- hnit leiða fást með WFS `gis:faerdferlar2017_1`
- Vegagerðin varar við að sækja hnit leiðanna ekki oft; fylgjast má frekar með
  breytingum á `IdButur`
- `DagsKeyrtUt` á ekki að verða mikið eldra en 10 mínútur samkvæmt skjölunum

Þetta passar mjög vel við Teskeiðarhugmyndina um `road_segment`/segment-state.

### Leyfi og attribution

Vegagerðin birtir sérstaka skilmála fyrir gjaldfrjáls gögn. Þar kemur fram að
nota og endurnýta megi upplýsingarnar án gjaldtöku, að uppfylltum skilyrðum.

Attribution texti sem þarf að koma fram þegar byggt er á gögnunum:

`Byggt á gögnum frá Vegagerðinni.`

Einnig á að vísa í leyfið þar sem því verður við komið.

Mikilvægar varúðir:

- ekki gefa til kynna að Teskeið sé opinber aðili eða samþykkt sérstaklega af
  Vegagerðinni
- ekki villa um fyrir notendum um uppruna eða áreiðanleika
- Vegagerðin ábyrgist ekki villur, vöntun eða áframhaldandi aðgengi
- persónuupplýsingar og réttindi þriðja aðila falla ekki sjálfkrafa undir leyfið

### Cache og fetch ráðlegging

Vegagerðin skjölin gefa sterkt merki um að metadata/geometry eigi að cache-a
varlega:

- færðargögn og veður geta uppfærst á nokkurra mínútna fresti
- hnit leiða eiga ekki að vera sótt mörgum sinnum á sólarhring
- route geometry/ferlar má líklega sækja sjaldan og fylgjast með `IdButur`
  breytingum
- current Vegagerðin mælingar eru þegar cache-aðar í Teskeið með cron og
  history fallback

Ráðlegging:

- Live/volatile state: server-side fetch og stuttur cache, líkt og núverandi
  `vedur2014_1`.
- Geometry/stöðug road data: sækja sjaldan, hash-a eða version-a, ekki sækja í
  hverju browser renderi.
- M2 prototype: byrja read-only og `no-store`/stuttur cache aðeins fyrir prófun,
  áður en við ákveðum varanlegt cache.

### CORS og client use

CORS preflight var prófað 2026-07-20 fyrir tvö ArcGIS endpoints. Svörin sýndu
ekki `Access-Control-Allow-Origin` fyrir `Origin: https://www.teskeid.is`.

Ráðlegging:

- Gera ráð fyrir Next.js API route sem read-only proxy fyrir Vegagerðin overlay.
- Production proxy þarf sér rate-limit/cache ákvörðun áður en hann fer live.
- Proxy þarf allowlist og má ekki taka arbitary URL frá client.

### Hentar fyrir

- Road graph seed
- road segment geometry
- færð/lokanir/vegavinna/þungatakmarkanir
- weather station current observations
- vefmyndavélar
- umferðarteljarar
- segment-state og future risk scoring

Confidence: high fyrir að Vegagerðin sé aðal road-intelligence source. Medium
fyrir nákvæma CORS/browser notkun þar til prófað.

## Landmælingar Íslands

### Staðfest endpoints og þjónustur

Landmælingar Íslands birta vefþjónustur í gegnum GeoServer. Opinber síða segir
að þjónusturnar séu gjaldfrjálsar og að þær séu opnanlegar í QGIS, ArcGIS eða
forritum með landupplýsingaviðbótum.

Staðfestar slóðir:

- Vefþjónustur: https://www-gamli.lmi.is/landupplysingar/vefthjonustur/
- GeoServer web: https://gis.lmi.is/geoserver/web/
- Leyfi: https://www-gamli.lmi.is/landupplysingar/leyfi-fyrir-gjaldfrjals-gogn/

Þjónustutegundir sem eru staðfestar á LMÍ síðu:

- WMS fyrir skoðunarþjónustu/myndir
- WFS fyrir gögnin sjálf
- WMTS fyrir fyrirfram útbúnar myndir og hraða birtingu

GeoServer instance sýnir anonymous access að mörgum workspaces og mörg hundruð
layers. Relevant layer families sem sáust í fyrstu skoðun:

- `IS_50V:*`
- `INSPIRE:*`
- `TransportNetworks`
- `LMI_raster:*`
- `LMI_vektor:*`
- `grunnkort2025`
- `osm:*`
- `vegagerdin`

### Leyfi og attribution

LMÍ leyfissíða segir að opin gögn Landmælinga Íslands séu gefin út undir
Creative Commons Attribution 4.0 International License.

Attribution þarf að nefna:

- Landmælingar Íslands
- heiti gagnasetts
- tíma sem gögn voru sótt

Dæmi sem LMÍ gefur er í anda:

`Inniheldur gögn frá IS 50V gagnagrunni Landmælinga Íslands frá 12/2020`

### Cache og fetch ráðlegging

WMTS er líklega best fyrir hraðasta grunnkort í browser, því það er hannað fyrir
fyrirfram útbúnar myndir. WMS getur verið gott í proof en getur verið þyngra.
WFS er betra þegar við viljum lesa gögn/geometry, ekki bara teikna bakgrunn.

Ráðlegging:

- M2A: prófa WMTS eða WMS sem raster/tile grunnkort.
- M2B: skoða hvort LMÍ vector layers eða eigin PMTiles pipeline henti betur fyrir
  langtíma MapLibre.
- Ekki geyma LMÍ gögn í Supabase fyrr en við höfum skráð dataset, útgáfu,
  attribution og cache/refresh reglu.

### CORS og client use

WMS GetCapabilities og OPTIONS voru prófuð 2026-07-20 með
`Origin: https://www.teskeid.is`. LMÍ svaraði með
`Access-Control-Allow-Origin: *`.

Ráðlegging:

- LMÍ má prófa direct í einföldum feature-flagguðum client spike.
- Ef CORS eða performance er vandamál, nota server proxy eða eigin tile cache
  bara eftir sér ákvörðun.

### Hentar fyrir

- grunnkort
- örnefni
- hæðarlíkan/hillshade
- náttúruleg kennileiti
- stjórnsýslumörk
- mögulega transport network comparison við Vegagerðin

Confidence: high fyrir að LMÍ sé góður grunnkorts-source. Medium fyrir
nákvæma MapLibre/WMTS layer stillingu þar til layer spike er búinn.

## OpenStreetMap

### Staðfest leyfi og attribution

OpenStreetMap data er opið gagnasafn undir Open Data Commons Open Database
License (ODbL). Opinber OSM copyright síða segir að afrita, dreifa og aðlaga
megi gögnin ef OpenStreetMap og contributors fá credit. Ef gagnagrunnurinn er
breyttur eða byggt ofan á hann getur share-alike krafa átt við.

Staðfestar slóðir:

- OSM copyright: https://www.openstreetmap.org/copyright/en-US
- OSMF attribution guidelines: https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- ODbL: https://opendatacommons.org/licenses/odbl/

OSMF attribution guidance segir m.a. að interactive maps eigi venjulega að sýna
credit í horni kortsins eða við kortið og að notandi þurfi að geta fundið
upplýsingar um leyfi.

### Hentar fyrir

- POI
- eldsneyti
- hleðslustöðvar
- tjaldsvæði
- þjónusta
- byggingar og staðföng
- secondary road metadata
- routing-engine input ef við förum í OSRM/Valhalla/GraphHopper prototype

### Varúð vegna derived database

OSM er mjög gagnlegt, en við þurfum að passa að Teskeiðar proprietary
road-intelligence graph verði ekki óvart ODbL derivative database sem við
þurfum að gefa út undir sömu skilmálum.

Ráðlegging:

- Nota OSM fyrst sem aðskilið, attribuerað overlay eða tile source.
- Ekki sameina OSM road geometry og Teskeiðar expert/community data í eina
  varanlega gagnagrunnstöflu án sér leyfisrýni.
- Ef við notum OSM fyrir routing engine, hafa attribution skýrt í UI og docs.
- Ef við notum hosted tiles, lesa terms viðkomandi tile-provider líka. OSM gögn
  eru opin, en OSM veitir ekki ókeypis map API/tile hosting fyrir þriðju aðila.

Confidence: high fyrir leyfisramma og usefulness sem auxiliary layer. Medium
fyrir hvort OSM eigi að vera routing-grunnur Teskeiðar, því það veltur á
ODbL/gagnagrunnshönnun og gæðum íslenskra attributes.

## Renderer Valkostir

### Leaflet

Kostir:

- einfalt fyrir WMS/WMTS/raster
- fljótlegt proof
- lítil cognitive overhead
- gott fyrir M2A ef markmiðið er að sjá open-data kort hratt

Gallar:

- ekki jafn sterkt fyrir stór vector tile styling
- síður framtíðarvænt ef Teskeið fer í eigin vector-tile road graph

### MapLibre GL JS

Kostir:

- sterkt fyrir vector tiles, dynamic styling og segment-state
- passar betur við langtíma road graph/PMTiles sýn
- betra fyrir high-density overlays ef við förum alla leið

Gallar:

- meiri setup vinna
- tile/style pipeline þarf skýrari ákvörðun
- dependency og CSS þarf að prófa vel í Next.js/mobile

### OpenLayers

Kostir:

- mjög sterkt í OGC heimi, WMS/WFS/WMTS
- gott fyrir GIS-heavy workflow

Gallar:

- þyngra developer ergonomics fyrir Teskeið app
- getur verið meira enterprise/GIS en product UI

## M2 Tillaga

### M2A - Tiny Open Map Spike

Afmörkun:

- ný route, t.d. `/auth-mvp/vedrid/road-map-prototype`
- aðeins authenticated + `road-intelligence-v1`
- engin production replacement
- engin Supabase writes
- engin user GPS
- engar nýjar ráðleggingar
- bara grunnkort + eitt Vegagerðin overlay + attribution

Mælikvarðar:

- renderar kortið á mobile án horizontal overflow
- attribution sést og er læsilegt
- fyrsta tile load er ásættanlegt
- hægt er að sýna minnst eitt road/færð layer
- CORS/proxy ákvörðun verður skýr

### M2B - Segment Overlay Proof

Afmörkun:

- 10-20 handpicked segments úr `lib/iceland-routes/segments.ts`
- teikna segment sem overlay
- sýna dummy/read-only segment-state úr static registry
- engin live safety scoring

Mælikvarðar:

- segment styling er læsilegt á mobile
- selected segment getur tengst existing weather/pulse UI síðar
- hægt er að sjá hvernig `road_segment` verður product primitive

## Open Questions Fyrir Claude Og Stebba

1. Eigum við að fara beint í MapLibre fyrir M2A til að spara throwaway vinnu og
   nálgast framtíðar vector-tile sýn?
2. Ef Stebbi vill hraðasta mögulega sjónræna proofið, er vanilla Leaflet án
   `react-leaflet` ásættanlegt sem tímabundið spike?
3. Viljum við nota Vegagerðin `faerdferlar2017_1` sem fyrsta real segment layer,
   eða byrja á hand-curated `lib/iceland-routes/segments.ts` overlay?
4. Þarf Stebbi að samþykkja exact attribution texta áður en kort prototype fer í
   browser?
5. Á Vegagerðin overlay proxy að vera hluti af M2A strax, eða bíða þar til
   basemap render er staðfest?

## Sources

- Vegagerðin vefþjónustur:
  https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur
- Vegagerðin skilmálar:
  https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur/skilmalar-vefthjonustur
- Vegagerðin ArcGIS data folder:
  https://vegasja.vegagerdin.is/arcgis/rest/services/data
- Vegagerðin vegakerfi MapServer:
  https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer
- Vegagerðin færð FeatureServer:
  https://vegasja.vegagerdin.is/arcgis/rest/services/data/faerd/FeatureServer
- Vegagerðin færð gagnasnið:
  https://www.vegagerdin.is/vegagerdin/gagnasafn/faerd-gagnasnid
- Vegagerðin vefmyndavélar:
  https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur/vefmyndavelar
- Landmælingar Íslands vefþjónustur:
  https://www-gamli.lmi.is/landupplysingar/vefthjonustur/
- Landmælingar Íslands GeoServer:
  https://gis.lmi.is/geoserver/web/
- Landmælingar Íslands leyfi:
  https://www-gamli.lmi.is/landupplysingar/leyfi-fyrir-gjaldfrjals-gogn/
- OpenStreetMap copyright:
  https://www.openstreetmap.org/copyright/en-US
- OSMF attribution guidelines:
  https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- ODbL:
  https://opendatacommons.org/licenses/odbl/
