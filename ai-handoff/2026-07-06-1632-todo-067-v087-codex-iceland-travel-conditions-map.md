# todo-067 v087 - Iceland travel conditions map for model building and public beta

Created: 2026-07-06 16:32  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Relevant TODO: ongoing `todo-067` Ferðalagið weather work

## Context

Stebbi wants to start building an Iceland-wide travel-conditions map now, not later. The idea is both product and model-development infrastructure:

- show Iceland on a map
- color forecast points or road segments by Teskeið's travel thresholds
- allow time scrubbing like vedur.is maps
- allow click/tap on bad values to inspect wind, gust, temperature, precipitation and threshold reason
- use it internally to validate and tune the deterministic travel model
- eventually open it publicly to advertise Teskeið and collect input from real weather nerds

This is a strong direction. It is not just decoration. It can become the fastest way to see whether the model is sane across the whole country before users ask route-specific questions.

## Current state confirmed in code

The current app does **not** fetch weather for all of Iceland.

Current route flow:

- Google route geometry is calculated.
- Route is sampled into max `MAX_WEATHER_POINTS = 15` points in `app/api/teskeid/weather/travel/route.ts`.
- `fetchForecast(lat, lon)` is called for those route sample points and destination.
- `fetchForecast` uses met.no `locationforecast/2.0/compact` point forecasts and cache keys by rounded coordinates.

So an Iceland-wide map is a new data pipeline and UI, not just a new display over the existing route result.

## Product decision

Build this as:

1. **Internal/model-lab first**: visible behind admin/dev/beta flag, used by Stebbi and testers to validate the model.
2. **Public beta second**: open a carefully framed public view to attract interested users and weather nerd feedback.

Do not make this a hidden-only tool forever. The public beta is part of the product and marketing strategy. But do not publish it until the data pipeline is safe, cached, attributed and not misleading.

## Critical data/API constraint

Do not implement this by making each browser or each page load call met.no for hundreds/thousands of coordinates.

met.no Terms of Service require identification, caching, avoiding unnecessary traffic, respecting `Expires`/cache headers, spreading traffic, and avoiding overload. Their docs also say browsers/mobile apps should generally use a local proxy/BFF where data can be cached and identification handled. If using direct browser calls, low volume may be acceptable, but this map is not low volume by design.

Relevant sources:

- met.no Terms of Service: https://api.met.no/doc/TermsOfService
- Locationforecast docs: https://api.met.no/weatherapi/locationforecast/2.0/documentation
- met.no docs mention gridded forecast data / THREDDS: https://api.met.no/doc/

## Recommended architecture

### Do not start with a dense full-country grid

A dense lat/lon grid over all Iceland is tempting, but it is easy to make it both expensive and misleading. Travel conditions are about roads, not every untraveled mountain point.

Start with a **road-aware map**:

- use road/route-relevant sample points or road segments
- color those points/segments by travel thresholds
- optionally add destination/settlement forecast points later
- keep a separate experimental gridded overlay only if we need it for model validation

### Data snapshot model

Create a server-generated snapshot:

- `travel-conditions-snapshot`
- generated on a schedule or on-demand for admin/dev
- contains forecast values and computed travel status for a fixed set of Iceland road/region points
- cached by forecast model time / met.no cache headers
- served to browser as one compact JSON payload

The browser should load the snapshot, not hammer met.no directly.

Possible snapshot shape:

```ts
type TravelConditionSnapshot = {
  generatedAt: string
  validTimes: string[]
  modes: Array<'car' | 'caravan' | 'horse_trailer'>
  points: Array<{
    id: string
    lat: number
    lon: number
    roadName?: string
    regionName?: string
    forecastLat: number
    forecastLon: number
    valuesByTime: Record<string, {
      status: 'graent' | 'gult' | 'rautt' | 'no_data'
      reasonCode?: string
      metric?: 'wind' | 'gust' | 'precipitation' | 'data'
      value?: number
      threshold?: number
      unit?: 'm/s' | 'mm/klst'
      airTemperatureC?: number
      windMs?: number
      gustMs?: number
      precipMmPerHour?: number
      symbolCode?: string
    }>
  }>
}
```

