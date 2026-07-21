# Review: v264 M2A polish + M2B-1 road segments

Created: 2026-07-21 08:32
Timezone: Atlantic/Reykjavik
Agent: Codex
Relevant TODO: 086
Type: Code review + next implementation scope

---

## Findings

### Medium: `road-segments` proxy accepts world-scale bbox requests

Files:

- `lib/road-intelligence/vegagerdinSegments.ts:29`
- `app/api/teskeid/road-intelligence/road-segments/route.ts:47`

`parseSegmentsBboxRequest()` validates coordinate order and global longitude/latitude ranges, but it does not enforce an Iceland-ish envelope or max bbox span/area.

Because this is an authenticated prototype route, this is not an immediate public abuse vector. Still, a buggy client or an enabled user could proxy huge world-scale ArcGIS queries through Teskeið. `resultRecordCount=500` limits response size, but the upstream server may still have to evaluate a broad spatial query.

Recommended fix before broader testing:

- Add a conservative Iceland envelope, e.g. west/east/south/north must intersect or be contained within something like `[-26, -11, 62, 68]` with a small buffer.
- Add max span guards, e.g. max longitude span and latitude span appropriate for prototype viewport.
- Add tests for rejected world bbox and accepted Iceland bbox.

### Medium: road segment layer only loads once on initial map load

File: `components/weather/RoadMapPrototypeMap.tsx:120`

M2B-1 loads road segments once from `map.getBounds()` inside `map.on('load')`. If Stebbi pans or zooms, the vector road segments do not refresh for the new viewport.

For proof-of-life this is acceptable, but it will quickly feel broken when testing an interactive map.

Recommended next client step:

- Extract `loadRoadSegmentsForCurrentBounds(map)` helper inside the component.
- On first load, add source/layer.
- On later loads, call `setData()` on the existing source instead of `addSource()` again.
- Register a debounced `moveend` handler.
- Use `AbortController` or a request id counter so stale responses do not overwrite newer viewport data.

### Medium: road segment API can still throw a 500 on malformed upstream JSON

File: `app/api/teskeid/road-intelligence/road-segments/route.ts:75`

The route validates `Content-Type` and then calls `await upstreamResponse.json()`. If upstream returns `application/json` with malformed JSON, this throws and likely becomes a 500. Rare, but easy to harden.

Recommended fix:

```ts
let geojson: unknown
try {
  geojson = await upstreamResponse.json()
} catch {
  return NextResponse.json(
    { error: 'upstream_invalid_response' },
    { status: 502, headers: ERROR_HEADERS },
  )
}
```

### Low: route segment layer is visually hidden/ambiguous if the raster overlay remains on top

File: `components/weather/RoadMapPrototypeMap.tsx:140`

The vector line layer is added after the raster overlay, so it should draw above the overlay and below station dots. That is okay. But with `line-opacity: 0.55` and a full road raster underneath, it may be hard for Stebbi to tell whether the vector layer is working.

Recommended prototype tweak:

- Add a small state label such as `Vegir: 342 kaflar` or `Vegir: villa` in the legend/control cluster.
- Or add a separate toggle for vector segments vs raster road network once M2B-1 is confirmed.

### Low: popup polish is good enough, but text should not live here forever

File: `components/weather/RoadMapPrototypeMap.tsx:207`

Claude fixed the important issue: `setHTML()` is gone and provider values are now placed via `textContent` / `createTextNode` with `setDOMContent()`. Good.

Remaining product cleanup:

- Move popup text to `messages/is.json` / `messages/en.json` if the prototype graduates.
- Consider whether `Vindhviða` and `Lofthiti` are the final labels for this compact popup.

## What Looks Good

- M2A blank map root cause appears correctly fixed.
- `setDOMContent()` removes the main XSS footgun from the popup.
- `road-segments` route is auth + `road-intelligence-v1` gated.
- The route validates content type and minimal GeoJSON shape.
- The route enforces server-side feature count trimming.
- The raster overlay remains in place while vector segments are tested, which matches the v263 recommendation.
- `npm run type-check` is green.
- Targeted road intelligence tests are green.

## Validation Run By Codex

- `npm run type-check` — exit code 0.
- `npm run test:run -- lib/__tests__/road-intelligence-segments.test.ts lib/__tests__/road-intelligence-map-proxy.test.ts lib/__tests__/road-intelligence-station-geo-json.test.ts lib/__tests__/road-intelligence-lmi-tile-proxy.test.ts` — exit code 0, 4 files / 57 tests passed.

## Commands Run

