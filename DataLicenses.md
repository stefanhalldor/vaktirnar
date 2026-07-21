# DataLicenses.md - Road Intelligence Data Sources

Þetta skjal er canonical staður fyrir attribution, leyfi og notkun open-data
uppsprettna í Road Intelligence vinnunni.

Þetta er ekki lagalegt álit. Þetta er tæknilegt og product-facing yfirlit sem
á að rýna áður en gögn fara í production UI.

## Reglur

- Attribution texti á að vera í eða við kortið þegar gögn eru sýnileg notanda.
- Ekki dreifa attribution textum handahófskennt um JSX. Nota skal canonical
  constants úr `lib/iceland-routes/openDataSources.ts` þegar UI fer að nota
  gögnin.
- Ekki blanda OSM road geometry inn í proprietary Teskeiðar-road-graph án sér
  leyfis- og gagnahönnunarrýni.
- Ekki geyma open-data geometry í Supabase eða öðrum persistent store fyrr en
  cache, attribution, refresh og license áhrif eru skjalfest.

## Vegagerðin

Provider: Vegagerðin

Hlutverk:

- road overlay
- færð og lokanir
- vegavinna og þungatakmarkanir
- veðurstöðvar og hviður
- síðar vefmyndavélar og umferðarteljarar

Canonical attribution:

`Byggt á gögnum frá Vegagerðinni.`

License/skilmálar:

- https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur/skilmalar-vefthjonustur

Relevant endpoints:

- https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer
- https://vegasja.vegagerdin.is/arcgis/rest/services/data/faerd/FeatureServer
- https://gagnaveita.vegagerdin.is/api/vedur2014_1

CORS staða 2026-07-20:

- `data/vegakerfi/MapServer?f=json` svaraði ekki með
  `Access-Control-Allow-Origin` fyrir `Origin: https://www.teskeid.is`.
- `data/faerd/FeatureServer?f=json` svaraði ekki með
  `Access-Control-Allow-Origin` fyrir `Origin: https://www.teskeid.is`.
- OPTIONS svaraði með `Access-Control-Allow-Methods`, en án
  `Access-Control-Allow-Origin`.

Ráðlegging:

- Gera ráð fyrir same-origin read-only proxy fyrir browser notkun þar til
  annað er staðfest.
- Ekki gera proxy að almennum open proxy. Hann þarf allowlist á host, path,
  query params og content-type.

Production varúð:

- Vegagerðin ber ekki ábyrgð á villum eða áframhaldandi aðgengi.
- UI má ekki gefa til kynna að Teskeið sé opinber færðarheimild eða samþykkt af
  Vegagerðinni.

## Landmælingar Íslands

Provider: Landmælingar Íslands

Hlutverk:

- grunnkort
- örnefni
- hæðarlíkan/hillshade
- náttúruleg kennileiti
- mögulega transport network comparison

Canonical attribution pattern:

`Inniheldur gögn frá {dataset} gagnagrunni Landmælinga Íslands frá {retrievedAt}.`

Dæmi:

`Inniheldur gögn frá IS 50V gagnagrunni Landmælinga Íslands frá 2026-07-20.`

License:

- Creative Commons Attribution 4.0 International License
- https://creativecommons.org/licenses/by/4.0/

Relevant endpoints:

- https://gis.lmi.is/geoserver/ows
- https://gis.lmi.is/geoserver/web/

CORS staða 2026-07-20:

- WMS GetCapabilities svaraði með `Access-Control-Allow-Origin: *`.
- OPTIONS svaraði með `Access-Control-Allow-Origin: *`.

Ráðlegging:

- LMÍ er líklegur besti fyrsti basemap-source fyrir M2A.
- Staðfesta þarf nákvæmt layer og attribution dataset áður en route er birt
  notendum.

Production varúð:

- Attribution þarf að nefna Landmælingar Íslands, gagnasafn og sótt dagsetningu.

## OpenStreetMap

Provider: OpenStreetMap contributors

Hlutverk:

- POI
- bensín, hleðsla, þjónusta og tjaldsvæði
- auka road metadata
- routing-engine input í sér tilraun

Canonical attribution:

`OpenStreetMap contributors`

License:

- Open Data Commons Open Database License (ODbL)
- https://opendatacommons.org/licenses/odbl/

Relevant pages:

- https://www.openstreetmap.org/copyright/en-US
- https://osmfoundation.org/wiki/Licence/Attribution_Guidelines

Ráðlegging:

- Nota OSM fyrst sem aðskilið, attribuerað auxiliary layer.
- Ekki sameina OSM road geometry og Teskeiðar expert/community data í eina
  varanlega gagnagrunnsafleiðu án sér rýni.

Production varúð:

- OSM data er opin, en OSM tile servers eru ekki ókeypis production API fyrir
  þriðju aðila.
- Hosted tile provider getur haft eigin skilmála og kostnað.