### Evaluation engine reuse

Do not create a second weather model for this map.

The map should reuse the same deterministic threshold logic as route weather:

- wind thresholds
- gust thresholds
- precipitation thresholds
- trailer mode differences
- no-data handling
- threshold metadata for explanations

If the current route code does not expose the evaluator cleanly enough, extract a shared pure helper first.

### Public beta framing

The public page should be framed clearly:

- `Ferðaskilyrðakort beta`
- `Reiknað úr veðurspá og okkar ferðamati. Ekki umferðar- eða farartrygging.`
- show data timestamp and forecast valid time
- include attribution to Veðurstofu Íslands / met.no as currently used
- include feedback CTA:
  - `Sérðu eitthvað sem lítur rangt út?`
  - `Sendu athugasemd`
  - optional structured fields: location/time, expected issue, comment, contact optional

This is a good marketing surface, but it must invite expert correction rather than pretend to be official.

## UX proposal

### Map surface

Mobile-first but desktop-friendly:

- full-width map
- time scrubber at bottom or below map
- mode selector: `Bíll`, `Hjólhýsi`, `Hestakerra`
- status legend: green/yellow/red/gray
- selected point/segment bottom sheet
- feedback button

### Time scrubber

Similar mental model to vedur.is:

- today + next days
- hour ticks, maybe every 1h or 3h depending on data size
- drag/scroll/tap time
- map recolors immediately

### Click/tap detail

When a user taps a bad point/segment:

- status and reason
- wind
- gust only if gust > wind
- precipitation
- temperature
- threshold that triggered status
- forecast time
- met.no forecast point
- link to external forecast if useful
- feedback CTA

Example:

`Varúð fyrir hjólhýsi`

`Vindur 14.2 m/s yfir mörkum 13 m/s`

`Hviður 18.6 m/s`

`Úrkoma 0.2 mm/klst`

`Spápunktur met.no: 64.28, -21.84`

## Implementation phases

### Phase A - Research and data design

Goal: choose the safest data source shape before coding.

Tasks:

- confirm whether to use road-sample points first, not dense full-country grid
- inspect existing provider/types and route weather evaluator
- identify reusable threshold/evaluation helper
- decide snapshot storage:
  - in-memory dev snapshot
  - file cache
  - Supabase table
  - Vercel KV/blob or similar, only if already available
- write provider policy note:
  - how many met.no calls per snapshot
  - cache lifetime
  - User-Agent / BFF
  - attribution
  - public beta limits

Stop after Phase A with Codex review.

### Phase B - Internal snapshot generator

Goal: generate a small safe snapshot for development.

Scope:

- start with a limited curated set of road/weather points, not all Iceland
- maybe 50-150 points max initially
- server-side only
- cache every coordinate result
- evaluate statuses for available forecast times
- no public route yet unless gated

Do not start with thousands of points.

Stop after Phase B with test results and sample snapshot.

### Phase C - Internal map UI

Goal: visual model-lab map for Stebbi.

Scope:

- route/page behind admin/dev/beta flag
- map renders snapshot points or segments
- time scrubber
- mode selector
- click detail
- no public marketing copy yet

Stop after Phase C with localhost QA.

### Phase D - Feedback layer

Goal: collect useful human correction.

Scope:

- feedback CTA on selected point/segment
- structured payload
- safe storage plan before writing any DB changes
- no personal data required
- optional email/contact field only if Stebbi approves

If Supabase table is needed, create SQL plan for review before migration.

### Phase E - Public beta

Goal: publish responsibly.

Prerequisites:

- data pipeline respects met.no caching/traffic rules
- attribution is clear
- public copy is humble and beta-framed
- feedback loop works
- feature flag / kill switch exists
- no private user trip data is exposed

## Important non-goals for first pass

