# Iceland Routes

Reusable route-domain landing zone for Teskeid's Iceland-specific road and
route intelligence.

The first consumer is Weather, but this folder should not become Weather-only
implementation detail. Put shared route concepts here when route knowledge is
useful across providers, screens, or future Teskeid products.

## Current Scope

- Type contracts for canonical Iceland route segments, nodes, route families,
  safety flags, and route-intelligence checks.
- No production routing behavior yet.
- No Google Routes replacement yet.
- No Supabase persistence yet.

## When To Add Here

Add to this package when work touches reusable route knowledge:

- road segments or route families
- curated route concepts
- control points or route evidence points
- route caution metadata
- provider-station matching concepts
- route cache or segment-interest heatmap keys

If a change is only UI presentation for one screen, keep it in the Weather UI.
If it teaches Teskeid something about Icelandic roads, consider this package.

