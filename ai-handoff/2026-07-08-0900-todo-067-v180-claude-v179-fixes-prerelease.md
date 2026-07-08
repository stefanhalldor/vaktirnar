# TODO-067 v180 - Claude handoff - v179 fixes shipped (prerelease)

Created: 2026-07-08 09:00
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Changes written and type-checked. Awaiting Stebbi review and Vercel confirmation before release.

## What was fixed

All three v179 blockers/high issues are addressed.

### 1. Blocker fixed — Map chip times now use activeCandidate for all visible chips

`components/weather/TravelAuditMap.tsx` (lines 352-355)

Before:
```ts
if (isSelected && activeCandidate) {
  timeIso = estimatePointEtaIso(activeCandidate, pt, activeLeg ?? 'outbound')
} else {
  timeIso = pt.summaryForWindow?.etaIso
}
```

After:
```ts
const timeIso = activeCandidate
  ? estimatePointEtaIso(activeCandidate, pt, activeLeg ?? 'outbound')
  : pt.summaryForWindow?.etaIso
```

All visible time chips (selected and warning markers alike) now use the active-candidate ETA when a scrubber slot is selected. A chip label will no longer change from e.g. `01:20` to `08:20` when another point is clicked.

### 2. High fixed — Green slot no longer inherits result-level highlightedIssue

`app/auth-mvp/vedrid/FerdalagidClient.tsx` (lines 480-487)

Removed the `?? result?.travelPlan?.highlightedIssue` fallback from both selected-slot branches. The fallback is now only reached when no scrubber slot is selected at all.

Before: selecting a green slot could still show an old worst point and stale metric details from another departure because `candidateToIssue(...)` returned `undefined` and the code fell back to `result.travelPlan.highlightedIssue`.

After: when a slot is selected and it is green, `heatmapHighlightedIssue` is `undefined`. `TravelAuditMap` then uses `initialSelectedIndex` (which falls to `activeCandidate.worstWind/worstGust/worstPrecip.routeIndex`) to find the worst point for that specific candidate. The top card and map will not resurrect a stale worst point from another departure.

### 3. High fixed — PointDetailsPanel no longer shows stale summaryForWindow weather metrics

`components/weather/travelAuditMap.helpers.ts` — `buildPointSummary` (lines 304-324)

Added `showSummaryMetrics = !activeCandidate || isHighlighted` flag. When `activeCandidate` is set and the point is not the highlighted issue, these fields are zeroed/cleared:

- `windMs` → 0
- `gustMs` → 0
- `precipMmPerHour` → 0
- `decisiveTempC` → undefined
- `status` → undefined
- `decisiveMetric` → undefined
- `decisiveTimeFormatted` → undefined

The existing panel condition `(summary.windMs > 0 || summary.precipMmPerHour > 0 || summary.decisiveTempC !== undefined)` already suppresses the weather block when these are all zero/undefined, so no component change was needed.

The `isHighlighted` point is exempt because `candidateToIssue(...)` carries active-candidate metric values for that one worst point, making those values safe to display.

## Commands run

```
npm run type-check  # exit 0, no errors
npm run test:run    # 58 files, 1858 passed, 27 skipped, 8 todo — all green
```

## Files changed

- `components/weather/TravelAuditMap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/travelAuditMap.helpers.ts`

## No changes to

- SQL, RLS, auth, env, Supabase, migrations, deployment config
- Route fetching, Google Maps provider, saved places
- `lib/weather/types.ts` — `PointSummary` type fields are unchanged (all fields still support 0/undefined values)

## Vercel status

Commit `a31123a` (v178) — status not confirmed in this session. Stebbi should check Vercel before declaring any release ready.

## Localhost checks for Stebbi

Use `/auth-mvp/vedrid` with `Garðabær -> Egilsstaðir` or another long route with mixed yellow/green points.

1. Select a yellow departure slot (e.g. `00:54`).
2. Click several warning points on the map.
3. Expected: a given route point's black time chip stays tied to the selected departure ETA across all clicks. It must not change from `01:20` to `08:20` when another point is selected.
4. Expected: `Valin veðurspá` panel does not show `Veðurspá kl. 08:00` or old wind/gust/precip/temp when active departure is `00:54`.
5. Select a green departure slot.
6. Expected: top card says the selected departure is good; map does not resurrect an old worst point from another departure; the point detail panel does not show stale warning metrics.
7. Toggle map filters and scrubber filters.
8. Expected: filter changes visibility only, not the meaning of time labels.
9. Check 360px mobile width.
10. Expected: no horizontal overflow, no overlap.
