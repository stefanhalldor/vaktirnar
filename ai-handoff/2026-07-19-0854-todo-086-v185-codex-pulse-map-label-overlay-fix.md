# 2026-07-19 08:54 - TODO 086 v185 - Codex pulse map label overlay fix

Created: 2026-07-19 08:54
Timezone: Atlantic/Reykjavik

## Context

Follow-up after `2026-07-19-0930-todo-086-v183-claude-v182-vegagerdin-filter-consistency` and Codex v184 review.

Stebbi saw the Vegagerðin pulse context map and clarified:

- The station names on the pulse map are much too visually heavy.
- Stebbi only wanted a small station name next to the point on the map itself.
- The current fat overlay/legend over the map must be removed.

Screenshot symptom: `ProviderStationContextMap` shows a top-left overlay containing:

- `Vegagerðin Hafnarfjall`
- `Veðurstofan Hvanneyri (13.1 km) · Skarðsheiði Miðfitjahóll (9.6 km) · Hafnarfjall (0.0 km)`

This eats map space and reads like a UI card sitting on top of the map.

## Finding

### Medium - pulse context map uses a legend overlay instead of marker-adjacent labels

File:

- `components/weather/ProviderStationContextMap.tsx:105-122`

The component explicitly renders an absolute overlay:

```tsx
<div className="absolute top-2 left-2 max-w-[55%] ...">
  <LegendRow ... />
</div>
```

This was introduced to make names visible on mobile without hover, but it overshoots the actual product need. The map should show spatial context; it should not be covered by a summary box.

## Recommended Claude Code handoff

```md
## v185: Fix Vegagerðin pulse context-map station labels

Context:
Stebbi clarified that the pulse context map should not have a large top-left legend/overlay. The request was only to show small station names next to their markers on the map itself.

Keep this extremely scoped. No new data work, no SQL, no route-memory changes, no Google cost changes.

### Required change

1. Remove the legend overlay from `ProviderStationContextMap`.
   - Delete the absolute top-left legend block in `components/weather/ProviderStationContextMap.tsx`.
   - Remove `LegendRow` if it becomes unused.
   - Update the component comment so it no longer claims names are shown in a legend.

2. Show station labels as small marker-adjacent labels, not as a card overlay.
   - Preferred: extend/reuse `IcelandOverviewMap` marker contract with an optional lightweight visible label, e.g. `inlineLabel?: string` or `showLabel?: boolean`.
   - Use that only for `ProviderStationContextMap` for now, not the full `/vedrid` overview map.
   - The label should be tiny and unobtrusive:
     - next to or slightly above the marker
     - no large card background
     - no provider heading
     - no long joined list
     - truncate or hide if it would overlap badly
   - Primary Vegagerðin marker can show its station name.
   - Nearby Veðurstofan markers can show station name only if there are few enough to remain readable. If all three names crowd the map, prefer showing the primary name and rely on marker title/accessibility for nearby names.

3. Keep accessibility and hover/title intact.
   - Marker `title` should still include the full station name.
   - Do not make visible text the only accessible label.

4. Avoid a bigger redesign.
   - Do not add a bottom list, accordion, modal, or new station selector in this pass.
   - Do not touch route-memory, `/vedrid` filtering, SQL, or chat logic.

### Design guidance

This should follow `Design.md`:

- no text/control overlap
- no floating card covering a map unless it is an actual independent tool
- mobile-first at 360/390/460 px
- text must not overflow or obscure Google attribution/controls

### Suggested implementation shape

If using classic Google `Marker`, test whether `label` is enough:

- `marker.setLabel({ text: label, className: '...', color: '#111827' })`

If classic marker labels are too limited visually, keep it simpler:

- remove the overlay now
- keep marker `title`
- add a very small custom overlay/AdvancedMarker only in a follow-up after visual testing

The important release fix is removing the ugly overlay. The small adjacent label is desirable, but not at the cost of reintroducing clutter.

### Tests / checks

Run:

- `npm run type-check`
- If marker contract/types change: targeted tests that cover weather map types/components if available.
- `npm run build` before release candidate.

### Localhost checks for Stebbi

1. Open a Vegagerðin pulse page, for example `/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]`.
2. Expected: no large top-left station-name overlay/card appears on the map.
3. Expected: the selected Vegagerðin marker is still visible and centered/framed.
4. Expected: nearby Veðurstofan markers are still visible.
5. Expected: any visible station name is a small marker-adjacent label, not a legend box.
6. Expected: labels do not cover Google attribution, zoom controls, map controls, or each other in an ugly way at mobile width.
7. Click/hover/tap markers if supported:
   - expected: full station names remain discoverable through title/marker behavior.
8. Regression check: `/vedrid` overview map should not suddenly show labels on every station.
```

## Notes

I would attach this to the same release-prep stream as v184. It is small enough to do before release because it removes an obviously bad UI artifact and does not change data, auth, SQL, billing, or routing behavior.

## Design check

Relevant `Design.md` rules:

- Text may not overlap controls or obscure content.
- Avoid floating cards/overlays unless they are genuinely useful tools.
- Mobile-first at 360/390/460 px.
- Controls and labels should not create horizontal overflow.

The current legend violates the spirit of those rules by covering a large portion of a small map.

## Route intelligence check

- Route/road segment touched: none.
- Provider context touched: Vegagerðin station pulse page with nearby Veðurstofan context stations.
- New route knowledge: none.
- Provider-neutrality: keep `ProviderStationContextMap` provider-neutral; do not hardcode only Vegagerðin except where caller passes props.
- Google cost: no new Google calls.
- Privacy: no new stored data.

## SQL / migration status

No SQL changes. No migrations should be written or run for this UI fix.

## Commands run by Codex

- Searched for pulse/map/provider station components.
- Read:
  - `components/weather/ProviderStationContextMap.tsx`
  - `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx`
  - relevant `IcelandOverviewMap` and map marker type snippets
  - `Design.md` relevant sections
  - `ai-handoff/README.md`
- No tests run by Codex.

