# Road Intelligence first steps handoff

Created: 2026-07-20 16:49
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Strategy + implementation handoff for Claude Code
Relevant TODO: 086
Status: Plan only. No code, SQL, commit, push, deploy, or production change is approved by this file.

## Short Version

Stebbi wants to move quickly toward Road Intelligence, but the first step should be deliberately small:

1. Keep Google-backed `/ferdalagid` and route-memory working exactly as-is.
2. Put Road Intelligence behind a strict per-user feature flag.
3. Build only a typed, static, provider-neutral intelligence skeleton first.
4. Show a small read-only experimental surface for flagged users.
5. Do not use open/GIS data, PostGIS, routing engines, new Supabase route data, or map rendering changes in the first PR.

This should be a side path, not a replacement.

## Context

Reviewed inputs:

- `IcelandRoadmap.md`
- `lib/iceland-routes/README.md`
- current `lib/iceland-routes/*` landing-zone files
- `ai-handoff/2026-07-20-1617-todo-086-v241-codex-road-intelligence-release-next-steps.md`
- `ai-handoff/2026-07-20-1635-todo-086-v243-codex-v242-release-fix-handoff.md`
- `ai-handoff/2026-07-20-1645-todo-086-v244-claude-release-handoff.md`
- attached “Teskeið - Iceland Road Intelligence Platform” research prompt
- attached “Teskeið - Live Road OS” vision prompt
- `Design.md`
- feature-access patterns in `lib/loans/guard.ts`, `app/api/admin/feature-access/route.ts`, and SQL migrations 52/68/73/76/79/80

Current state:

- `IcelandRoadmap.md` already defines the direction.
- `lib/iceland-routes/` already exists.
- There is an old transitional corridor lens and a newer route-memory station-set system.
- The most recent release handoff says Road Intelligence is not in the release yet.

## Product Decision

Do not start by adding arbitrary `Viðkomustaður` to the main user flow.

Road Intelligence should make Teskeið smarter so regular users do not need to know which waypoint solves a route. Internally, route alternatives may have control points or waypoints later, but the UI should speak human route language:

- `Gegnum Hólmavík`
- `Um Hellisheiði`
- `Til að sleppa við Öxi`
- `Um firðina`
- `Hringvegurinn`

This matches the “Google knows the road, Teskeið understands the road” direction.

## Recommended Feature Flag

Use a new per-user feature key:

```txt
road-intelligence-v1
```

Suggested behavior:

- Global kill switch: `ROAD_INTELLIGENCE_V1_ENABLED=true`
- Initial rollout: always require a `feature_access` row for `road-intelligence-v1`
- No graduation/open-by-default behavior in v1
- Public `/vedrid` must never show Road Intelligence UI
- Authenticated users without the row must see no change

Why this key:

- It is not weather-provider-specific.
- It can later outgrow `/vedrid`.
- It is still clearly experimental and versioned.

If Claude Code strongly prefers `weather-road-intelligence-v1`, pause and explain the tradeoff before implementing. My recommendation is `road-intelligence-v1`.

## Phase RI-0: Flag + Boundary Only

Goal: make it possible to safely ship hidden Road Intelligence work.

Expected files if Stebbi approves implementation:

- new SQL migration, likely `sql/89_feature_access_road_intelligence_v1.sql`
- `lib/loans/guard.ts`
- `app/api/admin/feature-access/route.ts`
- tests:
  - `lib/__tests__/guard.test.ts`
  - `lib/__tests__/feature-access-api.test.ts`
  - `lib/__tests__/sql-migration.test.ts`

Migration shape:

- Widen `public.feature_access.feature_key` check constraint to include `road-intelligence-v1`.
- No new table.
- No new policy.
- No grant changes.
- Service-role only, same as existing feature_access model.
- Rollback should recreate the previous allowed-key list.
- Do not run migration without Stebbi’s explicit Supabase approval.

Guard behavior:

```ts
if (featureKey === 'road-intelligence-v1') {
  if (process.env.ROAD_INTELLIGENCE_V1_ENABLED !== 'true') return false
  return checkPerUserAccess(email, 'road-intelligence-v1')
}
```

Important:

