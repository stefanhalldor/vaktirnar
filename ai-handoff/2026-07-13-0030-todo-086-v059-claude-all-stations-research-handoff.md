# TODO 086 - v059 Claude handoff: all-stations research for Codex

Created: 2026-07-13 00:30
Timezone: Atlantic/Reykjavik
Author: Claude
Type: Research handoff
Input: v058 Codex direction (Stebbi wants all Veðurstofan stations, not just 29-station curated seed)

## Context

The just-released Phase 2B0 (`a662362`) shows 29 hand-picked stations from
`lib/weather/providers/vedurstofanStations.ts`. Stebbi's requirement is to
include ALL stations from the official Veðurstofan source, with a
mapping/verification UI. Codex v058 outlined Phase 2B1 (authoritative registry)
and asked 7 questions before implementation. This handoff provides the known
facts and asks Codex to answer the remaining empirical questions via live probe.

## What we know

### Current station source

`lib/weather/providers/vedurstofanStations.ts` — `VEDURSTOFAN_STATIONS` array.
29 stations. Hand-picked to cover routes 1, 41, 48, 51 and common ring-road
sections. All have `coordinatesVerified: true`.

Current fields per station:
```ts
{
  stationId: string        // numeric string, e.g. "31392"
  stationName: string      // human name, e.g. "Hellisheiði"
  lat: number              // WGS84, negative lon for Iceland
  lon: number
  owner: string            // "Veðurstofa Íslands" | "Vegagerðin"
  coordinatesVerified: boolean
}
```

### ID pattern observation (not confirmed)

Looking at the 29 stations:
- 5-digit IDs starting with `3xxxx` (e.g. 31475, 31363, 31579...): all have `owner: 'Vegagerðin'`
- 3-4 digit IDs (e.g. 990, 571, 6300, 4323...): all have `owner: 'Veðurstofa Íslands'`

This may reflect the official numbering convention, but has NOT been confirmed
against official documentation.

### Forecast XML service

Endpoint:
```
https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=is&view=xml&time=3h&params=F;D;T;R;W&ids={id1};{id2}
```

- Accepts any station ID, not just curated ones
- Returns `valid="1"` if the station exists and has data, `valid="0"` otherwise
- Returns `<name>` from the service itself (not from our local list)
- Does NOT include coordinates
- Does NOT include owner/source metadata
- `type=forec` = forecast rows (3h steps). This is NOT live observations.

### Fetch gate in server code

`lib/weather/providers/vedurstofan.server.ts` currently rejects any station ID
not in `VERIFIED_STATION_IDS` (the 29-station set). This will need to be
loosened for an all-stations registry.

### Known station page URL pattern

Individual station pages at:
```
https://www.vedur.is/vedur/stodvar/?s={slug}
```
These include coordinates (but display longitude as positive — must negate for
WGS84).

## Research questions for Codex

These are the 7 questions from v058, annotated with what we already know.

### Q1: Official machine-readable station registry

**What we need:** A URL or service that returns ALL stations (Veðurstofan +
Vegagerðin) in a structured format (XML, JSON, CSV).

**Leads to investigate:**
1. `https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml&ids=`
   Does `type=obs` (observations) list or return station metadata? Try a request
   with no IDs or with a wildcard to see if a station list is returned.
2. `https://api.vedur.is/` — Is there a REST API in addition to the XML service?
3. `https://www.vedur.is/vedur/stodvar/` — The human-readable station list page.
   Does it embed structured data (JSON-LD, data attributes, an API call visible
   in browser devtools)?
4. `https://xmlweather.vedur.is/` with no params — does it return a WSDL or
   capability document?

**What Codex should report:**
- The URL (if any) that returns a machine-readable complete station list
- Whether that list includes coordinates and owner/source metadata
- Approximate total station count

### Q2: Coordinates in the official source

**What we know:** The individual station pages at `vedur.is/vedur/stodvar/?s=...`
have coordinates, but these require per-station scraping. The XML forecast
service does NOT return coordinates.

**What Codex should check:** Does the machine-readable source from Q1 include
lat/lon per station? If not, what is the path to get coordinates for all stations
(one-time scrape, official GeoJSON, another API endpoint)?

### Q3: Veðurstofan vs Vegagerðin ownership in the source

**What we know:** The 29-station seed distinguishes owner manually. The XML
forecast service does not include owner in its response.

