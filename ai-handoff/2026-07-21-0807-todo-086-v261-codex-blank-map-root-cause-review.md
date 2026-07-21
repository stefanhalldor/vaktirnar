# Review: blank MapLibre prototype likely CSS/container root cause

Created: 2026-07-21 08:07
Timezone: Atlantic/Reykjavik
Agent: Codex
Relevant TODO: 086
Type: Diagnostic review for Claude Code

---

## Findings

### High: `maplibregl-map` likely overrides the Tailwind `absolute` positioning on the map container

Evidence:

- Stebbi's console shows the container before `new Map()` is real: `clientW: 546`, `clientH: 879`.
- Immediately after `new Map()`, the canvas is `styleW: '546px'`, `styleH: '300px'`, backing store `1638 x 900` at DPR 3.
- After `requestAnimationFrame(() => map.resize())`, the canvas remains `1638 x 900`.
- Therefore MapLibre is consistently seeing the map viewport as `546 x 300`, not `546 x 879`.

Current code in `components/weather/RoadMapPrototypeMap.tsx` renders:

```tsx
return (
  <div className="absolute inset-0">
    <div ref={containerRef} className="absolute inset-0" />
    ...
  </div>
)
```

MapLibre adds `maplibregl-map` to the `containerRef` element itself. MapLibre CSS includes:

```css
.maplibregl-map {
  overflow: hidden;
  position: relative;
}
```

Because the `maplibre-gl.css` import can be ordered after Tailwind utilities, `.maplibregl-map { position: relative; }` can override Tailwind's `.absolute { position: absolute; }` on the same element. When that happens, `inset-0` no longer makes the element fill the parent. The element can collapse into the default canvas/content height, which matches the observed `300px`.

Recommended minimal fix:

```tsx
return (
  <div className="absolute inset-0">
    <div ref={containerRef} className="h-full w-full" />
    ...
  </div>
)
```

Keep the outer wrapper absolute. Let MapLibre own `position: relative` on its actual container, but give that container explicit `h-full w-full`. This avoids fighting MapLibre's CSS and should let `map.resize()` see `546 x 879`.

Alternative if Claude wants an even stricter fix:

```tsx
<div ref={containerRef} style={{ width: '100%', height: '100%' }} />
```

Do not rely on `absolute inset-0` on the exact element MapLibre mutates.

### Medium: `mapDivFound: false` diagnostic is probably a false alarm

Current diagnostic:

```ts
const mapDiv = container?.querySelector('.maplibregl-map') as HTMLElement | null
```

But `.maplibregl-map` is added to `containerRef.current` itself, not necessarily a descendant. `querySelector()` does not match the element it is called on. So `mapDivFound: false` does not prove the MapLibre wrapper is missing.

Better diagnostic:

```ts
const container = containerRef.current
const mapDivFound = container?.classList.contains('maplibregl-map')
const mapContainerRect = container?.getBoundingClientRect()
```

Also log:

```ts
map.getContainer().clientWidth
map.getContainer().clientHeight
map.getCanvas().style.width
map.getCanvas().style.height
```

### Medium: further tile/provider changes are probably premature until the container height is fixed

Claude already tried:

- LMÍ WMS
- LMÍ WMTS/GWC
- LMÍ WMS proxy
- CartoDB Voyager
- resize attempts

Now that CartoDB Voyager is used, a fully blank map is unlikely to be caused only by LMÍ layer choice. Also, if `stationCount` reaches 201, the station GeoJSON layer path is mostly working. The strongest confirmed mismatch is the viewport height: MapLibre canvas is locked at `300px` while the visible panel is `879px`.

Fix the MapLibre container first. Only after the canvas height matches the container should Claude continue debugging Carto tile requests, Vegagerðin overlay transparency, or MapLibre/WebGL.

### Low: possible secondary issue with an opaque white Vegagerðin raster overlay

If the container fix makes basemap visible only when the road overlay is hidden, then `map-proxy` may be returning an opaque/white raster. That is a separate issue. It should not be the first target because station circles should still render above the raster layer, but it is worth checking after the height fix.

