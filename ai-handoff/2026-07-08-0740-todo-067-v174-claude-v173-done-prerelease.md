# TODO-067 v174 - Claude Code - v173 implemented, prerelease

Created: 2026-07-08 07:40
Timezone: Atlantic/Reykjavik
From: Claude Code
To: Stebbi (localhost review) / Codex (prerelease review)
Status: Implementation complete. Type-check clean. 58 test files pass, 1858 tests passed.

## What was implemented

Handoff v173 — 11 items from the Codex prerelease review of v172.

---

## Change 1: Icelandic scrubber day labels

### Problem
`formatDayLabel` in `DepartureHeatmap.tsx` used `toLocaleDateString` which produced English-style dates ("Wed, Jul 8") even in Icelandic locale.

### Fix (`components/weather/DepartureHeatmap.tsx`)

Added `IS_WEEKDAY_SHORT` and `IS_MONTH_SHORT` arrays. When locale starts with `is`, produces `Mið (8. júl)` format. English locale unchanged.

---

## Change 2: Calmer selected-slot detail box

### Problem
SlotDetail header showed bold text with full date and long arrow separator. Metric lead was just the metric name (e.g., `Vindur:`).

### Fix (`components/weather/DepartureHeatmap.tsx`)

- Header changed from bold `{date} kl. HH:MM — Komutími...` to calm `Brottför: kl. HH:MM · Komutími: kl. HH:MM`
- Metric lead changed from `{metricLabel}:` to `{tf('slotDetailWorstLead')}:` = "Mest krefjandi á þessum brottfarartíma" (IS) / "Most demanding at this departure time" (EN)

New translation key: `slotDetailWorstLead`

---

## Change 3: Filter pill semantics inverted — selected = show

### Problem
Both scrubber and map filter pills were modelled as "hide selected statuses". User clicking `Óþægilegt` would hide uncomfortable slots, opposite of what was expected.

### Fix (`components/weather/DepartureHeatmap.tsx` + `components/weather/TravelAuditMap.tsx` + `app/auth-mvp/vedrid/FerdalagidClient.tsx`)

Renamed controlled prop from `hiddenStatuses` to `visibleStatuses` and `onHiddenStatusesChange` to `onVisibleStatusesChange` in both DepartureHeatmap and TravelAuditMap.

New semantics:
- Empty set = show all (no pill active, all neutral)
- Non-empty set = show only those statuses
- Clicking a pill adds/removes from visibleStatuses
- Pills highlight (solid border, muted background) when active; dim when another filter is active

State names updated in FerdalagidClient:
- `outboundHiddenStatuses` → `outboundVisibleStatuses`
- `returnHiddenStatuses` → `returnVisibleStatuses`
- `mapOutboundHiddenStatuses` → `mapOutboundVisibleStatuses`

Auto-select useEffects updated: re-select from visible candidates when filter changes. The new result useEffect also resets all visible status sets to empty (show all) on new result.

---

## Change 4: Map filter pills actually hide markers

### Problem
Filtered map points were set to `opacity: 0.2` — they remained visible and cluttered the map.

### Fix (`components/weather/TravelAuditMap.tsx`)

Changed from `marker.setOpacity(isFiltered ? 0.2 : 1.0)` to `marker.setVisible(markerVisible)`. Route endpoints (origin, destination) always remain visible. Non-endpoint markers and their forecast point markers are hidden (`setVisible(false)`) when not in `visibleStatuses`. Time chips are also not rendered for hidden points.

---

## Change 5: Combined card restructured

### Problem
Card order was wrong. `result.svar` shown as main sentence (server-derived, not slot-reactive). `Næst verður varasamt` paragraph present. `Af hverju?` present.

### Fix (`app/auth-mvp/vedrid/FerdalagidClient.tsx`)

New card structure:
1. `Brottfarartíminn þinn í Teskeið` title
2. `DepartureHeatmap` scrubber (with selected-slot detail inside it)
3. Dynamic status sentence (colored dot + text derived from `activeOutboundCandidate.status`)
4. Ferry note / window badges / custom thresholds (optional)
5. Coverage text
6. `Þetta er veðurmat, ekki umferðar- og farartrygging.` disclaimer

Removed:
- `result.svar` (server-derived sentence gone)
- `Næst verður varasamt...` next caution paragraph
- `Af hverju?` disclosure toggle

---

## Change 6: Dynamic status sentence from selected slot

### Problem
Status dot/label used `result.stada` (server-computed for the original departure). Selecting a later slot did not update the sentence.

### Fix (`app/auth-mvp/vedrid/FerdalagidClient.tsx`)

`derivedStatus = activeOutboundCandidate?.status ?? result.stada`

Status sentence uses new translation keys:
- green: `Brottför kl. {time} lítur vel út`
- yellow: `Brottför kl. {time} er óþægileg`
- red: `Ekki mælt með brottför kl. {time}`

