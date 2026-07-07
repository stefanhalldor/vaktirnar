# todo-067 v104 - Codex review: v103 needs always-visible timeline scrubber and status filters

Created: 2026-07-06 21:01
Timezone: Atlantic/Reykjavik
Author: Codex
Reviews: `2026-07-06-2052-todo-067-v103-claude-v102-done.md`
Relevant TODO: `todo-067` Ferðalagið weather work

## Findings

### P1 - No scrubber in single-departure results, so the experience is still not truly interactive

Stebbi's screenshot shows Garðabær → Akureyri in single-departure mode. The result has:

- interactive map
- many route weather points
- next-caution text
- no timeline scrubber to browse time

Current code explains why:

- `DepartureHeatmap` renders only when `result.travelPlan.outbound.windowMode` is true and there are multiple candidates.
- In single-departure mode, `travelPlan.outbound.candidates` contains only the selected departure candidate.
- `nextCaution` scans future candidates internally, but exposes only the first non-green future point, not the whole timeline candidate list.

This means v103 added the right data primitives for selected-candidate map coloring, but the UI still hides them in the most natural use case: "I am leaving now, show me what happens later."

Required fix:

- Always show a time scrubber/timeline when the route result has enough forecast horizon, even in single-departure mode.
- If `windowMode` is false, generate and expose a future route timeline candidate list from current/earliest departure forward.
- The `nextCaution` line can stay as a summary, but it must not replace the scrubber.

Suggested naming:

```ts
outbound.timelineCandidates?: TravelCandidate[]
```

or:

```ts
outbound.futureCandidates?: TravelCandidate[]
```

Keep `outbound.candidates` semantics if changing it would risk regressions. For `windowMode`, the timeline can simply use `outbound.candidates`.

### P1 - The scrubber must control the map, not just sit above it

The desired interaction is:

1. User selects a time chip in the scrubber.
2. Map markers recolor for that selected time.
3. Worst point for that selected time is highlighted.
4. Detail panel updates to that selected time.
5. Green selected time shows green route state, not default/worst from another time.

v103 has the map prop wiring for selected candidate point statuses. The missing piece is making a timeline candidate available and visible in single-departure mode.

### P1 - Add status filters for the scrubber

Stebbi wants the scrubber to be filterable by colors/status.

Example:

- All currently visible selected points are green.
- But the route has yellow/red times later.
- User unchecks green.
- Scrubber now shows only time slots that contain warnings, e.g. yellow/red/no-data.

This is good product thinking. It turns the timeline from "scroll through lots of green" into "jump me to the interesting bits."

Recommended behavior:

- Add filter chips/toggles above or integrated with the scrubber:
  - `Allt`
  - `Gott (n)`
  - `Varúð (n)`
  - `Ekki mælt (n)`
  - `Engin gögn (n)` if relevant
- Counts should reflect the currently active timeline set, not just the selected slot.
- Filter should hide/show time chips.
- If green is unchecked, only non-green timeline slots remain visible.
- If all filters are unchecked, restore `Allt` or prevent the last active filter from being disabled.
- Future statuses/colors should be data-driven enough that adding another status does not require rewriting the whole component.

Status source:

- Use `TravelCandidate.status` for slot-level filtering and counts.
- That should match "does this time contain any yellow/red/no-data point?" because candidate status is the aggregate/worst route status.
- If later we add segment-specific statuses, still keep the slot filter based on aggregate candidate status.

### P2 - The scrubber should show counts and make warnings discoverable

Add count display so the user understands there are hidden interesting times:

- `Gott (18)`
- `Varúð (4)`
- `Ekki mælt (1)`

This matters because if the selected map is green, the user needs a visual cue that there are yellow/red times available without manually scrubbing every hour.

The next-caution line should also remain:

`Næst verður varasamt mið. 8. júl. kl. 20:55 · Úrkoma: 2.2 mm/klst yfir mörkum 2.0 mm/klst · 247 km frá Garðabær`

But next-caution is a summary. The filterable timeline is the interaction.

### P2 - Place the timeline where it feels connected to the map

Stebbi specifically says "scrubber neðst". Recommended mobile placement:

- Result card remains at top.
- Map appears.
- Timeline scrubber appears directly below the map, or as a compact bottom strip attached to the map section.
- Details for selected point/time appear below the scrubber or in the existing point detail panel.

Do not hide the scrubber inside "Af hverju?".

The scrubber is now primary interaction, not audit-only detail.

### P2 - The existing `DepartureHeatmap` may need to become a more general `RouteTimeline`

`DepartureHeatmap` is a good starting point, but the concept has grown:

- It is no longer only "departure heatmap".
- It also covers single-departure future scan.
- It needs filters.
- It needs day context.
- It controls the map.

Claude Code can either evolve `DepartureHeatmap` or introduce a wrapper/new component, e.g.:

```tsx
<RouteTimeline
  candidates={timelineCandidates}
  selectedIdx={...}
  onSelectIdx={...}
  statusFilters={...}
  onStatusFiltersChange={...}
/>
```

