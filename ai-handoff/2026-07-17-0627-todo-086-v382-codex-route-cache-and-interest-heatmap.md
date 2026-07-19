# 2026-07-17 06:27 — TODO-086 v382 — Route cache + Teskeið interest heatmap

Created: 2026-07-17 06:27  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Mode: product/architecture planning handoff only, no product code changes

## Short Summary

This handoff captures Stebbi’s idea of turning route usage into a smarter Teskeið signal: not just “how many people searched Reykjavík → Akureyri”, but a privacy-first, aggregate “where is the country thinking of going?” layer.

The core idea:

- Build a shared route cache for Google route calls so repeated route calculations do not always hit Google.
- Separately build corridor-based route-interest analytics.
- Aggregate by coarse areas and route corridors, not exact home addresses or raw lat/lon.
- Later use this to power a “Teskeið heatmap” / popular routes / “landinn er að spá í...” overview.

This should not be mixed into the current dense route-geometry fix. It is a later product/data phase.

## Why This Matters

Many users will not search exactly the same pair:

- one user enters `Reykjavík → Akureyri`
- another enters their home in Kópavogur → a hotel in Akureyri
- another enters Mosfellsbær → Akureyri
- another enters Reykjavík → Húsavík but follows mostly the same northern corridor

Exact route-pair counting misses the real signal. The better product signal is route intent by corridor:

- capital area → north via Holtavörðuheiði
- south coast → east fjords / Öxi decision point
- Reykjavík → Westfjords via Route 60 vs. via Hólmavík
- Reykjavík area → summer house corridors
- east/south travelers choosing whether to go over Öxi

This becomes a kind of Teskeið “interest heatmap”: not live traffic, but “where people are currently checking conditions and considering travel.”

## Current Code / Existing Base

Relevant existing pieces:

- `sql/71_teskeid_usage_events.sql`
- `lib/teskeid/usage.server.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/(admin)/admin/page.tsx`
- `app/api/admin/teskeid-usage/route.ts`

Important observations:

- Usage events already exist and are service-role only.
- `teskeid_usage_events` intentionally stores no raw emails, names, addresses, lat/lon, place IDs, polylines, or forecast payloads.
- `sanitizeUsageMetadata()` blocks metadata keys matching `email|name|address|lat|lon|place|polyline|forecast|secret|token`.
- `routePairFingerprint()` currently HMACs origin/destination at 3-decimal coordinate precision, roughly 100 m.

This is a good privacy posture. For a public/product heatmap, we should go even more aggregate than `routePairFingerprint`.

## External Constraints / Google Notes

Relevant Google docs to review before implementation:

- Pricing: `https://developers.google.com/maps/billing-and-pricing/pricing`
- Routes billing: `https://developers.google.com/maps/documentation/routes/usage-and-billing`
- Routes policies / attribution / caching constraints: `https://developers.google.com/maps/documentation/routes/policies`

Important planning assumptions:

- Google Routes requests are billable per query.
- Google Maps Dynamic Maps loads are also billable after free quota.
- Google restricts caching of most Routes API content; Place IDs are explicitly more cache-friendly.
- Do **not** treat Google route geometry/durations as permanently ownable data.
- Before shipping any DB-backed Google route cache, Claude Code should verify exact current Google service terms and document:
  - what can be cached
  - for how long
  - what must expire
  - what attribution/display constraints apply

## Concept A — Shared Route Cache

### Goal

Avoid repeated Google Routes calls for the same effective route request.

This cache is for performance/cost control, not user analytics.

### Suggested model

Create a server-only cache around route provider calls:

- cache key derived from:
  - provider: `google`
  - origin canonical identity
  - destination canonical identity
  - route mode / routing preference
  - curated via-points
  - route labels
  - route geometry version
  - whether high-quality provider-matching geometry is requested

Potential table later:

```sql
weather_route_cache (
  cache_key text primary key,
  provider text not null,
  request_kind text not null, -- route_options | route_geometry | curated_route
  request_hash text not null,
  response_json jsonb not null,
  derived_summary jsonb not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
)
```

### Cache content rules

Permanent / product-owned:

- curated route definitions
- via-points such as Hólmavík/Reyðarfjörður
- route caution labels and product text
- coarse corridor definitions

TTL-bound / Google-derived:

- route geometry
- route options
- distance and duration
- Google descriptions

Potentially very short TTL:

- live traffic-aware duration

### Important

Do not store raw private origin/destination user-entered text in cache rows.

Prefer canonical request keys:

- Google Place ID when available and allowed
- rounded/coarsened area key when user supplied private coordinates
- curated place IDs for common places

## Concept B — Corridor Interest Analytics

### Goal

Answer product questions like:

