# TODO 086 / v225 - Codex handoff - scrubber prev/next arrows

**Created:** 2026-07-20 09:11 Atlantic/Reykjavik  
**Agent:** Codex  
**Related area:** `/vedrid`, `/vedrid/ferdalagid`, forecast/time scrubbers  
**Purpose:** Handoff for Claude Code to review and implement. No code was changed by Codex in this handoff.

## User Request

Stebbi feels the map scrubber is missing clear `næsta` and `tilbaka` controls.

Current experience:

- The time scrubber is horizontally scrollable.
- The visible/native horizontal scrollbar can move the row, but it does not actually choose the previous or next time slot.

Requested behavior:

- The arrows that currently feel like they control the horizontal scrollbar should instead work as previous/next selection controls.
- In practice: add explicit left/right arrow buttons for the scrubber.
- Clicking left selects the previous available slot.
- Clicking right selects the next available slot.
- The selected slot should become active and the map should update accordingly.

## Current Code Context

Files inspected:

- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/ForecastTimeScrubber.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `Design.md`
- `ai-handoff/2026-07-20-0910-todo-086-v224-claude-v223-done-prerelease.md`

Findings:

- `WeatherSourceTimeSelector` is the main `/vedrid` source/time selector under the map:
  - fixed left `Vegagerðin / Núna`
  - scrollable right forecast slot list
  - uses `overflow-x-auto`
  - calls `onModeChange('now' | timeMs)`
- `DepartureHeatmap` is the travel-result departure scrubber in `/vedrid/ferdalagid`:
  - filters candidates by status
  - renders a horizontally scrollable row via `overflow-x-auto`
  - calls `onSelectIdx(realIdx === selectedIdx ? null : realIdx)`
- `ForecastTimeScrubber` exists as a compact generic forecast scrubber, but appears not to be the primary rendered `/vedrid` selector right now. It is still worth keeping aligned if Claude touches shared scrubber behavior.
- There are no custom arrow buttons in these scrubber components today. The current "arrows" Stebbi refers to are likely the native scrollbar controls/affordance or expected controls missing from the component.

## Recommended Scope

Keep this as a small UI improvement.

Primary implementation target:

1. `components/weather/WeatherSourceTimeSelector.tsx`

Secondary implementation target:

2. `components/weather/DepartureHeatmap.tsx`

Optional only if it is actively used or easy to align:

3. `components/weather/ForecastTimeScrubber.tsx`

Do not change backend, route memory, SQL, auth, RLS, provider data, or weather classification.

## Product Behavior

### `/vedrid` source/time selector

Expected controls:

- Left arrow: previous mode.
- Right arrow: next mode.

Mode order:

1. `now`
2. forecast slot 0
3. forecast slot 1
4. forecast slot 2
5. ...

Behavior:

- If active mode is `now`, left arrow should be disabled.
- If active mode is the last forecast slot, right arrow should be disabled.
- If active mode is a forecast slot, left moves to previous forecast slot, or `now` when the selected forecast slot is the first one.
- If active mode is `now`, right moves to the first forecast slot.
- If `nowDisabled` is true, do not navigate to `now`; the first enabled item should be the first forecast slot.
- If forecast slots are loading or empty, forecast navigation should not break.

After selection:

- Call existing `onModeChange(nextMode)`.
- Ensure the newly selected forecast button is scrolled into view.
- The map should update to the chosen time exactly as if the user tapped the dot.

### `/vedrid/ferdalagid` result scrubber

Expected controls:

- Left arrow: previous filtered candidate.
- Right arrow: next filtered candidate.

Important:

- Use the filtered visible list, not raw candidate index order, because status filters can hide slots.
- If no slot is selected:
  - right arrow should select the first visible slot
  - left arrow can select the last visible slot or be disabled. Codex recommends disabled for predictability.
- If selected slot is hidden by filter, current code already deselects. Arrows should then behave from the no-selection state.
- Keep the existing behavior where tapping an already-selected slot toggles it off. Arrow navigation should not toggle off; it should move selection.

After selection:

- Call existing `onSelectIdx(nextRealIdx)`.
- Ensure selected slot scrolls into view.
- Existing parent map-sync in `FerdalagidClient` should update the map.

## UI Design Guidance

From `Design.md`:

- Use icon buttons for familiar actions when possible.
- Use Lucide icons.
- Touch targets should generally be at least 40x40 px.
- Controls must not cause horizontal overflow on 360-460 px mobile.
- Loading/disabled states should not shift layout.

Suggested UI:

- Use `ChevronLeft` and `ChevronRight` from `lucide-react`.
- Place arrows at the left/right edges of the scrubber row, outside the horizontally scrollable content.
- Use compact icon buttons with stable dimensions, for example `h-9 w-9` or `h-8 w-8` if space is tight.
- Disabled arrows should be visibly muted and non-clickable.
- Add `aria-label` text through message keys.

Potential Icelandic labels:

- `sourceTimePrevious`: `Fyrri tími`
- `sourceTimeNext`: `Næsti tími`
- `timelinePrevious`: `Fyrri brottför`
- `timelineNext`: `Næsta brottför`

Add English equivalents in `messages/en.json`.

## Implementation Notes

### WeatherSourceTimeSelector

Likely file:

- `components/weather/WeatherSourceTimeSelector.tsx`

Recommended steps:

1. Import:
   - `useRef`
   - `useEffect`
   - `ChevronLeft`
   - `ChevronRight`
2. Build an ordered array:

