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
- Supabase persistence is limited to versioned, provider-level road-graph
  snapshots and validation metadata. No user routes or exact addresses persist.
- Provider-neutral routing contract for future Google and Teskeid adapters.
- Server-only shadow runner behind `TESKEID_ROUTING_SHADOW_ENABLED` (off unless
  explicitly set to `true`), scheduled after the primary travel response.
- Automated road-graph core with directed edges, topology repair,
  multi-component endpoint matching, priority-queue routing and surface profiles.
- Read-only Vegagerdin ArcGIS import boundary. Only the protected refresh worker
  reaches it. User-facing consumers read a validated last-known-good snapshot.
- A localhost-only route lab at `/preview/teskeid-routes` can calculate any
  Icelandic place pair resolved by the existing place search, request bounded
  alternative routes, audit surface composition, attach cached current
  Vegagerðin observations, and preview browser-GPS movement. It is explicitly
  experimental and is production-closed unless `TESKEID_ROUTE_LAB_ENABLED=true`.
- A road-graph candidate can be appended after the existing Google route
  options with `TESKEID_ROUTE_CANDIDATE_ENABLED=true` for every eligible
  Weather user, including signed-out users when public Weather access is on.
  The flag remains the global kill-switch. Anonymous candidate work requires a
  short-lived signed Google route envelope from the already rate-limited route
  options endpoint, uses its own HMAC-IP retry bucket, and cannot use the graph
  warm-only operation. Final anonymous Teskeið selection likewise requires the
  signed Teskeið envelope; a bare route ID is rejected. Google remains first.
  The request has an eight-second response budget, but budget expiry is
  a pending state: graph materialisation from the active snapshot continues with
  `after()`. Live source refresh is separate, protected by admin/cron auth and a
  database lease, and promotes only snapshots that pass structural checks plus
  all 21 golden routes. Source failure, no route, or flag-off never fail the Google result. The same helper
  recalculates a selected candidate for final travel-weather sampling so preview
  and submit cannot use different rules.

## Last-known-good snapshot lifecycle

- `sql/92_teskeid_road_graph_snapshots.sql` creates service-role-only metadata,
  atomic lease/promotion functions and a private Storage bucket. It must be run
  manually by Stebbi before snapshot routes are used.
- `POST /api/admin/weather/refresh-road-graph` bootstraps or manually refreshes
  the snapshot for an authenticated Teskeið admin.
- `GET /api/cron/refresh-road-graph` runs daily with `CRON_SECRET` when the
  global route-candidate flag or the independent
  `TESKEID_ROAD_GRAPH_REFRESH_ENABLED=true` prewarm flag is on.
- The reader accepts reciprocal-v1 and exact-vertex-v2 contracts. Refresh keeps
  writing reciprocal-v1 during reader-first rollout until
  `TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED=true`; after v2 is active it will
  not downgrade merely because that rollout flag disappears. Before selecting
  a writer policy, refresh verifies that the active payload and metadata carry
  the same runtime contract and fails closed on missing/corrupt disagreement.
  Successful and unchanged responses include the selected policy fingerprint.
- Refresh fetches and normalizes official source data, sorts it deterministically,
  skips byte-identical source content, builds the graph and rejects suspicious
  count changes, weak connectivity or any failed golden route. The official
  20 m topology baseline measured on 2026-07-26 has 854 of 1,363 nodes (62.66%)
  in its largest weak component because the layer includes many small detached
  road stubs. Bootstrap therefore requires at least 60%, while later refreshes
  must also retain at least 90% of the active snapshot's component share. All
  21 golden routes remain mandatory and the 20 m topology tolerance is fixed.
- Topology policy v2 also recognizes a unique source-attested endpoint that is
  horizontally coincident within 1 mm with an interior vertex of the uniquely
  named official target section. This splits a real T-junction; it does not
  draw a proximity connector. Non-zero gaps retain the reciprocal-reference
  policy, and reliable elevation contradictions still fail closed.
- Every v2 promotion runs the actual HMS Víðibakki 851 Hella to Ísafjörður
  canary in both directions. It requires the 271-01 to Ring Road 1-c5 receipt,
  a 530–540 km corridor, bounded endpoint snaps and no 268/26 detour. This is a
  promotion assertion over the ordinary graph, not a place-specific route rule.
- Enhanced schema-v1 snapshots carry one of two explicit build fingerprints.
  The runtime can materialize retained reciprocal-v1 snapshots and current
  exact-vertex-v2 snapshots with the same pure materializer used by refresh.
  A policy change invalidates graph and candidate state retained across Fast
  Refresh.
- A validated payload is canonicalized, SHA-256 hashed, gzip-compressed and
  uploaded to an immutable private object path. Only then can one SQL transaction
  retire the previous active version and promote the new one.
- Runtime verifies bucket/path, compressed and uncompressed sizes, SHA-256,
  schema, graph diagnostics and golden-route pass metadata. It never imports or
  calls the live Vegagerðin source.
- Active plus the two previous retired snapshots are retained. Failed and
  unchanged refresh metadata is retained for 30 days; no user route is stored.
- Promote exact-vertex-v2 only after every serving runtime can read both
  fingerprints. If localhost and production share Supabase, deploying the
  dual-reader first is required before the separate admin refresh promotes v2.

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