- “Hvaða leiðir eru mest skoðaðar núna?”
- “Hvaða vegkaflar eru fólk að spá í áður en það leggur af stað?”
- “Er óvenjulegur áhugi á Vestfjörðum, Öxi, Holtavörðuheiði, Hellisheiði?”
- “Hvaða leiðir ættum við að forreikna/cache-a?”

### Do not count exact routes

Do not build this around exact strings like:

```text
Reykjavík -> Akureyri
```

Instead, derive:

```text
origin_area -> destination_area -> corridor_signature
```

Examples:

```text
capital_area -> north_iceland -> ring_road_north_holtavorduheidi
south_east -> east_iceland -> oxi_or_fjords_decision
capital_area -> westfjords_northwest -> route60_vs_holmavik
```

## Privacy-First Normalization

### Never store for heatmap

- exact user address
- raw typed input
- raw lat/lon
- exact polyline
- exact private home-to-destination route
- email/name
- user-level public heatmap rows

### Allowed aggregate inputs

Use coarse and product-safe values:

- `origin_area_key`
- `destination_area_key`
- `corridor_key`
- `route_caution_ids`
- `curated_route_labels`
- `duration_bucket`
- `distance_bucket`
- `created_day` / `created_hour_bucket`

### Area buckets

Start simple:

- known municipalities / regions where possible
- capital area as one bucket
- major destination buckets:
  - Akureyri / North
  - Ísafjörður / Westfjords
  - South Coast
  - Eastfjords
  - Snæfellsnes
  - Highlands later

Avoid too-fine geohash in v1. 100 m route-pair fingerprint is useful for admin dedupe, but too precise for a product heatmap.

## Corridor Signature

Route corridor signature should be derived from route geometry and known checkpoints/corridors.

Potential inputs:

- route passes near known corridor checkpoints:
  - Hellisheiði
  - Þrengsli
  - Holtavörðuheiði
  - Hólmavík
  - Dynjandisheiði / Route 60 caution area
  - Öxi / Road 939
  - Reyðarfjörður/firðir alternative
- route caution ids:
  - `route60_trailer_caution`
  - `oxi_trailer_caution`
  - future known risky segments
- provider stations along route:
  - Veðurstofan station ids aggregated by corridor
  - future Vegagerðin point ids aggregated by corridor

Signature example:

```ts
{
  originAreaKey: 'capital_area',
  destinationAreaKey: 'westfjords_northwest',
  corridorKey: 'westfjords_via_route60',
  cautionIds: ['westfjords_route60_trailer_caution'],
  curatedLabels: ['FASTEST_GOOGLE'],
}
```

## Suggested Aggregate Table

Potential future migration, not now:

```sql
weather_route_interest_daily (
  day date not null,
  hour_bucket smallint,
  origin_area_key text not null,
  destination_area_key text not null,
  corridor_key text not null,
  route_caution_ids text[] not null default '{}',
  curated_labels text[] not null default '{}',
  search_count integer not null default 0,
  distinct_route_pair_count integer not null default 0,
  public_search_count integer not null default 0,
  authenticated_search_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  primary key (day, hour_bucket, origin_area_key, destination_area_key, corridor_key)
)
```

Alternative: keep append-only events private and compute aggregate materialized views. But product heatmap should read only aggregate rows, never raw events.

RLS/grants:

- raw events: service-role only
- aggregate heatmap: likely read-only API endpoint, not direct anon table access
- admin detail: admin-only endpoint

## How This Feeds Product

### Overview page

The future all-Iceland overview can show:

- weather/provider state
- Veðurstofan/Vegagerðin points
- user pulse activity
- popular route corridors
- “Mest skoðað núna”
- “Margir að spá í Vestfirði”
- “Óvenjulega mikið skoðað: Öxi / Austfirðir”

### Popular route shortcuts

Instead of hardcoding only:

```text
Reykjavík -> Akureyri
```

show:

```text
Höfuðborgarsvæðið -> Norðurland
Algeng leið: Hringvegur um Holtavörðuheiði
```

When opened, choose sensible defaults:

- origin: Reykjavík / capital-area center or user-selected actual origin
- destination: Akureyri or chosen regional anchor
- route: cached/curated corridor when available

### Cache warming

Use aggregate signals to decide which routes to warm:

- if corridor is trending
- if weather is bad on that corridor
- if many users have searched it recently
- if it is a known holiday/travel period

Keep warming controlled:

- max N route cache refreshes per hour
- do not warm every exact private route
- warm corridor anchor routes only

## Suggested Phases

### Phase H0 — Design only / no DB

Create a written contract:

- area keys
- corridor keys
- what is considered private
- what can be shown publicly
- how route cache differs from route analytics
- Google compliance checkpoint

### Phase H1 — Shared route cache wrapper

Implement server-side cache around Google route calls.

