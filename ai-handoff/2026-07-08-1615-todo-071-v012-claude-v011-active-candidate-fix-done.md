# TODO-071 v012 - Claude handoff - active-candidate-aware RoutePointRow done

Created: 2026-07-08 16:15
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Option A implemented. Type-check and tests green. Awaiting Stebbi localhost review and explicit commit/push approval.

## What was fixed

The data-consistency bug identified in `2026-07-08-1558-todo-071-v011-codex-selected-slot-detail-mismatch.md`.

`RoutePointRow` previously always displayed `summaryForWindow` — computed server-side from the default/best departure candidate. When the user selected a different heatmap slot, the heatmap and top card reflected the selected candidate while `Allir spápunktarnir á leiðinni` continued to show ETAs and metrics from a completely different time window. This was the mismatch Stebbi observed (selected slot 08:52→09:36 but row ETAs showing ~16:34).

## Implementation — Option A

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

**Import change:** added `estimatePointEtaIso` to the import from `travelAuditMap.helpers`.

**Call site:** `RoutePointRow` now receives three additional props when a heatmap slot is explicitly selected:

```tsx
<RoutePointRow
  key={pt.id}
  pt={pt}
  activeCandidate={selectedCandidatePointStatuses !== undefined ? activeCandidate : undefined}
  activeLeg={activeLeg}
  selectedCandidatePointStatuses={selectedCandidatePointStatuses}
/>
```

`selectedCandidatePointStatuses !== undefined` is the discriminator — it is `undefined` when no heatmap slot is selected, and an array (possibly empty) when one is. Passing `activeCandidate` only in that case ensures no-selection mode is exactly preserved.

**`RoutePointRow` signature change:**

```tsx
function RoutePointRow({
  pt,
  activeCandidate,
  activeLeg = 'outbound',
  selectedCandidatePointStatuses,
}: {
  pt: RouteWeatherPoint
  activeCandidate?: TravelCandidate
  activeLeg?: 'outbound' | 'return'
  selectedCandidatePointStatuses?: CandidatePointStatus[]
})
```

**Active-candidate mode logic:**

- `isActiveMode = activeCandidate !== undefined && selectedCandidatePointStatuses !== undefined`
- Status derived via delta encoding: look up `selectedCandidatePointStatuses.find(s => s.routeIndex === pt.routeIndex)`. If absent → `'graent'`; if present → the stored status (`'gult'`, `'rautt'`, `'no_data'`).
- ETA derived via `estimatePointEtaIso(activeCandidate, pt, activeLeg)` — consistent with the selected slot's departure/arrival times.
- Metrics (`forecastTimeIso`, wind/gust/precip/temp) from `summaryForWindow` are NOT shown in active mode — they belong to a different time window.
- When `activeStatus === 'no_data'`: shows `heatmapNotAssessedDetail` copy ("Ekki nóg gögn til að meta þennan brottfarartíma.") in gray card. No stale metrics.
- When `activeStatus` is green/amber/red: shows correct status color/badge and ETA, but no metrics (no per-point active metrics available without Option B).

**Default mode (no slot selected):** identical to previous behavior — `summaryForWindow` drives ETA, forecastTime, metrics, and status.

## What this does NOT do (Option A limitation)

Selected-slot rows for green/amber/red points show no wind/precip/temp values. These metrics come from `summaryForWindow` which belongs to a different time window. Showing them would re-introduce a subtler version of the same bug. A future Option B (extend `evaluateCandidate` to build `CandidatePointAssessment` with per-point metrics for each candidate) can add this richness without compromising data consistency.

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 62 files, 1953 passed, 27 skipped, 8 todo — all green
```

## What is still NOT done (by design)

- No new unit tests added for the active-candidate row behavior (Codex v011 noted these as desirable — can be a follow-up).
- No commit or push — requires explicit approval from Stebbi.
- SQL migration 71 not run. `USAGE_EVENT_SECRET` not set in Vercel (TODO-069 items).

## Localhost checks for Stebbi

Use Garðabær -> Akranes or any route that reproduces the mismatch.

1. Open `/auth-mvp/vedrid`.
2. Calculate Garðabær -> Akranes.
3. Do NOT select a heatmap slot. Open `Allir spápunktarnir á leiðinni`.
4. Expected: rows show `summaryForWindow` values (ETA, forecastTime, wind/precip/temp) as before. No regression.
5. Select a heatmap slot that says `Ófullnægjandi gögn` (no-data/not-assessed).
6. Open `Allir spápunktarnir á leiðinni`.
7. Expected:
   - Row ETA values now match the selected departure time — no 16:34 ETAs when the selected slot is 08:52.
   - Rows that have no forecast for this slot are gray with "Ekki nóg gögn til að meta þennan brottfarartíma." and no stale wind/precip/temp.
   - Row status badges/card colors reflect the selected slot's per-point statuses.
8. Select a normal green slot with enough data.
9. Expected:
   - ETAs reflect that slot's departure time.
   - Green rows show green badge — no stale metrics displayed (this is the Option A trade-off; richness can come via Option B later).
   - No `summaryForWindow` time values leak in.
10. Clear selection (e.g. click the selected heatmap slot again if deselect is supported, or calculate fresh route).
11. Expected: default `summaryForWindow` behavior returns — ETA, forecastTime, wind/precip/temp all present again.
12. Check mobile widths 360, 390 and 460 px for wrapping and no horizontal overflow.

No Supabase, auth, RLS, migration, billing, secrets, commit, push or deploy should be touched for this fix.
