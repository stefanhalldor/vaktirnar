# TODO 090 — Automatic Iceland road graph spike

**Agent:** Codex  
**Date:** 2026-07-25 23:58 Atlantic/Reykjavik  
**Scope:** Large isolated engineering step after `2026-07-25-2333-todo-090-v004-claude-hardening-scheduler.md`.

## Outcome

Teskeið now has a provider-neutral, automatic road-graph engine that can ingest the complete public Vegagerðin road-section layer, attach surface facts from the separate surface layer, construct a directed graph, and calculate routes by distance or estimated travel time. It does not require a manually authored route family.

A read-only live audit successfully calculated Reykjavík → Akureyri on a paved-only profile:

- 390,190 m
- 16,526 seconds (about 4 h 35 min)
- 57 source segments
- 390,190 m paved; 0 m gravel, mixed, or unknown
- all travel speeds are currently conservative derived estimates
- endpoint snapping: about 767 m at origin and 1,091 m at destination

This is an engineering spike, not a production ETA or a user-visible route.

## Plan for this phase

1. Verify authoritative source structure, licensing, and topology.
2. Define provider-neutral graph, edge, profile, surface, speed-provenance, and route types.
3. Build a deterministic directed graph and route solver.
4. Add a narrowly allowlisted, read-only Vegagerðin source adapter.
5. Add unit, integration, and opt-in live tests.
6. Document evidence, limitations, and the production path.

## What was actually done

- Used `data/vegakerfi/MapServer/6` as canonical topology: 1,226 road sections.
- Joined `data/slitlag/MapServer/0` surface records to road sections by `IDKAFLI`; surface geometry is deliberately not used for network topology.
- Preserved unknown and mixed source facts instead of guessing.
- Added conservative derived speed profiles and explicit speed provenance.
- Added one-way handling from `STEFNA`, endpoint snapping, weak-component analysis, priority-queue Dijkstra, and multi-candidate component-aware map matching.
- Added fastest-car, shortest-paved, fastest-paved, and caravan profiles.
- Added route surface breakdown, derived-speed distance, and endpoint snap-distance diagnostics.
- Added a server-only, fixed-host/fixed-layer reader with pagination, bounded parsing, and privacy-safe failures.
- Added a provider adapter returning the existing provider-neutral route contract with `resultKind: road_graph`.
- Added an opt-in live audit guarded by `ROAD_GRAPH_LIVE_TEST=true`; ordinary tests never call the external service.
- Updated the research, source-license, roadmap, and route-engine documentation.

## Files inspected

- `WORKFLOW.md`
- `AGENTS.md`
- `IcelandRoadmap.md`
- `OpenDataResearch.md`
- `DataLicenses.md`
- `lib/iceland-routes/*`
- `lib/__tests__/iceland-routing-shadow.test.ts`
- `lib/__tests__/teskeid-routing-provider.test.ts`
- `lib/__tests__/teskeid-routing-scheduler.test.ts`
- Claude handoff `2026-07-25-2333-todo-090-v004-claude-hardening-scheduler.md`
- Official Vegagerðin ArcGIS layer metadata and read-only query responses.

## Files created

- `lib/iceland-routes/roadGraphTypes.ts`
- `lib/iceland-routes/roadGraph.ts`
- `lib/iceland-routes/vegagerdinRoadGraphSource.ts`
- `lib/iceland-routes/vegagerdinRoadGraphSource.server.ts`
- `lib/iceland-routes/roadGraphRoutingProvider.server.ts`
- `lib/__tests__/iceland-road-graph.test.ts`
- `lib/__tests__/vegagerdin-road-graph-source.test.ts`
- `lib/__tests__/road-graph-routing-provider.test.ts`
- `lib/__tests__/vegagerdin-road-graph.live.test.ts`

## Files modified

- `lib/iceland-routes/routingProvider.ts`
- `lib/iceland-routes/index.ts`
- `lib/iceland-routes/README.md`
- `IcelandRoadmap.md`
- `OpenDataResearch.md`
- `DataLicenses.md`

No UI, API route, migration, Supabase data, production environment, deployment, commit, or push was changed by Codex in this phase. Other dirty-worktree changes were preserved.

## Commands and results