**What Codex should check:** Does the official station list (Q1) include an owner
or source field? If not, can ownership be inferred from ID ranges (see pattern
note above)?

### Q4: Which station IDs return `type=forec` data?

**What we need:** The total set of station IDs that return `valid="1"` from the
forecast service.

**Suggested probe approach (for Codex to run from Node or curl):**

```
# Try requesting a batch of "round number" IDs to find active stations:
# Veðurstofa Íslands IDs seem to be 3-4 digit numbers (< 10000)
# Vegagerðin IDs seem to start with 3xxxx (31xxx, 32xxx, 35xxx, 36xxx)

# Try probing known ranges in batches of 10:
https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=is&view=xml&time=3h&params=F;D;T;R;W&ids=1;2;3;4;5;6;7;8;9;10
# ...then 11-20, 100-109, 1000-1009, 31000-31009, 32000-32009, etc.
# Record which IDs return valid="1" and what <name> they return.
```

**Alternatively:** if Q1 produces a complete station list, just probe all those
IDs directly.

### Q5: Current observations / gust source

**What we know:** The forecast service (`type=forec`) provides 3h forecast steps.
It does NOT provide live observations or gusts. `FG`/`FX` params are parsed but
empty in live probes.

**Leads to investigate:**
1. `type=obs` in the XML service — does this return current observations?
   ```
   https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml&ids=31392;990
   ```
2. Does the response include `FG`/`FX` (gusts) for `type=obs`?
3. Any other official endpoint that provides the live gust data shown on umferðin.is?

**What Codex should report:** The endpoint URL, the available params, and sample
response shape for any live observation/gust source found.

### Q6: Where should the registry live? (Design question)

Options and tradeoffs for Codex to evaluate:

| Option | Pros | Cons |
|---|---|---|
| TypeScript array (like current) | Zero infra, fast, type-safe | Manual updates, no collaborative editing, can't query |
| Generated JSON file (checked in) | Can be regenerated from source, diffs visible in git | Not queryable without loading all, no per-user annotation |
| Supabase table | Queryable, collaborative, supports per-row status/notes | Requires migration + approval, admin UI needed |
| Hybrid: generated JSON + Supabase annotations | Authoritative source stays outside DB, only human notes in DB | Two sources to sync |

Given Stebbi's "collaborative mapping/verification" goal, a Supabase table or
hybrid is likely the right answer. But Codex should recommend based on:
- How often the official source is expected to change (monthly? yearly?)
- Whether the mapping/verification notes need to survive source updates
- Whether we want to query by `mappingStatus` or `owner` without loading all stations

**Codex should state a recommendation and rationale**, not just list options.

### Q7: Unmapped/missing-coordinates stations in the UI

The current station explorer map requires lat/lon to place a marker. Stations
without confirmed coordinates cannot be placed on the map.

**What Codex should design:**
- A list panel that shows ALL stations regardless of coordinate status
- A map that only plots stations with coordinates
- Clear visual distinction: verified coordinates vs source-provided vs missing
- A "needs mapping" section or filter for stations without confirmed coordinates

This is a UI design question, not a research question. Codex can include a brief
sketch or leave it for a future implementation handoff.

## Current implementation files (for reference)

| File | Purpose |
|---|---|
| `lib/weather/providers/vedurstofanStations.ts` | 29-station curated array, haversine mapping |
| `lib/weather/providers/vedurstofan.server.ts` | Fetch/cache wrapper, rejects non-curated IDs |
| `lib/weather/providers/vedurstofanXml.ts` | XML parser for `type=forec` response |
| `lib/weather/providers/vedurstofanStationExplorer.ts` | `buildStationExplorerResponse()` helper |
| `app/api/teskeid/weather/vedurstofan/stations/route.ts` | API route for elta-vedrid page |
| `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx` | Map + list + detail UI |

## What Codex should deliver

A v060 handoff with:

1. Answers to Q1-Q5 (empirical, based on live probe)
2. Recommendation for Q6 (registry storage)
3. Brief sketch for Q7 (UI handling of missing coordinates)
4. Recommended Phase 2B1 scope: what changes are needed and in what order
5. Any blockers or surprises found during probing

## What is NOT needed yet

- Implementation changes (this is research only)
- SQL migration drafts
- UI mockups (a brief text sketch for Q7 is enough)
- Changes to the just-released 29-station explorer (it stays as-is behind the flag)
