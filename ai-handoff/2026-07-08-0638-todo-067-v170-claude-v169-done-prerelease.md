# TODO-067 v170 - Claude Code - v169 implemented, prerelease

Created: 2026-07-08 06:38
Timezone: Atlantic/Reykjavik
From: Claude Code
To: Stebbi (localhost review) / Codex (prerelease review)
Status: Implementation complete. Type-check clean. All 58 test files pass (1856 passed, 27 skipped, 8 todo).

## What was implemented

Handoff v169 (amending v166) — UI/content clarity pass for Ferðaveðrið.

### 1. Independent map visibility state

`FerdalagidClient.tsx`:
- Added `mapOutboundHiddenStatuses` state (default `new Set()`) — separate from `outboundHiddenStatuses`
- `mapHiddenStatuses` now uses `mapOutboundHiddenStatuses` exclusively; scrubber uses `outboundHiddenStatuses`
- Toggling the scrubber filters does not affect map markers and vice versa

### 2. Scrubber shows green by default

Both `outboundHiddenStatuses` and `returnHiddenStatuses` now default to `new Set()` (empty = show all).
The reset `useEffect` on new result also resets to empty set, not `new Set(['graent'])`.

### 3. `Allt` chip removed from DepartureHeatmap

`DepartureHeatmap.tsx`: Removed the "Allt" button block from the filter chip row.
Updated `timelineEmptyGreenHidden` in both message files to remove stale "Allt" reference.

### 4. Combined departure card above map

`FerdalagidClient.tsx`:
- New card above `TravelAuditMap` (rendered when `outboundDisplayCandidates.length > 1`)
- Heading: `combinedCardTitle` = "Brottfarartíminn þinn í Teskeið"
- Shows active departure and arrival time from `activeOutboundCandidate`
- Shows coverage text derived from `outboundDisplayCandidates[last].departureIso`
- Contains the outbound `DepartureHeatmap` (moved out of `belowMap`)
- `TravelAuditMap` no longer receives `belowMap` for the outbound heatmap

### 5. Coverage text with concrete end date

`FerdalagidClient.tsx`:
- `coverageEndDate = outboundDisplayCandidates[last].departureIso`
- New helper `formatCoverageDate(isoDate, locale)`: returns "föstudagsins 17. júlí" (IS) or "Friday, July 17" (EN) using UTC weekday/month arrays
- Coverage displayed as: "Teskeið hefur metið brottfarartíma á klukkutíma fresti fram til {date}."
- No hardcoded day count; derived from actual candidate data

### 6. Map visibility pills in TravelAuditMap

`TravelAuditMap.tsx`:
- New props: `onHiddenStatusesChange?` callback, `selectionResetSignal?: number`
- Pills shown below map canvas (when `onHiddenStatusesChange` is provided and map is loaded)
- Status counts derived from `selectedCandidatePointStatuses` (if slot selected) or `weatherPoints` (default)
- Toggling a pill that hides the currently selected point clears manual selection and auto-selects first visible
- "Sýna allt" button shown when all statuses are hidden
- Scrubber chips in `DepartureHeatmap` remain independent

### 7. Selection reset signal

`FerdalagidClient.tsx`: `mapSelectionSignal` state, incremented in `handleOutboundSelect`
`TravelAuditMap.tsx`: `useEffect` on `selectionResetSignal` clears `userSelectedRef`, `isManualSelection`, and resets `selectedIndex` to `initialSelectedIndex`

### 8. Two-mode PointDetailsPanel

`TravelAuditMap.tsx`:
- New `isManualSelection` state (set on marker/chip click, cleared on selection reset)
- Passed to `PointDetailsPanel` as prop
- Panel title:
  - Manual: "Valin veðurspá"
  - Auto, worst point: "Versti punktur" (destructive badge)
  - Auto, other point: "Veðurspá á leiðinni"
- All marker click listeners also call `setIsManualSelection(true)`
- "Fara á versta punkt" button also calls `setIsManualSelection(false)`

