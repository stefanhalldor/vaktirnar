# TODO-071 v014 - Claude handoff - explicit slot selection, metrics restored in default state

Created: 2026-07-08 17:01
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: v013 medium finding addressed. Type-check and tests green. Awaiting Stebbi localhost review and explicit commit/push approval.

## What was fixed

The v013 medium finding: active-candidate mode was kicking in immediately after route calculation (because auto-selection sets `selectedHeatmapIdx = 0`), causing wind/precip/temp to disappear from all route point rows by default. This undid the earlier TODO #71 goal of showing rich point details.

## Change

Added `userExplicitSlot: boolean` state (default `false`).

- `false` after route calculation, reset, ferry change, or origin/destination coordinate change.
- `true` only when the user clicks a heatmap slot via `handleOutboundSelect` or `handleReturnSelect` with a non-null index.
- `false` again when user deselects (null passed to either handler).

`RoutePointRow` now receives `activeCandidate` only when `userExplicitSlot && selectedCandidatePointStatuses !== undefined`. Otherwise it falls back to `summaryForWindow` — the full wind/precip/temp/forecastTime metrics are shown as before.

This means:

- **Default state after calculation:** `summaryForWindow` metrics visible for all rows (ETA, forecastTime, wind, precip, temp). No regression from pre-v012.
- **User explicitly clicks a heatmap slot:** active-candidate mode — ETA from selected slot, status/badge from delta-encoded point statuses, no stale `summaryForWindow` metrics. `no_data` rows show `heatmapNotAssessedDetail` copy.
- **User deselects (if supported):** back to `summaryForWindow` metrics.

## Files changed

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - New state: `userExplicitSlot`
  - Reset in: coordinate change useEffect, ferry handler, `handleSubmit`
  - Set true in: `handleOutboundSelect(idx !== null)`, `handleReturnSelect(idx !== null)`
  - `RoutePointRow` call: gates `activeCandidate` on `userExplicitSlot`

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 62 files, 1953 passed, 27 skipped, 8 todo — all green
```

## What is still NOT done (by design)

- No new unit tests for `RoutePointRow` active mode (Codex noted this as a low finding — can follow up).
- No commit or push — requires explicit approval.

## Localhost checks for Stebbi

Use Garðabær -> Akranes.

1. Open `/auth-mvp/vedrid`.
2. Calculate Garðabær -> Akranes.
3. Open `Allir spápunktarnir á leiðinni` immediately after calculation (do not click the heatmap).
4. Expected: all rows show ETA, forecast time, wind, precipitation, temperature — same as before TODO #71 active-candidate work. No regression.
5. Now click a heatmap slot that says `Ófullnægjandi gögn`.
6. Open `Allir spápunktarnir á leiðinni`.
7. Expected:
   - Row ETAs reflect the selected slot's departure time (not 16:xx for an 08:xx slot).
   - Rows with no data for this slot: gray card, "Ekki nóg gögn til að meta þennan brottfarartíma.", no stale wind/precip/temp.
   - Other rows: correct status color, ETA from selected slot. No summaryForWindow metrics (Option B limitation, accepted).
8. Click a green slot with enough data.
9. Expected: ETAs move to that slot's time context. Status/badge correct. No stale metrics.
10. If the UI allows deselecting the slot (e.g. clicking the selected slot again), do so.
11. Expected: rows return to full summaryForWindow metrics — ETA, forecastTime, wind, precip, temp all visible again.
12. Calculate a fresh route (or change destination).
13. Expected: default summaryForWindow rows shown immediately, no active-candidate mode until user clicks a slot.
14. Check mobile widths 360, 390 and 460 px for wrapping and no horizontal overflow.

No Supabase, auth, RLS, migration, billing, secrets, commit, push or deploy should be touched for this fix.
