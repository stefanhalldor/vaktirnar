# TODO-067 v178 - Claude handoff - session shipped, known issues for next pass

Created: 2026-07-08 08:44
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Committed and pushed. Vercel deploy in progress. Known data-consistency issues documented below for next pass.

Commit: `a31123a`

## What shipped in this commit

### 1. Combined result card restructure (v175)

- Removed redundant card titles: "Brottfarartíminn þinn í Teskeið" and "Hvenær er best að leggja af stað?"
- Coverage text moved to top of card
- Outbound heatmap rendered with `title={null}`
- Slot detail text changed to: "Mest krefjandi er X km frá {origin}." then metric on next line
- `IS_PLACE_DATIVE` map added to `DepartureHeatmap.tsx` with dative forms for ~35 Icelandic towns
- `slotDetailWorstDistance`, `slotDetailOriginFallback`, `slotDetailMetricLine` keys added to both message files

### 2. Disclaimer replaced (v176)

- Old: "Þetta er veðurmat, ekki umferðar- og farartrygging."
- New: "Þetta er veðurspá og við búum á Íslandi. Fylgist vel með færðinni til öryggis, t.d. á vef Vegagerðarinnar." (link to umferdin.is)
- Rendered with `tf.rich()` and `<link>` tag in message

### 3. Map panel defaults to worst point (v176 + session)

- `initialSelectedIndex` priority order:
  1. `highlightedIssue` lat/lon match (slot-specific non-green worst)
  2. `activeCandidate.worstWind/worstGust/worstPrecip.routeIndex` (works for green slots)
  3. `pt.isHighlightedIssue` (server-flagged default window worst)
  4. `summaryForWindow.status` red/yellow fallback
  5. Destination
- All three `initialSelectedIndex` call sites in `TravelAuditMap.tsx` now pass `activeCandidate`
- Panel title: always "Mest krefjandi á leiðinni" for auto-selected (regardless of status), "Valin veðurspá" for manual
- Red badge on auto-selected title always

### 4. IS_PLACE_DATIVE and getOriginDisplay moved to shared helpers

- Added to `travelAuditMap.helpers.ts` and exported
- `TravelAuditMap.tsx` `PointDetailsPanel` now applies dative to leg start name
- `DepartureHeatmap.tsx` retains its own copy (deduplication deferred)

### 5. Temperature metric added

- `HourPoint.airTemperatureC` → `summaryForWindow.decisiveTempC` → `PointSummary.decisiveTempC`
- Uses temperature at the decisive forecast hour (same hour as wind/precip)
- `metricTemp` key added: "Hiti" / "Temperature"

### 6. Map panel text restructuring

- ETA: "Áætlaður tími 124 km frá Garðabæ: kl. 10:01" (distance moved into ETA line)
- Forecast: "Veðurspá kl. 10:00 á þessum stað" (distance removed, "á þessum stað" suffix)
- Precipitation always shown even when 0
- One-line weather display: Vindur · Hviður · Úrkoma · Hiti
- Removed: raw route coordinates ("Punktur á leið: lat, lon") and fallback "Spápunktur met.no" label

### 7. Copy fixes

- Coverage text: "Teskeið.is" branding (was "Teskeið")
- `pointEtaLabel`: "Áætlaður tími" (was "Áætlaður tími á þessum stað")
- `pointForecastLabel`: "Veðurspá" (was "Spá")
- `worstPointTitle`: "Mest krefjandi á leiðinni" (was "Versti punktur")

---

## Known issues flagged by Codex v177 — NOT fixed in this commit

These were identified by Codex before the session and remain open.

### Blocker: Map chip times mix active-candidate ETA with stale summaryForWindow ETA

`TravelAuditMap.tsx` renders time chips using two different time sources:
- Selected point: `estimatePointEtaIso(activeCandidate, pt, activeLeg)`
- Unselected warning points: `pt.summaryForWindow?.etaIso`

Result: clicking between points causes a visible time change on the same marker (e.g. 01:20 → 08:20). Fix: use `estimatePointEtaIso` for all chip times when `activeCandidate` exists.

### High: PointDetailsPanel shows stale summaryForWindow metrics for manually selected points

`windMs`, `gustMs`, `precipMmPerHour`, `decisiveTimeFormatted` in `PointSummary` come from `summaryForWindow` (default window), not from the active selected candidate. Panel can show departure "kl. 00:54" with forecast wind values from "kl. 08:00".

Fix options:
- A. Hide weather metric lines when activeCandidate exists and point is not the highlighted issue
- B. Extend server `CandidatePointStatus` payload to include per-point metric values for non-green points (delta-encoded)

### High: Green slot auto-selects old result-level highlighted issue

`FerdalagidClient.tsx` falls back to `result.travelPlan.highlightedIssue` when `candidateToIssue(selectedCandidate)` returns undefined (green slot). This can show an old worst point and old metric details even when the selected departure is green.

Fix: when a scrubber slot IS selected, never fall back to `result.travelPlan.highlightedIssue`. Pass `undefined` for `heatmapHighlightedIssue` when selected candidate is green.

---

## Files changed in commit

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `lib/__tests__/weather-travel.test.ts`
- `lib/weather/travel.ts`
- `lib/weather/types.ts`
- `messages/is.json`
- `messages/en.json`
- All `ai-handoff/2026-07-08-*.md` files (v163–v177)

## No changes to

- SQL, RLS, auth, env, Supabase, migrations, deployment config
- Route fetching, Google Maps provider, saved places