### 9. Reordered PointDetailsPanel fields

New order (both auto and manual modes):
1. Semantic title
2. Punktur x/y
3. Brottfarartími (from `summary.departureIso`, new field from `activeCandidate`)
4. Áætlað á leið (ETA at this route point)
5. Fjarlægð frá {origin}
6. Weather values (wind, gust, precip, decisive time)
7. Forecast point distance from road
8. Links

### 10. No negative threshold delta

`DepartureHeatmap.tsx` `SlotDetail`: added `m.value > thresh.thresholdValue` guard.
`TravelAuditMap.tsx` `PointDetailsPanel`: added `highlightedIssue.value > highlightedIssue.thresholdValue` guard.

### 11. `frá leiðinni` → `frá veginum`

`messages/is.json`:
- `forecastPointOnRoute`: "Spápunktur er nánast á veginum."
- `forecastPointDistanceMeters`: "Spápunktur er um {meters} m frá veginum."
- `forecastPointDistanceKilometers`: "Spápunktur er um {kilometers} km frá veginum."

`messages/en.json`: equivalent English updates to use "road" instead of "route".

### 12. New translation keys

Both `messages/is.json` and `messages/en.json`:
- `combinedCardTitle`
- `coverageTextUntilDate` (with `{date}` param)
- `mapFilterShowAll`
- `manualSelectedPointTitle`
- `defaultPointTitle`
- `pointDepartureLabel`

### 13. PointSummary.departureIso

`travelAuditMap.helpers.ts`:
- Added `departureIso?: string` to `PointSummary` type
- Set in `buildPointSummary` from `activeCandidate?.departureIso`

## Files changed

- `messages/is.json`
- `messages/en.json`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `components/weather/TravelAuditMap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

## Not changed (out of scope per v169)

- No return-leg scrubber changes
- No Supabase, SQL, RLS, auth, migration, production data, secrets, billing, or deployment changes
- No `Breyta forsendum` / `Byrja aftur` changes (already removed in c1dab54)

## Test results

```
Test Files  58 passed (58)
Tests  1856 passed | 27 skipped | 8 todo
```

TypeScript type-check: clean (no errors).

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost.

1. Calculate a route (e.g. Garðabær → Egilsstaðir).
   - Expected: combined card appears above the map with heading "Brottfarartíminn þinn í Teskeið".
   - Expected: card shows departure time and arrival time from the active candidate.
   - Expected: coverage text says "fram til {weekday} {day}. {month}" derived from last candidate.
   - Expected: the scrubber is inside the combined card, not below the map.

2. Check scrubber filter independence.
   - Expected: green/good departures are visible immediately (no `Allt` chip, no initial green filter).
   - Expected: toggling a scrubber filter does not hide/show map markers.

3. Check map visibility pills.
   - Expected: pill buttons with counts appear below the map canvas.
   - Expected: toggling a map pill hides/shows map markers only; scrubber is unaffected.
   - Expected: if all pills are hidden, "Sýna allt" appears.

4. Select a departure, then select another.
   - Expected: manual map point selection clears; lower card returns to auto mode.

5. Click a map point.
   - Expected: panel title changes to "Valin veðurspá".
   - Expected: field order: title, Punktur x/y, Brottfarartími, Áætlað á leið, Fjarlægð, weather, forecast distance, links.

6. Inspect a green departure.
   - Expected: no "yfir mörkum" text in SlotDetail or PointDetailsPanel.

7. Check forecast point wording.
   - Expected: "Spápunktur er um X m frá veginum" (not "frá leiðinni").

8. Check mobile widths 360px, 390px, 460px.
   - Expected: no horizontal overflow, no overlapping filters, no unreadable card text.

## Open items / follow-up

- Return leg scrubber: not in scope per v169, implement separately when return is added.
- Map visibility pills for return leg: similarly deferred.
- `nextForecast` display in PointDetailsPanel was kept but moved within the weather section; Stebbi can decide if it should be removed.