- `Get-Content -Encoding UTF8 'ai-handoff\2026-07-21-0829-todo-086-v264-claude-m2a-polish-m2b1-done.md'`
- `Get-Content -Encoding UTF8 'components\weather\RoadMapPrototypeMap.tsx'`
- `Get-ChildItem -Recurse -File 'app\api\teskeid\road-intelligence','lib\road-intelligence','lib\__tests__' ...`
- `Get-Content -Encoding UTF8 'lib\road-intelligence\vegagerdinSegments.ts'`
- `Get-Content -Encoding UTF8 'app\api\teskeid\road-intelligence\road-segments\route.ts'`
- `Get-Content -Encoding UTF8 'lib\__tests__\road-intelligence-segments.test.ts'`
- `npm run type-check`
- `npm run test:run -- lib/__tests__/road-intelligence-segments.test.ts lib/__tests__/road-intelligence-map-proxy.test.ts lib/__tests__/road-intelligence-station-geo-json.test.ts lib/__tests__/road-intelligence-lmi-tile-proxy.test.ts`
- Line-number reads for `RoadMapPrototypeMap.tsx`, `vegagerdinSegments.ts`, and `road-segments/route.ts`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- `git status --short`

## Files Changed By Codex

Only this handoff/review file was added:

- `ai-handoff/2026-07-21-0832-todo-086-v265-codex-v264-review-next-scope.md`

No app code, SQL, migrations, env vars, Supabase data, commits, pushes, deploys, or production settings were changed.

## Why Codex Did Not Take The Next Big Implementation Step

Stebbi asked Codex to "taka næsta stóra framkvæmdaskref", but `WORKFLOW.md` requires clear and bounded execution permission. The next step can mean several different things:

1. harden M2B-1,
2. implement move/zoom segment refresh,
3. inspect upstream field schema and start condition coloring,
4. build a real Road Intelligence panel,
5. start replacing raster overlay with vector data.

Codex therefore did not modify application code in this turn. This review defines a bounded next implementation package below.

## Recommended Next Bounded Implementation

Ask Claude Code or Codex to execute this exact package:

**M2B-1 hardening + interactive refresh**

1. Add Iceland-ish/max-span bbox validation to `lib/road-intelligence/vegagerdinSegments.ts`.
2. Add tests for:
   - accepted Iceland bbox,
   - rejected world bbox,
   - rejected huge bbox,
   - accepted current initial MapLibre bbox if known from browser.
3. Wrap `await upstreamResponse.json()` in try/catch in `road-segments/route.ts`.
4. Extract road segment loading in `RoadMapPrototypeMap.tsx` into a helper that:
   - builds bbox from current map bounds,
   - fetches `/road-segments`,
   - adds source/layer if missing,
   - otherwise calls `setData()`.
5. Attach a debounced `moveend` listener.
6. Guard stale responses with `AbortController` or an incrementing request id.
7. Add a tiny status in the UI: loading/error/feature count for vector segments.
8. Run:
   - `npm run type-check`
   - targeted road-intelligence tests
9. Create a new handoff with browser checks.

After that, M2B-2 can begin: discover actual `faerd` field names and color road segments by road condition.

## Localhost Checks For Stebbi

For v264 as it stands:

1. Open `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`.
2. Confirm map still fills the viewport and wind dots appear.
3. Open DevTools Network and find `/api/teskeid/road-intelligence/road-segments?bbox=...`.
4. If status is 200:
   - open response JSON,
   - confirm `type: "FeatureCollection"`,
   - inspect `features[0].properties` and send field names to Claude/Codex.
5. Visually check whether blue vector lines are visible.
6. Pan/zoom the map:
   - known current limitation: vector segments will not update after moving yet.
7. Click wind dots and confirm popup uses safe labels:
   - `Vindhviða`
   - `Lofthiti`
8. Toggle `Fela vegakerfi` and check whether blue vector lines remain visible/understandable.

Do not broaden `road-intelligence-v1`, run SQL, deploy, or test on production without explicit approval.

## Route Intelligence Check

This is now real Road Intelligence foundation work.

- Route/landshluti touched: country-wide Iceland road map, currently viewport bbox only.
- Source: Vegagerðin ArcGIS `faerd` FeatureServer, assumed layer 0.
- Current implementation is still provider-specific and experimental, but it is moving toward provider-neutral segment logic.
- No Supabase writes, no user GPS, no raw user route geometry, no addresses, no personal travel data.
- Next reusable domain step should be to map upstream `faerd` fields into a Teskeið-owned road segment status shape in `lib/road-intelligence/`.
- `IcelandRoadmap.md` does not need an update for the current scaffolding, but should be updated when canonical segment/status concepts are named.

## Uncertainty

Confidence is high that v264 is a good prototype milestone.

Confidence is medium on the assumed `faerd` layer 0 and field schema. The endpoint/layer still needs live browser confirmation from Network response JSON.

Confidence is high that bbox hardening and moveend refresh are the right next bounded implementation before condition coloring.