Scope:

- no public heatmap yet
- no new UX yet
- cache hit/miss logging for admin only
- TTL and invalidation explicit

Tests:

- cache key stable for same canonical request
- curated via-points change cache key
- private raw address does not enter key/metadata
- expired cache is ignored

### Phase H2 — Corridor classifier

Create pure function:

```ts
classifyRouteCorridor(route, origin, destination, cautions): CorridorClassification
```

Tests:

- Reykjavík/Kópavogur/Mosfellsbær -> Akureyri buckets into same broad corridor
- Höfn -> Egilsstaðir via Öxi gets `oxi`
- Höfn -> Egilsstaðir via Reyðarfjörður gets `eastfjords_fjords`
- Ísafjörður routes split Route 60 vs Hólmavík where appropriate
- raw lat/lon does not leak out

### Phase H3 — Aggregate route interest

Record only aggregate-safe fields.

Can be built either:

- directly increment aggregate table
- or write sanitized event + scheduled aggregate job

I lean direct aggregate increment for v1 to avoid retaining too much raw route-intent data.

### Phase H4 — Admin-only insight

Add admin panel:

- top corridors today/7d/30d
- cache hit/miss
- routes worth warming
- no user-level drilldown

### Phase H5 — Public/Product heatmap

Only after privacy and signal quality are proven:

- show broad route interest
- no low-count buckets
- suppress cells under k-anonymity threshold, e.g. fewer than 5 or 10 searches
- never show “one person is going from X to Y”

## Important Guardrails

1. **No private route replay.**  
   Do not let Stebbi or admins reconstruct exact home-to-destination searches from the heatmap layer.

2. **K-anonymity threshold for public UI.**  
   Public heatmap should suppress low-count buckets.

3. **Separate operational cache from analytics.**  
   Cache is for avoiding repeated Google calls. Analytics is for product insight. Do not overload one table to do both.

4. **Google compliance check before route cache.**  
   Route geometry/duration from Google must be TTL-bound according to current Google terms.

5. **No route cache for every keystroke.**  
   Only cache after user actually requests route calculation.

6. **No Places expansion for overview v1.**  
   Campsites, rivers, golf courses and hiking routes should be curated/open-data first. Google Places can become expensive and has its own caching/attribution rules.

## Relationship To Current Dense Geometry Work

Do not block B0.4 route geometry fidelity on this heatmap idea.

Order should be:

1. B0.4 dense/high-quality provider matching.
2. B0.5 reusable provider preview shell.
3. B1 localhost validation.
4. H0/H1 route cache design and wrapper.
5. H2/H3 corridor analytics.
6. Overview page once cache/analytics contracts are clear.

## Recommended Next Message To Claude Code

Claude Code, this is not an implementation request yet. Please use it as product/architecture context.

When Stebbi decides to start this track, begin with H0:

1. Review existing usage system:
   - `sql/71_teskeid_usage_events.sql`
   - `lib/teskeid/usage.server.ts`
   - admin usage endpoints
2. Propose a route-cache contract and a corridor-interest contract.
3. Explicitly separate:
   - Google route cache
   - privacy-safe route interest aggregates
   - future public heatmap
4. Include Google terms/caching compliance notes.
5. Do not write SQL or code until Stebbi gives explicit implementation permission.

## Localhost Checks For Stebbi

No localhost checks apply yet because this is product/architecture planning only.

When H1/H2 implementation eventually exists, Stebbi should test:

1. Run the same route twice.
   - Expected: second request can use cache if TTL/inputs allow.
2. Try private home-like origin to Akureyri.
   - Expected: no raw address/lat/lon appears in client, admin UI, logs, or aggregate output.
3. Try Reykjavík, Kópavogur, and Mosfellsbær to Akureyri.
   - Expected: all contribute to same broad north corridor signal.
4. Try Höfn -> Egilsstaðir via Öxi/firðir.
   - Expected: corridor classifier distinguishes risky Öxi vs firðir alternative.
5. Public heatmap, when it exists:
   - Expected: hides low-count/identifiable corridors.
   - Expected: shows broad route interest only.

No Supabase migration, production data, Vercel, billing, or deployment action belongs to this planning handoff.

## Open Questions

1. Should corridor analytics retain any per-user link at all?
   - Recommendation: no for public heatmap; admin-only aggregate is enough.
2. Should aggregate route-interest be hourly or daily first?
   - Recommendation: hourly buckets for “núna” product feel, but public UI should smooth low counts.
3. Should route cache be DB-backed immediately?
   - Recommendation: yes only when Google compliance/TTL is explicit; otherwise start with in-memory/request-level only.
4. Should popular route labels be automatically generated?
   - Recommendation: generate candidates automatically, but product-copy labels should be curated by Stebbi before public display.