```ts
const selectableModes: Array<'now' | number> = [
  ...(nowDisabled ? [] : ['now' as const]),
  ...forecastSlots.map(slot => slot.timeMs),
]
```

3. Find active index:

```ts
const activeIdx = selectableModes.findIndex(mode => mode === activeMode)
```

4. Implement:

```ts
function selectRelative(delta: -1 | 1) {
  if (selectableModes.length === 0) return
  const baseIdx = activeIdx >= 0 ? activeIdx : delta > 0 ? -1 : selectableModes.length
  const next = selectableModes[baseIdx + delta]
  if (next !== undefined) onModeChange(next)
}
```

5. Disable buttons at boundaries.
6. Store button refs by mode or query by `data-time-mode`, and call `scrollIntoView({ inline: 'center', block: 'nearest' })` after active mode changes.

Be careful:

- Avoid scrollIntoView on first render if it causes jumpy page scroll. Use `block: 'nearest'` and target only the horizontal scroll container child.
- Do not auto-scroll page vertically.
- Keep existing source selector layout stable.

### DepartureHeatmap

Likely file:

- `components/weather/DepartureHeatmap.tsx`

Recommended steps:

1. Import:
   - `useEffect`
   - `useRef`
   - `ChevronLeft`
   - `ChevronRight`
2. Since `filteredWithIdx` already exists, navigate through it:

```ts
const selectedFilteredIdx = selectedIdx === null
  ? -1
  : filteredWithIdx.findIndex(item => item.realIdx === selectedIdx)
```

3. Left disabled when `selectedFilteredIdx <= 0`.
4. Right disabled when:
   - no visible slots, or
   - selected filtered index is the last visible slot.
   - if `selectedIdx === null`, right should be enabled when there is at least one visible slot.
5. Arrow selection:

```ts
function selectRelative(delta: -1 | 1) {
  if (filteredWithIdx.length === 0) return
  const baseIdx = selectedFilteredIdx >= 0 ? selectedFilteredIdx : -1
  const next = filteredWithIdx[baseIdx + delta]
  if (next) onSelectIdx(next.realIdx)
}
```

6. Add refs to slot buttons keyed by `realIdx`, then scroll selected into view after `selectedIdx` changes.

Important:

- Arrow navigation should not toggle selected slot off.
- It should only move.
- Existing tap behavior on a selected dot can stay as-is.

## Edge Cases

Check these explicitly:

- `nowDisabled=true`
- no forecast slots
- active mode is not in current forecastSlots after refresh
- selected departure candidate hidden by status filter
- status filter leaves exactly one visible slot
- first slot labeled `Núna` in `DepartureHeatmap`
- mobile 360 px, 390 px, 460 px
- desktop with native scrollbar visible
- keyboard navigation: arrow icon buttons can be tabbed to and activated

## Supabase / Auth / RLS / Production Impact

No Supabase, SQL, RLS, auth, service-role, cron, storage, or production data change is needed.

This should be a client-only UI behavior change.

Do not run migrations.
Do not change grants or policies.
Do not alter route memory.

## Validation Recommendation

After implementation:

- `npm run type-check`
- `npm run test:run`
- `npm run build`

Optional focused tests:

- If component tests exist for weather UI, add tests for:
  - right arrow moves `now -> first forecast`
  - left arrow moves `first forecast -> now`
  - arrows disable at boundaries
  - `DepartureHeatmap` arrows navigate filtered candidates by visible order

If no existing component test setup is practical, manual localhost checks below are important.

## Localhost Checks For Stebbi

### `/vedrid`

1. Open `/vedrid`.
2. Make sure the source/time selector below the map is visible.
3. Start on `Vegagerðin / Núna`.
4. Click the right arrow.
5. Expected:
   - First Veðurstofan forecast slot becomes selected.
   - Map changes from Vegagerðin current observations to Veðurstofan forecast markers.
   - The selected dot is visible in the scrubber.
6. Click right arrow several times.
7. Expected:
   - Each click advances exactly one forecast slot.
   - The selected dot stays in view.
   - The map updates each time.
8. Click left arrow.
9. Expected:
   - Selection moves one slot back.
   - At the first forecast slot, left arrow returns to `Núna` if `Núna` is enabled.
10. At the beginning and end, the unavailable direction is disabled.

### `/auth-mvp/vedrid/ferdalagid`

1. Calculate a route that produces multiple departure slots.
2. Go to the result step where the departure scrubber appears.
3. Click right arrow.
4. Expected:
   - The next visible departure slot becomes selected.
   - The map and route issue details update to that slot.
5. Apply a status filter that hides some slots.
6. Click right/left arrows.
7. Expected:
   - Arrows move through visible slots only.
   - Hidden slots are skipped.
8. Clear filters.
9. Expected:
   - Arrow navigation continues through the full slot list.

### Mobile Check

Use 360 px, 390 px, and 460 px widths:

- Arrow buttons must not create horizontal page overflow.
- Native horizontal scrollbar may still exist inside the scrubber, but arrows should clearly act as previous/next selection.
- Touch targets should be easy to hit.
- No map/scrubber overlap.
- No layout jump when selection changes.

## Suggested Next Step

Claude Code should implement this as a compact UI patch, starting with `WeatherSourceTimeSelector`.

If time is tight:

1. Implement `/vedrid` source/time selector arrows first.
2. Then implement `DepartureHeatmap` arrows as the second part.

Do not bundle this with route-memory, overlay, SQL, or provider-data changes.
