# TODO 086 - v060 Codex all-stations research response

Created: 2026-07-13 06:43  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Input reviewed: `ai-handoff/2026-07-13-0030-todo-086-v059-claude-all-stations-research-handoff.md`  
Mode: research/review only, no implementation changes except this handoff file

## Summary

Stebbi's concern is correct: the current 29-station explorer is only a curated seed.

Official Veðurstofan station pages expose a much larger station set. The simple official station list page reports **280 total stations** and lists each station with links for observations, forecasts, charts, and station info:

- Source: `https://www.vedur.is/vedur/stodvar/?t=3`
- Observed on 2026-07-13

The immediate next phase should not range-scan random station IDs. It should build an all-stations registry from the official station list and each station's official info page.

## Key Findings

### 1. Official all-stations seed exists as HTML, not confirmed JSON/CSV

I did not find or confirm a JSON/CSV machine-readable registry in this pass.

However, the official simple station list is structured enough to scrape/generate from:

```text
https://www.vedur.is/vedur/stodvar/?t=3
```

It lists stations with short type markers such as `(sj)`, `(sk)`, `(sm)` and A/S/R/U links. It also states total count: `280`.

Recommendation: treat this page as the Phase 2B1 authoritative seed until a better official machine-readable endpoint is found. Generate a checked-in registry from it, with source URL and generated timestamp.

### 2. Coordinates, owner, station ID, WMO, elevation, and more are on station info pages

Example official station info page:

```text
https://www.vedur.is/vedur/stodvar/?s=hellh
```

The Hellisheiði page includes:

- name: Hellisheiði
- type: Sjálfvirk veðurathugunarstöð
- station number: `31392`
- WMO number: `4836`
- abbreviation: `hellh`
- forecast area: Suðurland
- coordinates: both DMS-ish and decimal `(64,0188, 21,3424)`
- elevation: `360.0 m.y.s.`
- observation start year: `1992`
- station owner: Vegagerðin

The decimal longitude is shown as a positive Icelandic west-longitude value, so app WGS84 longitude should be negative. This matches earlier local convention.

### 3. Do not infer owner from station ID range

v059 noted that 3xxxx IDs in the 29-station seed look like Vegagerðin and 3-4 digit IDs look like Veðurstofa Íslands.

Do not build on that inference. The official station info page includes `Eigandi stöðvar`, so importer should scrape/store actual owner from the official page whenever possible.

### 4. `type=obs` confirms current observations and gust fields

Read-only probe:

```text
https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml&ids=31392%3B990
```

Response shape confirmed:

- root: `<observations>`
- station nodes: `<station id="..." valid="1">`
- fields observed: `name`, `time`, `err`, `link`, `F`, `D`, `FX`, `FG`, `T`, `W`, `V`, `R`
- Hellisheiði sample returned `F=9`, `D=SSA`, `FX=9`, `FG=12`, `T=8,3`
- Keflavíkurflugvöllur sample returned `F=9`, `D=S`, `FX=9`, `FG=13`, `T=10,1`, `W=Lítils háttar súld`

This strongly suggests `type=obs` is the correct official source family for the current wind/gust values Stebbi expects from the umferðin.is-style display.

### 5. `type=obs` with no IDs does not return the complete station list

Read-only probe:

```text
https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml
```

Response:

```xml
<observations><error>Either parameter 'grp' or 'ids' must be supplied</error></observations>
```

So `type=obs` is useful after we have station IDs, but it is not by itself the all-stations registry endpoint unless we also discover and intentionally use `grp` values.

## Answers To v059 Questions

### Q1: Official machine-readable station registry

No confirmed JSON/CSV/XML all-station registry found.

Best confirmed official source: `https://www.vedur.is/vedur/stodvar/?t=3`

It is HTML, but official and structured enough to scrape. It states 280 total stations.

### Q2: Coordinates in the official source

The simple list does not show coordinates.

Station info pages do show coordinates, station number, WMO number, abbreviation, forecast area, elevation, start year, and owner. Import path should be:

1. scrape station list page for all station info links
2. fetch each station info page
3. parse metadata
4. store coordinates as source-provided
5. mark `coordinatesVerified=false` until Stebbi/manual verification happens

### Q3: Veðurstofan vs Vegagerðin ownership

Use official `Eigandi stöðvar` from each station info page.

Do not infer from ID ranges except as fallback when owner is missing and mark that fallback as uncertain.

### Q4: Which station IDs return `type=forec` data?

Not fully answered yet because I did not run a broad probe of all 280 stations.

Recommended method:

1. derive station IDs from the 280 official station info pages
2. batch probe those exact IDs against `type=forec`
3. store per station:
   - `forecastValid`
   - `forecastName`
   - `forecastLastCheckedAt`
   - `forecastErr`

