# Handoff: TODO #085 v013 — Released

**Date:** 2026-07-11
**Session:** Claude
**Commit:** effbaaf
**Status:** Pushed to main, Vercel deploying

---

## What shipped

### Core: Fine-grained wind status system

New shared module `lib/weather/windDisplayStatus.ts` replaces coarse `graent/gult/rautt` in all display-layer UI:

| Status | Label (IS) | Icon | Color |
|---|---|---|---|
| `innan-marka` | Innan marka | ✓ | Green `#2d5a27` |
| `nalgast-othaegindi` | Nálgast óþægindi | 😬 | Amber |
| `othaegilegt` | Óþægilegt | 😟 | Orange |
| `nalgast-haettumork` | Nálgast hættumörk | 😰 | Red |
| `haettulegt` | Hættulegt | ⚠️ | Red/destructive |
| `no_data` | Ófullnægjandi gögn | – | Muted |

Two separate order constants:
- `WIND_DISPLAY_STATUS_PRIORITY_ORDER` — severe-first, for auto-select effects
- `WIND_DISPLAY_STATUS_PILL_ORDER` — safe-to-danger, for filter pill display

### Threshold form UX

- Inputs blank by default (no prefill)
- "Nota sjálfgefin viðmið" button removed
- Both fields required; submitting empty shows: "Til þess að halda áfram þarf að setja inn bæði vindmörkin."
- Nav shows "Veldu mörk" until both values are entered
- `thresholds_invalid` API error routes back to threshold step

### Gust removal

- Gust values removed from: arrival card, comparison strip/drawer, point detail panel, audit map
- `lib/weather/travel.ts`: decisive time and wind trend now use `windSpeedMs` only
- API validation: `redGustMs` max raised to 100, `cautionPrecipMmPerHour` max to 100 (neutral hidden values now accepted)

### UI consistency fixes

**DepartureHeatmap scrubber pills:**
- Pills ordered safe to dangerous
- Active pill uses `chipActiveClass` (colored background per status)
- Scrubber dots use fine-grained `WindDisplayStatus` colors

**TravelAuditMap map pills and markers:**
- Same pill order and color treatment
- When a slot is selected: counts and marker colors use ETA-based wind classification per point (nearest forecast row to estimated ETA), not `summaryForWindow`
- Marker visibility filter also uses ETA-based status in slot mode

**FerdalagidClient "Allir spápunktarnir" detail cards:**
- `RoutePointRow` now computes fine-grained `WindDisplayStatus`:
  - Decisive point (displayPoint): uses `activeCandidate.displayPoint.windMs`
  - Other points in active mode: ETA + nearest forecast row wind
  - Non-active mode: `pt.summaryForWindow?.worstWindMs`
- Badge and card border/background come from `WIND_STATUS_META.chipActiveClass`

**"Á leiðinni" summary row:** Uses fine-grained `WindDistanceLabel` from `worstWind.value` via `classifyWindDistance`

### Auto-select behavior

Auto-select on filter change jumps to the most severe visible slot using `WIND_DISPLAY_STATUS_PRIORITY_ORDER` priority loop with `classifyCandidateWindDisplayStatus`.

### Messages

New keys: `statusWithinLimits`, `statusNearDiscomfort`, `statusUncomfortable`, `statusNearDanger`, `statusDangerous`, `thresholdRequiredError`, `navThreshChooseLimits`

Updated: `heatmapLegendGreen` → "Innan marka", `resultLoadingStepWeather`, `howAssessedShort`, `thresholdSummaryLine`, `thresholdsSubtitle`

### Tests

New: `lib/__tests__/weather-wind-distance.test.ts` — 9 boundary tests for `classifyWindDistance()`

---

## Post-release checks

1. Vercel build passes (monitor logs after push)
2. On `/vedrid` localhost or production:
   - Threshold inputs start blank, require both fields
   - Pill row order: ✓ Innan marka → 😬 Nálgast óþægindi → 😟 Óþægilegt → 😰 Nálgast hættumörk → ⚠️ Hættulegt → Ófullnægjandi gögn
   - Active pill shows colored background (orange for Óþægilegt, etc.)
   - Map pills match scrubber pills in count and order
   - Map counts change when slot is selected (not stuck on summaryForWindow values)
   - Detail cards (Allir spápunktarnir) show fine-grained badge matching scrubber
   - No gust values visible anywhere in result

---

## Known limitations / not in scope

- Map counts in selected-slot mode use nearest forecast row per point; if a point has no `forecastRows`, it falls back to `no_data` classification. This matches existing behavior for such points.
- `toggleMapStatus` first-visible fallback also uses ETA-based wind; if no slot is selected it uses `summaryForWindow` as before.
- `WIND_DISPLAY_STATUS_ORDER` kept as deprecated alias for backward compat with any external callers; points to PRIORITY order.