New translation keys: `departureStatusGreen`, `departureStatusYellow`, `departureStatusRed`

Sentence updates whenever user selects a different scrubber slot.

---

## Change 7: First scrubber slot selected by default

### Problem
`selectedHeatmapIdx` started as `null` — no slot was pre-selected.

### Fix (`app/auth-mvp/vedrid/FerdalagidClient.tsx`)

Added a `useEffect` on `result?.id` that sets `selectedHeatmapIdx = 0` (first slot) when a new result arrives and candidates exist. This ensures the status sentence always has an active candidate to display from the moment the result appears.

---

## Change 8: Route summary includes distance and duration

### Problem
Route summary above the card only showed `Garðabær → Egilsstaðir`.

### Fix (`app/auth-mvp/vedrid/FerdalagidClient.tsx`)

`RouteSummary` component now accepts optional `distanceKm` and `durationMinutes` props. When available, appended as `(636 km, 460 mín.)`. Uses `routeDurationMinsUnit` translation key (IS: "mín.", EN: "min.").

New translation key: `routeDurationMinsUnit`

---

## Change 9: IssueAuditCard threshold delta guard

### Problem
`IssueAuditCard` rendered `aboveThresholdWithExcess` even when `issue.value <= issue.thresholdValue`, producing negative "yfir mörkum" text.

### Fix (`app/auth-mvp/vedrid/FerdalagidClient.tsx:1135`)

Added `issue.value > issue.thresholdValue` guard before rendering the excess text.

---

## Translation keys added

In both `messages/is.json` and `messages/en.json` under `teskeid.vedrid.ferdalagid`:
- `departureStatusGreen`
- `departureStatusYellow`
- `departureStatusRed`
- `weatherDisclaimer`
- `slotDetailWorstLead`
- `routeDurationMinsUnit`

---

## Files changed

- `components/weather/DepartureHeatmap.tsx`
- `components/weather/TravelAuditMap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`

## Not changed

- No SQL, Supabase, RLS, auth, migration, production data, secrets, billing or deployment changes.
- `lib/weather/travel.ts`, `lib/weather/types.ts`: unchanged.
- Return leg scrubber: still out of scope.
- No new tests added (no new pure logic seams introduced).

---

## Test results

```
Test Files  58 passed (58)
Tests  1858 passed | 27 skipped | 8 todo
```

TypeScript: clean (no errors).

---

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost.

Use route: **Garðabær → Egilsstaðir** (long route, mixed weather slots).

1. **Card structure**
   - Expected: one combined card above the map.
   - Expected: title `Brottfarartíminn þinn í Teskeið` is the first element inside the card.
   - Expected: scrubber directly below the title.
   - Expected: no `Af hverju?` in the card.
   - Expected: no `Næst verður varasamt...` paragraph.
   - Expected: `Þetta er veðurmat, ekki umferðar- og farartrygging.` near the bottom of the card.

2. **Route summary above card**
   - Expected: `Garðabær → Egilsstaðir (636 km, 460 mín.)` or similar with real numbers.

3. **First slot selected by default**
   - Expected: the first scrubber slot is highlighted immediately when result appears.
   - Expected: the status sentence shows e.g. `Brottför kl. 06:00 lítur vel út`.

4. **Status sentence updates with slot selection**
   - Select a green slot: `Brottför kl. HH:MM lítur vel út`
   - Select a yellow slot: `Brottför kl. HH:MM er óþægileg`
   - Select a red slot: `Ekki mælt með brottför kl. HH:MM`
   - Expected: status dot color also updates.

5. **Icelandic day labels in scrubber**
   - Expected: day separator labels show `Þri (8. júl)`, `Mið (9. júl)` etc.
   - Expected: no `Wed, Jul 8` visible in IS locale.

6. **Selected slot detail box**
   - Click a scrubber slot.
   - Expected: `Brottför: kl. HH:MM · Komutími: kl. HH:MM`
   - Expected: `Mest krefjandi á þessum brottfarartíma: X m/s`

7. **Scrubber filter semantics**
   - Start: no pills active, all slots visible.
   - Click `Óþægilegt`: only yellow slots visible in scrubber.
   - Click `Hættulegt` additionally: yellow + red slots visible.
   - Click `Óþægilegt` again: only red visible.
   - Click `Hættulegt`: no filter active, all visible.

8. **Map filter semantics**
   - Start: all map points visible.
   - Click `Óþægilegt` map pill: only yellow markers shown on map (green markers disappear — not just faded).
   - Click `Gott veður` map pill additionally: green + yellow markers shown.
   - Click `Sýna allt` button: all markers shown.

9. **Map markers truly hidden**
   - When a map filter is active, filtered-out route-weather markers are invisible, not just faded.
   - Route endpoints (origin, destination) always remain visible.

10. **No negative threshold text**
    - Select a green slot.
    - Expected: no `(-X yfir X m/s mörkum)` text anywhere in the UI.