- Do not default to open if env var is unset.
- Do not expose through public pages.
- Do not use this key to gate existing `/vedrid` base access.

## Phase RI-1: Typed Static Intelligence Skeleton

Goal: create the first provider-neutral Road Intelligence contracts without changing product behavior.

Use existing `lib/iceland-routes/` rather than creating a parallel package.

Suggested additions:

- Extend or add types for:
  - `IcelandRouteAlternative`
  - `IcelandRouteCaution`
  - `IcelandVehicleProfile`
  - `IcelandSegmentRiskRule`
  - `IcelandRoadIntelligenceResult`
  - `IcelandRoadIntelligenceConfidence`
- Add small static registries:
  - `lib/iceland-routes/cautions.ts`
  - `lib/iceland-routes/alternatives.ts`
  - maybe `lib/iceland-routes/roadIntelligenceResolver.ts`
- Add tests:
  - `lib/__tests__/iceland-routes-road-intelligence.test.ts`

Keep the first data set tiny:

1. Reykjavík ↔ Egilsstaðir
   - alternatives: `Um Hellisheiði`, `Um firðina`, `Til að sleppa við Öxi`
   - segments/cautions: Hellisheiði, Öxi, Eastfjords/firðir placeholder
2. Reykjavík ↔ Ísafjörður
   - alternative: `Gegnum Hólmavík`
   - segments/cautions: Hólmavík/Vestfirðir placeholder
3. Reykjavík ↔ Akureyri
   - alternative/backbone: `Hringvegurinn`
   - segments/cautions: Holtavörðuheiði/Öxnadalsheiði placeholder if already represented or added as unverified stubs

Rules:

- Stable IDs, never label-derived ephemeral IDs.
- `verified: false` is fine for geometry/control data until checked.
- No raw Google geometry.
- No user-specific routes.
- No external open-data import yet.
- No Supabase writes.

## Phase RI-2: Pure Resolver

Goal: answer “does Teskeið know anything about this pair?” without Google.

Add a pure function, name flexible:

```ts
resolveRoadIntelligenceForPlaces({
  fromPlaceKey,
  toPlaceKey,
  fromLabel,
  toLabel,
}): IcelandRoadIntelligenceResult
```

Expected result contract:

- `status: 'resolved' | 'unknown'`
- `source: 'teskeid_registry'`
- `confidence: 'draft' | 'reviewed' | 'verified'`
- `routeFamilyId`
- `alternatives[]`
- `segments[]`
- `cautions[]`
- no station filtering yet unless backed by existing route-memory or explicit static station attachments

The first resolver should use the existing normalization patterns where possible:

- `routePlaceNormalization.ts` for route-memory public place keys
- `lensResolver.ts` place-name normalization logic if needed

Avoid duplicating normalization unless the existing helpers are too UI-specific. If extraction is needed, keep it small.

## Phase RI-3: Read-Only Flagged UI

Goal: let Stebbi see the Road Intelligence layer without affecting ordinary users or station filtering.

Recommended first surface:

- `/auth-mvp/vedrid`
- only when `road-intelligence-v1` is true for the user
- only after both `Frá` and `Til` are selected in the route picker
- small read-only panel under the existing route-memory picker/variant pills

Possible copy, in messages:

- IS title: `Teskeið þekkir þessar leiðir`
- EN title: `Teskeið knows these routes`
- IS experimental badge: `Tilraun`
- EN experimental badge: `Experimental`

The panel should show:

- route family label
- route alternative pills
- caution chips such as `Varasöm leið`, `Fjallvegur`, `Vindnæmt`
- confidence label if draft/unverified
- no promise that map filtering uses it yet

Important UI rule:

- Do not replace current route-memory filtering.
- Do not hide existing route-variant pills.
- If route-memory has data, it remains source of marker filtering.
- If route-memory misses, Road Intelligence may show helpful route knowledge, but should not yet filter the map unless Phase RI-4 is explicitly approved.

## Phase RI-4: Station Matching, Later

This is not first PR unless Claude Code finds it trivial and Stebbi explicitly approves expanding scope.

Later we can attach Veðurstofan/Vegagerðin station IDs to segments or alternatives:

- `segmentStationAttachments.ts`
- provider-neutral contract:
  - segmentId
  - provider
  - stationId
  - role: `on_segment | nearby | endpoint | control`
  - confidence

Only then should Road Intelligence become a route-memory fallback for map filtering.

Until this exists, do not let curated alternatives imply exact weather station coverage.

## Phase RI-5: Open Data Research Spike

Do not make open data a production dependency in the first implementation.

Separate research should verify, using official sources:

- Vegagerðin GIS services
- Landmælingar Íslands layers
- OSM role and ODbL implications
- routing engines: GraphHopper, Valhalla, OSRM
- map rendering: MapLibre, Leaflet, OpenLayers
- vector tile pipeline: PMTiles, MBTiles, tippecanoe, Martin/Tegola
- license, attribution, caching, reliability, update frequency, cost

Do not assume “free” means “safe to store/cache/use in production.”

## First Claude Code Execution Slice

If Stebbi sends this handoff to Claude Code with clear `Workflow`/execution approval, the safest first slice is:

1. Implement Phase RI-0 feature flag and tests.
2. Implement Phase RI-1/RI-2 pure typed skeleton and tests.
3. Add no visible UI unless the flag is confirmed and passed from the authenticated `/auth-mvp/vedrid` page.
4. If UI is included, keep it read-only and clearly experimental.
5. Stop with handoff before any station-matching or map-filter behavior.

Do not do:

- no Google replacement
- no arbitrary waypoint UI
- no external data fetching
- no production SQL execution
- no PostGIS
- no routing engine
- no new stored user route data
- no public behavior change

## Files Likely Involved

Feature flag:

- `sql/89_feature_access_road_intelligence_v1.sql`
- `lib/loans/guard.ts`
- `app/api/admin/feature-access/route.ts`
- `lib/__tests__/guard.test.ts`
- `lib/__tests__/feature-access-api.test.ts`
- `lib/__tests__/sql-migration.test.ts`

Domain skeleton:

- `IcelandRoadmap.md` (only if new concepts/phase status are added)
- `lib/iceland-routes/types.ts`
- `lib/iceland-routes/segments.ts`
- `lib/iceland-routes/index.ts`
- new `lib/iceland-routes/cautions.ts`
- new `lib/iceland-routes/alternatives.ts`
- new `lib/iceland-routes/roadIntelligenceResolver.ts`
- new `lib/__tests__/iceland-routes-road-intelligence.test.ts`

Optional flagged UI:

- `app/auth-mvp/vedrid/page.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- maybe new `components/weather/RoadIntelligencePreview.tsx`
- `messages/is.json`
- `messages/en.json`

## Testing Requirements

Minimum commands after implementation:

```bash
npm run type-check
npm run test:run
npm run build
```

Focused test expectations:

- `checkFeatureAccess(..., 'road-intelligence-v1')` is false when env is off.
- false when env is on but no feature_access row.
- true when env is on and row exists.
- admin feature-access API accepts exactly `road-intelligence-v1` and rejects arbitrary keys.
- SQL migration static test includes the new key and rollback guidance.
- resolver returns known alternatives for the 2-3 starter route families.
- resolver returns `unknown` for unsupported pairs.
- resolver is bidirectional where intended.
- no API/client path exposes Road Intelligence to public users.

## Supabase / SQL Risk

Likely SQL is only a CHECK constraint migration on `feature_access`.

Risk:

- Low if the new migration preserves every existing allowed feature key.
- High if it accidentally drops one existing key from the CHECK list, because admin grants for weather/provider/pulse could break.

Mitigation:

- Copy the full current allowed key list from latest migration/production schema.
- Add static SQL tests.
- Do not run the migration until Stebbi explicitly approves.

No RLS weakening should be needed.

## Data / Privacy Rules

For the first Road Intelligence PR:

- Do not store user routes.
- Do not store raw addresses.
- Do not store raw Google route geometry.
- Do not store raw Google route steps, duration, distance, or place IDs as canonical road intelligence.
- Static curated route knowledge is OK.
- Segment-level aggregate concepts are OK later, but not in first PR.

Future route-interest should be aggregate segment-level only, with separate privacy review.

## Design.md Check

This plan follows the Design.md direction:

- mobile-first, small app surface, not a new dashboard
- no big hero or marketing treatment
- controls should be chips/pills with clear selected state
- no horizontal overflow
- no route-option text that forces zoom on mobile
- experimental state must be visible for flagged users
- no extra complexity for normal users

If UI is added, use a compact, un-nested panel under the existing route picker, not a large card inside a card.

## Route Intelligence Check

1. Route families touched:
   - Reykjavík ↔ Egilsstaðir
   - Reykjavík ↔ Ísafjörður
   - Reykjavík ↔ Akureyri
   - possibly backbone segments around Hellisheiði, Öxi, Hólmavík/Vestfirðir, Holtavörðuheiði/Öxnadalsheiði
2. New knowledge belongs in `IcelandRoadmap.md` and `lib/iceland-routes/`.
3. The model must be provider-neutral; Google can remain a provider/fallback but not the canonical source.
4. Needed later:
   - canonical segments
   - alternatives
   - cautions
   - station matching rules
   - test fixtures
5. Privacy:
   - start static/curated
   - no user IDs
   - no raw addresses
   - no raw Google geometry
6. No open data production dependency until license/caching/attribution is verified.
7. If `IcelandRoadmap.md` is not updated in the first PR, Claude Code should explain why; if new concepts are introduced, update it.

## Localhost Checks For Stebbi

After Claude Code implements the first slice:

1. User without feature flag:
   - Open `/auth-mvp/vedrid`.
   - Pick `Frá` and `Til`.
   - Expected: no Road Intelligence experimental panel appears.
   - Existing route-memory behavior is unchanged.

2. User with `road-intelligence-v1`:
   - Open `/auth-mvp/vedrid`.
   - Pick Reykjavík → Egilsstaðir.
   - Expected: small experimental Road Intelligence panel appears with known alternatives/cautions.
   - Map filtering should still come from route-memory, not from Road Intelligence, unless a later phase explicitly changed that.

3. Public `/vedrid`:
   - Open signed out.
   - Expected: no Road Intelligence panel or extra controls.

4. Unsupported pair:
   - Pick a pair not in the static registry.
   - Expected: either no panel or a low-key “Teskeið þekkir ekki þessa leið enn” state for flagged users only.
   - No console error.

5. Mobile:
   - Check 360px, 390px, 460px widths.
   - Expected: pills wrap neatly, no horizontal overflow, no text overlap, no input zoom.

Do not test by running SQL against production or granting/removing production feature access unless Stebbi explicitly asks for that.

## Commands Run For This Handoff

All commands were read-only except writing this handoff file:

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\\README.md'`
- `Get-Content -Encoding UTF8 'IcelandRoadmap.md'`
- `Get-Content -Encoding UTF8 'Design.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\\2026-07-20-1617-todo-086-v241-codex-road-intelligence-release-next-steps.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\\2026-07-20-1635-todo-086-v243-codex-v242-release-fix-handoff.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\\2026-07-20-1645-todo-086-v244-claude-release-handoff.md'`
- `Get-Content` on the two Road Intelligence attachment text files
- `Get-ChildItem` on `lib/iceland-routes`, `sql`, and `ai-handoff`
- `rg` for feature-access patterns
- `Get-Content` on feature access, route, and weather files listed above
- `git status --short`
- `Get-Date -Format "yyyy-MM-dd HH:mm"`

No tests were run because this handoff only adds documentation.

## Open Questions For Claude Code

1. Is `road-intelligence-v1` the right feature key, or should it be weather-scoped?
2. Should RI-0 and RI-1 be one PR, or should the feature flag land alone first?
3. Can the pure resolver reuse `routePlaceNormalization.ts` without making it too route-memory-specific?
4. Should the first UI panel be added immediately, or should Phase RI-1/RI-2 stay invisible and tested only?
5. Which 3 starter route families should be treated as first-class regression fixtures?

## Recommendation

Start with RI-0 + RI-1 + RI-2 as a tiny, tested, feature-flagged side path.

If Stebbi wants a visible win immediately, add RI-3 as a read-only experimental panel for flagged users only. Keep marker filtering and station selection untouched until station matching has its own explicit phase.