## Files Reviewed

- `ai-handoff/2026-07-21-0005-todo-086-v259-claude-lmi-wmts-proxy-station-popup.md`
- `ai-handoff/2026-07-21-0035-todo-086-v260-claude-blank-map-diagnostics.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`
- `app/api/teskeid/road-intelligence/lmi-tile/route.ts`
- `lib/road-intelligence/lmiTileProxy.ts`
- `package.json`
- `node_modules/maplibre-gl/dist/maplibre-gl.css` relevant `.maplibregl-map` rule

## Commands Run

- `Get-Content -Encoding UTF8 'ai-handoff\README.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\2026-07-21-0005-todo-086-v259-claude-lmi-wmts-proxy-station-popup.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\2026-07-21-0035-todo-086-v260-claude-blank-map-diagnostics.md'`
- `Get-Content -Encoding UTF8 'components\weather\RoadMapPrototypeMap.tsx'`
- `Get-Content -Encoding UTF8 'app\api\teskeid\road-intelligence\lmi-tile\route.ts'`
- `Get-Content -Encoding UTF8 'package.json'`
- `Select-String -Path 'node_modules\maplibre-gl\dist\maplibre-gl.css' -Pattern 'maplibregl-map|maplibregl-canvas' -Context 0,3`
- `rg -n "maplibregl-map|RoadMapPrototype|roadMapPrototypeSubtitle|road-map-prototype" app components messages lib`
- `Get-Content -Encoding UTF8 'lib\road-intelligence\lmiTileProxy.ts'`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- `git status --short`
- `Get-ChildItem -File 'ai-handoff' | Sort-Object Name | Select-Object -Last 12 Name,Length`

No tests were run in this review. No code files were changed.

## Suggested Next Step For Claude Code

Make the minimal container fix:

1. In `components/weather/RoadMapPrototypeMap.tsx`, change the `containerRef` element from `className="absolute inset-0"` to `className="h-full w-full"`.
2. Keep the outer wrapper as `className="absolute inset-0"`.
3. Update the DOM diagnostic so it checks `container.classList.contains('maplibregl-map')` and logs `map.getContainer().clientHeight`.
4. After that, hard reload `/auth-mvp/vedrid/road-map-prototype`.
5. Confirm canvas style height changes from `300px` to approximately the visible map area height (`~879px` in Stebbi's current viewport).

Only if this does not fix the blank map should Claude move on to:

- Network checks for CartoDB tile requests.
- Temporarily removing the Vegagerðin raster source/layer to rule out an opaque overlay.
- Testing MapLibre v4/v5 rendering differences.

## Localhost Checks For Stebbi

After Claude applies the container fix, Stebbi should test:

1. Open `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`.
2. Hard refresh with DevTools open.
3. In console, check:
   - `container at init` still has real height.
   - `canvas after new Map()` now shows `styleH` close to the visible map area height, not `300px`.
   - `canvas after rAF resize` backing height should be roughly `styleH * DPR`.
4. Visually confirm:
   - Basemap is visible.
   - Wind dots are visible.
   - Toggle still appears.
   - Popup still opens on a station dot.
5. If map is still white but `styleH` is fixed, check Network for CartoDB tile requests and report statuses/content types to Claude.

No SQL, migration, Supabase writes, feature-access changes, commit, push, deploy, or production changes are needed for this diagnostic fix.

## Route Intelligence Check

This review touches only the experimental Road Intelligence map prototype UI/container. It does not add route segments, control points, station matching rules, route caching, or Supabase route data. `IcelandRoadmap.md` does not need an update for this specific CSS/container diagnosis.

## Uncertainty

Confidence is high that the `300px` canvas height is a real problem and that the `absolute inset-0` plus `.maplibregl-map { position: relative }` interaction is the most likely root cause. Confidence is medium that this is the only cause of the blank map. If the container fix makes the canvas full height but the map remains white, the next likely causes are missing Carto tile requests or an opaque raster overlay.