Avoid v059's broad range-scan approach. It is noisier, less respectful to the external service, and unnecessary now that the official list provides the station universe.

### Q5: Current observations / gust source

Confirmed:

```text
https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml&ids={id1};{id2}
```

This returns current observations and includes `FX` and `FG` for the tested stations.

Follow-up needed:

- confirm exact meanings of `FX` and `FG` from official docs if possible
- build a parser separate from `type=forec`
- do not mix forecast rows and observations into one row type
- cache observations separately from forecasts

### Q6: Where should the registry live?

Recommended: hybrid, in two phases.

Phase 2B1:

- checked-in generated JSON/TS registry derived from the official station pages
- no Supabase migration yet
- stores official/source metadata and data availability
- easy to diff/review in Git
- safe behind feature flag

Phase 2B2:

- Supabase table for human annotations only:
  - mapping status
  - Stebbi verification notes
  - overrides/corrections
  - hidden/duplicate/ambiguous flags
- requires separate schema plan, RLS review, and explicit migration approval

This avoids starting with a database-heavy solution before we know the exact station data shape, while still supporting Stebbi's collaborative mapping goal.

### Q7: UI handling of unmapped/missing-coordinate stations

Design direction:

- Station list is the source of truth and should show all 280 stations.
- Map plots only stations with coordinates.
- Stations without coordinates remain visible in a "Vantar hnit" / "Needs mapping" section.
- Coordinate status should be visible:
  - `verified`
  - `source-provided`
  - `needs-verification`
  - `missing-coordinates`
  - `ambiguous/duplicate`
- Detail card should show every known official field:
  - station ID
  - name
  - type marker / type text
  - owner
  - WMO number
  - abbreviation
  - forecast area
  - coordinates
  - elevation
  - start year
  - official links
  - forecast availability
  - observation/gust availability

## Recommended Phase 2B1 Scope

Keep it small and reviewable:

1. Add a generator/research script that fetches/parses the official station list and station info pages.
2. Produce a checked-in generated registry file with all official stations.
3. Add static tests for:
   - total station count is 280 unless source changes
   - Hellisheiði parses station ID `31392`, owner `Vegagerðin`, coordinates, and WMO `4836`
   - longitude is stored as negative
   - all records have a source URL and mapping status
4. Update Elta veðrið API to return all registry stations, not only the curated 29.
5. Keep the existing 29-station set as an optional `routeSeed` or `curatedRouteRelevant` tag, not the only dataset.
6. Add observation parser/fetcher as a separate next step, or include it only if Phase 2B1 remains small enough.

## Code Implications

Current gate that must change:

- `lib/weather/providers/vedurstofan.server.ts` currently rejects IDs not in the 29-station `VERIFIED_STATION_IDS` set.

That was correct for Phase 1C safety, but all-stations mode needs a new allowlist based on the generated registry, with per-station data availability. Do not simply remove validation and accept arbitrary user-supplied IDs.

Current parser split:

- Keep `lib/weather/providers/vedurstofanXml.ts` for `type=forec`.
- Add a separate parser for `type=obs`, because observations have `time` and no forecast rows.

## Risk Notes

- Scraping official HTML is more brittle than a formal API. Mitigate with generator tests and source snapshots.
- The official list count can change. A test expecting exactly 280 should fail loudly and force review, not silently discard new stations.
- Observation data should not be used in route scoring until thresholds and semantics are explicitly designed.
- A Supabase annotation table is probably right eventually, but not before a separate RLS/migration plan.

## Localhost Checks For Stebbi

Research-only handoff; no code was changed here.

For Phase 2B1 implementation later, Stebbi should check:

1. `/auth-mvp/vedrid/elta-vedrid` shows close to 280 stations, not 29.
2. The page has clear filters for all stations, verified, source-provided, and needs mapping.
3. Stations without usable coordinates still appear in the list.
4. Detail card for Hellisheiði shows station ID `31392`, owner `Vegagerðin`, hnit, hæð, WMO, and official links.
5. Observation values and forecast rows are clearly separated if both are shown.
6. Existing `/auth-mvp/vedrid` route-weather flow remains unchanged.

## Sources / Probes Used

- Official station list: `https://www.vedur.is/vedur/stodvar/?t=3`
- Official Hellisheiði info page: `https://www.vedur.is/vedur/stodvar/?s=hellh`
- Read-only XML obs probe: `https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml&ids=31392%3B990`
- Read-only XML obs no-ID probe: `https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml`

## Recommendation For Claude Code

Do not implement Phase 2B1 by range-scanning IDs.

Use the official station list as the registry seed, parse each station info page, and tag everything with source/mapping status. Then the UI can become the collaborative mapping tool Stebbi wants instead of pretending the current 29 curated points are complete.

