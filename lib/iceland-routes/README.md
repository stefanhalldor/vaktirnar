# Iceland Routes

Reusable route-domain landing zone for Teskeid's Iceland-specific road and
route intelligence.

The first consumer is Weather, but this folder should not become Weather-only
implementation detail. Put shared route concepts here when route knowledge is
useful across providers, screens, or future Teskeid products.

## Current Scope

- Type contracts for canonical Iceland route segments, nodes, route families,
  safety flags, curated alternatives, route cautions, and route-intelligence
  checks.
- Draft pure resolver for static provider-neutral route intelligence.
- Open-data source metadata for Road Intelligence basemaps, overlays,
  attribution, CORS status, and proxy-readiness.
- No production routing behavior yet.
- No Google Routes replacement yet.
- No Supabase persistence yet.
- Provider-neutral routing contract for future Google and Teskeid adapters.
- Server-only shadow runner behind `TESKEID_ROUTING_SHADOW_ENABLED` (off unless
  explicitly set to `true`), scheduled after the primary travel response.
- Automated road-graph core with directed edges, topology repair,
  multi-component endpoint matching, priority-queue routing and surface profiles.
- Read-only Vegagerdin ArcGIS import boundary. It performs no persistence and
  is not wired to a user request path.
- A localhost-only route lab at `/preview/teskeid-routes` can calculate any
  Icelandic place pair resolved by the existing place search, request bounded
  alternative routes, audit surface composition, attach cached current
  Vegagerðin observations, and preview browser-GPS movement. It is explicitly
  experimental and is production-closed unless `TESKEID_ROUTE_LAB_ENABLED=true`.
- A single road-graph candidate can be appended after the existing Google route
  options with `TESKEID_ROUTE_CANDIDATE_ENABLED=true` plus per-user
  `feature_access` key `teskeid-routing-v1`. Google remains first and
  default. The candidate has an eight-second server budget and disappears on
  timeout, source failure, no route, or flag-off; those states never fail the
  Google result. The same helper recalculates a selected candidate for final
  travel-weather sampling so preview and submit cannot use different rules.

## Shadow Routing Safety

- Shadow routing must run outside the primary response path.
- A shadow failure must never alter, delay, or fail the current route result.
- Do not persist raw provider payloads, exact addresses, or user route history.
- Comparison telemetry must be provider-neutral and segment-level before it is
  introduced; this foundation does not write telemetry anywhere.

## Automated Road Graph

The graph does not hand-build origin/destination pairs. Any connected nodes can
be routed using shortest, fastest, paved-only or vehicle-oriented profiles.

- `roadGraphTypes.ts` — provider-neutral segments, nodes, edges and route facts
- `roadGraph.ts` — graph builder, diagnostics and priority-queue routing
- `vegagerdinRoadGraphSource.ts` — pure ArcGIS GeoJSON normalization
- `vegagerdinRoadGraphSource.server.ts` — paginated read-only official-data fetch
- `roadGraphRoutingProvider.server.ts` — routing-provider adapter

Current safety boundary:

- Vegagerdin `Vegir` geometry is the topology source.
- `Slitlag` is joined by `IDKAFLI`; sections containing both paved and gravel
  records are `mixed` and are rejected by paved-only profiles.
- No official speed layer is connected yet. Travel time is explicitly marked as
  derived and must be presented as an estimate.
- F-road classification does not claim a current seasonal closure.
- The live audit is opt-in with `ROAD_GRAPH_LIVE_TEST=true`; normal test runs do
  not depend on the external service.
- The flag-gated candidate is labelled experimental in both locales. Its time is
  derived, it does not claim current closures/conditions, and it is never the
  automatic selection.

## When To Add Here

Add to this package when work touches reusable route knowledge:

- road segments or route families
- curated route concepts
- control points or route evidence points
- route caution metadata
- open-data source metadata that road graph, map prototype, or segment-state
  logic depends on
- provider-station matching concepts
- route cache or segment-interest heatmap keys

If a change is only UI presentation for one screen, keep it in the Weather UI.
If it teaches Teskeid something about Icelandic roads, consider this package.
