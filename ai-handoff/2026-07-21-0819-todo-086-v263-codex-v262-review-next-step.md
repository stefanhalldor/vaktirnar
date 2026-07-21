# Review: v262 working MapLibre M2A status and next step

Created: 2026-07-21 08:19
Timezone: Atlantic/Reykjavik
Agent: Codex
Relevant TODO: 086
Type: Review + next-step recommendation

---

## Findings

### Medium: popup uses `setHTML()` with external provider data

File: `components/weather/RoadMapPrototypeMap.tsx:175`

The station popup builds an HTML string from station properties and passes it to MapLibre `setHTML()`:

```ts
const html = `
  <div ...>
    <strong ...>${props.stationName ?? 'Stöð'}</strong><br>
    Vindur: ${mean}${dir ? ' ' + dir : ''}<br>
    Hvína: ${gust}<br>
    Loftslag: ${temp}
  </div>
`
...
.setHTML(html)
```

This is probably low-risk in the current gated prototype because the values come from Vegagerðin/current weather provider data, not Teskeið user input. Still, it is an external upstream data source and `setHTML()` is exactly the kind of API that can become an XSS footgun if the upstream data ever contains unexpected markup.

Recommendation before wider testing: use `setDOMContent()` and create DOM nodes with `textContent`, or escape all interpolated values before `setHTML()`. This is a small fix and is worth doing before this becomes a pattern.

### Medium: per-tile Supabase auth + feature lookup is okay for Stebbi-only prototype, not for wider rollout

Files:

- `app/api/teskeid/road-intelligence/map-proxy/route.ts:26`
- `app/api/teskeid/road-intelligence/lmi-tile/route.ts`

Every raster tile request does:

1. `createClient()`
2. `supabase.auth.getUser()`
3. `checkFeatureAccess(...)`
4. service-role lookup in `feature_access`

For one or two users this is acceptable. It is not a scalable shape for a map UI because panning/zooming can create many tile requests quickly.

Recommendation: keep this only behind `road-intelligence-v1` and do not broaden access until either:

- the raster proxy is replaced by vector FeatureServer GeoJSON calls with coarser request cadence, or
- a short-lived signed map token/cached access check is introduced.

This is not a blocker for M2A proof-of-life.

### Low: popup text is hardcoded Icelandic and has wording issues

File: `components/weather/RoadMapPrototypeMap.tsx:177`

The popup uses hardcoded Icelandic labels and includes likely typo/awkward wording:

- `Hvína:` should probably be `Hviða:` or `Vindhviða:`
- `Loftslag:` should probably be `Hiti:` or `Lofthiti:`
- Text should move into `messages/is.json` / `messages/en.json` if this remains user-visible.

This is acceptable for a prototype but should be fixed together with `setDOMContent()`.

### Low: unused LMÍ tile proxy remains in the branch

Files:

- `app/api/teskeid/road-intelligence/lmi-tile/route.ts`
- `lib/road-intelligence/lmiTileProxy.ts`
- `lib/__tests__/road-intelligence-lmi-tile-proxy.test.ts`

Claude kept LMÍ proxy helpers/routes after CartoDB became the active basemap. They are auth + `road-intelligence-v1` gated, so this is not an access concern, but they add maintenance surface.

Recommendation: keep only if we explicitly want it as an experimental fallback for M2A/M2B. Otherwise remove before production merge. Given our own-map strategy, it is reasonable to keep for now, but the handoff should say clearly that CartoDB is the active basemap and LMÍ proxy is dormant research scaffolding.

## What Looks Good

- The root cause diagnosis and fix from v262 is convincing.
- `containerRef` now uses `h-full w-full`, avoiding the MapLibre `.maplibregl-map { position: relative }` conflict.
- Route page has `min-h-0` on the flex map area.
- MapLibre CSS is loaded in route-scoped layout before the map component initializes.
- Access remains gated:
  - page guarded by session + `road-intelligence-v1`
  - proxy APIs guarded by session + `road-intelligence-v1`
  - no public `/vedrid` exposure
- `checkFeatureAccess` ignores the userId and checks canonical email, so the page's `checkFeatureAccess('', user.email ?? '', ...)` is not a practical mismatch with API routes passing `user.id`.
- `npm run type-check` is green.
- Targeted road-intelligence tests are green.

## Commands Run