Keep scope pragmatic. Do not rewrite all weather UI if extending `DepartureHeatmap` is cleaner.

## Data model recommendation

### Single-departure timeline candidates

Currently `findNextCaution()` scans candidates but only returns the first caution.

Instead, extract the scan into a helper that can return:

```ts
type TimelineScan = {
  candidates: TravelCandidate[]
  scannedHours: number
  coverageLimited: boolean
}
```

Then:

- `nextCaution` can be derived from `timelineCandidates.find(c => c.status !== 'graent' && c.reasonCode !== 'no_data')`.
- Scrubber can render all `timelineCandidates`.
- No duplicate evaluation logic.

Suggested scan window:

- hourly, same as current `NEXT_CAUTION_STEP_S`
- from selected departure/current departure
- up to min forecast coverage and `NEXT_CAUTION_MAX_H`
- include the current selected departure as first chip if useful

### Window mode

When `latestArrivalBy` is set:

- existing `outbound.candidates` can be used as the timeline
- no need for separate future scan unless product needs both "arrival-window candidates" and "after-window future warnings"

### Return mode

Keep outbound and return timelines separate.

If return candidates exist, filters/counts apply per timeline section.

## UX details

### Filter behavior

Recommended initial state:

- all statuses visible
- selected slot remains selected if still visible after filter change
- if selected slot becomes hidden, select the first visible candidate after filtering, preferably the next non-green candidate

### Counts

Counts should come from all timeline candidates before filtering:

```ts
{
  graent: 18,
  gult: 4,
  rautt: 1,
  no_data: 0
}
```

Display only statuses that exist, except `Gott` can remain visible because it is the common hide/show toggle.

### Empty filtered state

If user hides green and there are no warnings:

`Engin varúð fannst á þessu tímabili.`

Offer a one-tap reset:

`Sýna allt`

### Map marker filtering

Be careful: filtering the scrubber should filter time chips, not hide route markers for the selected time.

The map should still show all route weather points for the selected visible time, colored by that time. Otherwise the user loses spatial context.

## Implementation notes

Likely files:

- `lib/weather/travel.ts`
- `lib/weather/types.ts`
- `components/weather/DepartureHeatmap.tsx` or new `components/weather/RouteTimeline.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/TravelAuditMap.tsx` only if selected-point semantics need adjustment
- `messages/is.json`
- `messages/en.json`
- tests in `lib/__tests__/weather-travel.test.ts`
- possible component tests if existing setup supports them

Important: do not duplicate `nextCaution` logic. Derive it from the same timeline scan if possible.

## Tests to add/update

1. Single-departure green result exposes multiple `timelineCandidates` when forecast coverage allows.
2. `nextCaution` is derived from first non-green timeline candidate.
3. Timeline candidate statuses include `pointStatuses` for map coloring.
4. `DepartureHeatmap`/`RouteTimeline` renders for single-departure result, not only `windowMode`.
5. Status counts are correct.
6. Hiding green leaves only yellow/red/no-data slots.
7. If selected slot is filtered out, selection moves to a valid visible slot.
8. Map gets selected candidate point statuses from the filtered/selected timeline slot.
9. Return timeline remains separate and has independent counts/filters.
10. No hardcoded Icelandic strings in English.

## Localhost checks for Stebbi

After implementation:

1. Open `/auth-mvp/vedrid`.
2. Test Garðabær → Akureyri with no latest-arrival time.
3. Confirm a time scrubber appears near/below the map even though this is single-departure mode.
4. Confirm the scrubber includes future times around the next-caution period.
5. Confirm status filters show counts, e.g. `Gott (n)`, `Varúð (n)`, `Ekki mælt (n)`.
6. Uncheck/hide `Gott`.
7. Confirm scrubber now shows only warning/no-data time slots.
8. Tap a warning slot and confirm the map recolors/highlights the relevant route points.
9. Tap/show green again and confirm green slots return.
10. Confirm map still shows the full route context, not only filtered warning markers.
11. Test a route with no warnings and hide green:
    - expected: useful empty state and `Sýna allt`.
12. Test with latest-arrival window:
    - expected: existing window-mode timeline still works.
13. Test with return trip:
    - expected: outbound and return timelines/filters are separate.
14. Check mobile widths 360/390/430 px:
    - no horizontal page overflow
    - scrubber scrolls inside itself
    - filter chips wrap or scroll cleanly

## Guardrails

- No new met.no calls for scrubber interactions.
- No browser calls to met.no.
- No raw met.no JSON in client payload.
- Do not hide route markers based on timeline filters; filters apply to time slots.
- Do not duplicate next-caution logic.
- Do not start Iceland-wide map in this pass.
- No SQL/migration.
- No production config/env changes.
- No commit/push/deploy unless Stebbi explicitly asks.

## Codex conclusion

v103 moved the data/model work forward, but the product experience still misses the thing that makes it feel alive: an always-available route timeline scrubber.

Claude Code should make the timeline visible in single-departure mode and add status filters with counts. That is the interaction Stebbi is describing: "show me only the times where something is not green, then let me tap them and see where/why on the map."

No code changes were made in this review.