- Do not fetch every possible point in Iceland.
- Do not call met.no from the browser for the map.
- Do not claim official road safety.
- Do not pretend this is Veðurstofan, Vegagerðin, Yr or met.no.
- Do not add Supabase storage without separate SQL/RLS review.
- Do not build a beautiful public launch page before the model-lab map works.

## Suggested message for Claude Code

```text
Við skulum bæta við nýjum stórum áfanga fyrir todo-067: Ferðaskilyrðakort Íslands.

Stebbi vill byrja strax að byggja þetta því það er nauðsynlegt til að smíða og sannreyna veðurlíkanið, og síðar opna þetta almenningi til að auglýsa Teskeiðina og fá input frá veðurnördum.

Mikilvægt: núverandi route-weather flæði sækir ekki allt Ísland. Það sækir bara met.no forecast fyrir sample punkta meðfram leiðinni. Landskortið þarf því nýjan snapshot/data pipeline.

Gerðu ekki kóða strax nema Stebbi gefi sérstakt framkvæmdarleyfi. Byrjaðu á Phase A plan/rannsókn:

1. Staðfestu núverandi met.no notkun:
   - route flow notar max 15 veðurpunkta
   - fetchForecast notar locationforecast point forecast
   - cache og User-Agent eru í server/BFF lagi

2. Leggðu til data architecture fyrir Ferðaskilyrðakort:
   - ekki browser calls í met.no
   - server-side snapshot/cache
   - road-aware sample points fyrst, ekki dense grid yfir allt land
   - reuse á sama deterministic threshold engine og route weather
   - validTimes/time scrubber
   - modes: bíll, hjólhýsi, hestakerra

3. Berðu saman tvær leiðir:
   A) road-aware curated sample points / road segments
   B) gridded forecast data / THREDDS eða sambærilegri bulk-leið

   Mælt er með A fyrst fyrir MVP/model-lab, en skoða B sem research fyrir síðar ef við viljum alvöru landsgridded overlay.

4. Settu inn met.no policy constraints:
   - identify app
   - cache
   - respect Expires/If-Modified-Since
   - spread traffic
   - avoid direct browser calls
   - avoid overload
   - attribution

5. Skilgreindu Phase A-E:
   A. Research/data design
   B. Internal snapshot generator
   C. Internal map UI
   D. Feedback layer
   E. Public beta

6. Public beta þarf:
   - skýrt beta orðalag
   - "ekki umferðar- eða farartrygging"
   - data timestamp og forecast valid time
   - feedback CTA fyrir veðurnörda
   - feature flag / kill switch
   - engin private user trip data

7. Stoppaðu eftir Phase A með handoff fyrir Codex review.

Ekki framkvæma SQL, migration, production config, cron, deploy, provider breytingar eða public rollout í þessum áfanga.
```

## Localhost checks for Stebbi

For Phase A there is no user-visible localhost change yet. Claude Code should still include this section and say:

1. No localhost UI expected in Phase A.
2. Verify current `/auth-mvp/vedrid` route flow still works if any code is inspected only.
3. For Phase C later, localhost checks must include:
   - internal map page loads behind flag
   - map shows Iceland road/forecast points
   - time scrubber changes colors
   - mode selector changes thresholds
   - tapping a point shows wind/gust/precip/temp/threshold
   - feedback CTA opens
   - mobile 360-430px no overflow

## Sources checked

- met.no Terms of Service: https://api.met.no/doc/TermsOfService
- met.no Locationforecast documentation: https://api.met.no/weatherapi/locationforecast/2.0/documentation
- met.no documentation index including gridded forecast/THREDDS reference: https://api.met.no/doc/

## Uncertainty / needs confirmation

- I have not researched the exact THREDDS/gridded data access path deeply enough to recommend it for implementation yet.
- I have not selected where snapshots should be stored. That depends on existing infra and whether public beta needs persistence, cron or only on-demand generation.
- Public feedback storage likely needs Supabase schema/RLS review if it stores anything beyond transient messages.