- `Get-Content -Encoding UTF8 'ai-handoff\2026-07-21-0820-todo-086-v262-claude-m2a-working-map.md'`
- `Get-Content -Encoding UTF8 'components\weather\RoadMapPrototypeMap.tsx'`
- `git status --short`
- `Get-Content -Encoding UTF8 'lib\loans\guard.ts'`
- `Get-Content -Encoding UTF8 'app\api\teskeid\road-intelligence\map-proxy\route.ts'`
- `Get-Content -Encoding UTF8 'lib\road-intelligence\vegagerdinMapProxy.ts'`
- `Get-Content -Encoding UTF8 'app\auth-mvp\vedrid\road-map-prototype\layout.tsx'`
- `npm run type-check` — exit code 0
- `npm run test:run -- lib/__tests__/road-intelligence-map-proxy.test.ts lib/__tests__/road-intelligence-station-geo-json.test.ts lib/__tests__/road-intelligence-lmi-tile-proxy.test.ts` — exit code 0, 3 files / 37 tests passed
- line-number reads for `RoadMapPrototypeMap.tsx`, `page.tsx`, `map-proxy/route.ts`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

## Files Changed By Codex In This Review

- Added this review file only:
  - `ai-handoff/2026-07-21-0819-todo-086-v263-codex-v262-review-next-step.md`

No app code, SQL, migrations, env vars, commits, pushes, deploys, Supabase data, or production settings were changed.

## Recommended Next Step

I would split the next work into two phases:

### Phase M2A-polish, small but important

Before the next large step, ask Claude Code to:

1. Replace `setHTML()` popup creation with `setDOMContent()` or safe escaping.
2. Move popup labels to translations or at least correct Icelandic labels in the prototype.
3. Add a tiny test/helper if escaping is used.
4. Keep the result as a small handoff, then Stebbi browser-tests popup + road overlay toggle.

This reduces the chance that the prototype teaches us unsafe UI patterns.

### Phase M2B-1, the next real Road Intelligence step

Start moving from raster overlay to provider-neutral vector road data:

1. Create `lib/road-intelligence/vegagerdinRoadSegments.ts`.
2. Discover and document the exact Vegagerðin ArcGIS `FeatureServer` or query endpoint for road lines.
3. Build a server-side helper that validates a bbox and fetches only the needed road segment fields.
4. Add an auth + `road-intelligence-v1` gated API route that returns GeoJSON.
5. Add tests for bbox validation, URL construction, response mapping, and content limits.
6. Add a MapLibre line source/layer to the prototype, initially alongside the raster overlay.
7. Do not remove the raster overlay until the vector line layer is confirmed useful.

This is the step that actually unlocks Live Road OS: segment styling, road-state coloring, dynamic layer transitions, and later GPS-driven corridor logic.

## Localhost Checks For Stebbi

For v262 as it stands:

1. Open `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`.
2. Confirm the map fills the viewport under the header, not just a 300px strip.
3. Confirm Iceland basemap, roads/overlay, and wind dots are visible.
4. Press `Fela vegakerfi` and then show it again. Expected: only the Vegagerðin road overlay visibility changes; basemap and wind dots remain.
5. Click 2-3 wind dots. Expected: popup opens near the station and old popup closes.
6. Check that popup labels make sense enough for prototype. Known issue: wording should be improved before broader use.
7. Resize mobile viewport or rotate devtools viewport. Expected: map still fills the panel and dots remain aligned.

Do not test this on production or broaden `road-intelligence-v1` access without explicit approval. No SQL/migration is needed for these checks.

## Route Intelligence Check

This review concerns the experimental map shell and Road Intelligence foundation.

- Route/landshluti touched: country-wide Iceland road/weather map prototype.
- No new canonical route segments or control points were added.
- M2A currently uses a raster Vegagerðin overlay, which is not enough for provider-neutral segment intelligence.
- The recommended next route-intelligence work is M2B-1: start a reusable Vegagerðin road segment GeoJSON layer in `lib/road-intelligence/`, designed so it can later feed `lib/iceland-routes/` / `IcelandRoadmap.md`.
- No user route geometry, raw addresses, GPS, or Supabase route writes are involved.

## Uncertainty

Confidence is high that M2A is now healthy enough for Stebbi-only prototype testing. Confidence is medium that the CartoDB basemap should remain the active temporary basemap; it is pragmatic for now, but the long-term own-map strategy still wants LMÍ/open data and vector layers where possible.

The biggest decision for Stebbi/Claude before the next big step:

- If the goal is speed to Live Road OS, do M2B-1 vector road segments next.
- If the goal is a safer prototype before more architecture, do M2A-polish first.

Codex recommendation: do M2A-polish first because it is small, then immediately start M2B-1.