- Targeted route tests: exit 0; 45 passed, 1 opt-in live test skipped.
- `npm run type-check`: exit 0.
- Opt-in live graph audit against the two official read-only layers: exit 0; Reykjavík → Akureyri found with the metrics above.
- `npm run test:run`: exit 0; 143 files passed, 1 skipped; 3,663 tests passed, 28 skipped, 8 todo.
- `npm run build`: exit 0; production build and type validation completed. Existing hook/image lint warnings remain outside this phase.
- Scoped `git diff --check`: exit 0; only Git line-ending notices were emitted.

## Failed experiments and what they established

1. Building topology from surface-record geometries produced 3,322 weak components. Conclusion: surface records are linear-referencing facts, not canonical network topology.
2. Canonical road topology plus a single nearest-node snap still failed for some endpoints because the nearest local endpoints belonged to different components. Conclusion: endpoint matching must consider multiple candidates and a shared routable component.
3. The component-aware matcher fixed that failure without adding a manual Reykjavík–Akureyri exception.

## Decisions

- Fail closed for paved-only routing: `mixed` and `unknown` are not treated as paved.
- F-road classification is retained, but an F-road is not automatically marked currently seasonal; present road state needs a separate source.
- Speeds are labelled `derived`; no official speed-limit provenance is claimed.
- Server/network modules are not exported from the browser-safe barrel.
- No persistent download/cache pipeline was introduced in this phase.
- No UI or feature flag was enabled.

## Remaining risks and gaps

- The graph has 1,363 nodes, 2,452 directed edges, and 199 weak components at the current 20 m endpoint tolerance. The largest component has 854 nodes. More topology audits are required.
- Endpoints currently snap to graph nodes, not the nearest point along an edge. The Reykjavík/Akureyri audit exposes roughly 0.8–1.1 km snap gaps.
- Surface is summarized per `IDKAFLI`; multiple surface records make the whole section `mixed`. Exact linear-referenced splitting is needed to retain paved sub-sections safely.
- All speeds are derived from class/surface rules. ETA needs official speed-limit discovery and calibration before product use.
- Only section direction is modelled. Turn restrictions, junction penalties, closures, temporary restrictions, current winter state, ferries, vehicle dimensions/weights, and service-road access rules are not production-ready.
- The live source adapter fetches the full current source. A versioned, validated graph artifact and cache/build pipeline are needed before request-path integration.
- Component-aware snapping needs a wider golden matrix to ensure it never chooses a technically connected but semantically poor distant access point.

## Recommended next large phase

1. Create a 20–50 pair golden-route audit matrix across regions, ferries, dead ends, F-roads, islands, and winter-sensitive corridors.
2. Add nearest-edge projection and explicit connector legs with strict maximum-distance and ambiguity rules.
3. Split section geometry at exact surface intervals while preserving canonical topology.
4. Discover and ingest authoritative speed-limit facts; retain derived fallback and provenance per edge.
5. Produce a versioned graph snapshot with source timestamp, hash, validation report, attribution, and last-known-good rollback.
6. Put `RoadGraphRoutingProvider` into the existing shadow scheduler behind its own off-by-default flag, reading only the validated snapshot.
7. Compare candidate routes against Google results and known driving reality; do not expose them until safety gates pass.
8. Add current restrictions and vehicle constraints before presenting Teskeið routes as safety guidance.

## Questions for Claude Code review

- Is the component-aware endpoint-pair selection bounded and deterministic enough for a larger Iceland matrix?
- Are unknown/mixed surface and direction values handled fail-closed everywhere?
- Should the graph snapshot be generated by a script, scheduled job, or controlled admin process given Vercel runtime limits?
- Which official dataset should supply speed limits and current restrictions without turning derived estimates into apparent facts?
- Can the graph provider join the scheduler without pulling server-only dependencies into client bundles?

## Route Intelligence check

- No existing Google-provider behavior was changed.
- No user-visible candidate route was added.
- The live audit is read-only and opt-in.
- The new engine is isolated behind provider-neutral interfaces and is not wired into production traffic.
- Privacy-safe errors do not include raw user coordinates or place names.

## Localhost checks for Stebbi

There is intentionally no new UI to test in this phase. On localhost, existing `/vedrid` and `/vedrid/ferdalagid` behavior should look unchanged. A short smoke check may confirm that ordinary Google-backed route calculation still works and no new Teskeið-route option appears.

Do not enable a production feature flag or treat the calculated ETA as safety guidance. The opt-in live test only reads public Vegagerðin services, but it requires network access and does not need to be run by Stebbi; Codex already ran it successfully.

## Handoff status

Ready for Claude Code review. The next implementation should remain shadow-only and start with the golden matrix and graph artifact pipeline, not UI exposure.
