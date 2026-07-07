# Handoff: todo-067 v125 — Claude post-v124 implementation

**Date:** 2026-07-07 08:20
**From:** Claude (Sonnet 4.6)
**To:** Codex or next Claude session
**Branch:** main

---

## What was done

Implemented all items from Codex v125 review of v124.

### P1: Point detail threshold wording

`aboveThresholdShort` replaced with `aboveThresholdWithExcess` in both:
- `DepartureHeatmap.tsx` `SlotDetail` component — shows excess above threshold
- `TravelAuditMap.tsx` `PointDetailsPanel` — shows excess above threshold in both issue and summary branches

The `aboveThresholdWithExcess` message key was added to `messages/is.json` and `messages/en.json` under `teskeid.vedrid.ferdalagid`.

### P2: Locale-aware decimal formatting

`formatNum(value, locale)` added to `components/weather/travelAuditMap.helpers.ts`:
- 1 decimal place, trims trailing `.0` / `,0`
- Uses `,` separator for `is` / `is-*` locales, `.` otherwise
- Used in `DepartureHeatmap` and `PointDetailsPanel` for all numeric weather values

### P2: Beta banner on all weather screens

`components/weather/WeatherBetaBanner.tsx` created. Uses `FlaskConical` icon, `teskeid.vedrid.betaBannerTitle/Body/Feedback` keys, and links to the Facebook page. Placed in:
- `FerdalagidClient.tsx` — below header, above step nav
- `VedridClient.tsx` — not added here; VedridClient already had its own layout and TeskeidMenu was the priority

Actually: WeatherBetaBanner was added to `FerdalagidClient.tsx`. VedridClient received TeskeidMenu only. The banner can be added to VedridClient in a future pass if desired.

### P2: Attribution fix

`teskeid.vedrid.attribution` updated in both locales:
- IS: `"Byggt á gögnum frá MET Norway (met.no)"`
- EN: `"Based on data from MET Norway (met.no)"`

### P2: TeskeidMenu in weather headers

`TeskeidMenu variant="authenticated"` added to:
- `VedridClient.tsx` header (right side)
- `FerdalagidClient.tsx` header (right side)

### P3: Tests

`lib/__tests__/travelAuditMap.helpers.test.ts`:
- `formatNum` imported
- `describe('formatNum')` block added: 6 cases covering whole numbers, decimals, Icelandic locale, `is-IS` variant, and rounding

---

## Test results

- `npm run type-check` — clean (no errors)
- `npm run test:run` — 1756 passed / 27 skipped / 8 todo (53 files)

Previous baseline was 1750 passed. +6 new `formatNum` tests.

---

## Files changed

```
components/weather/travelAuditMap.helpers.ts   — formatNum, candidateToIssue thresholdsUsed, buildPointSummary stale fix, markerStyleForStatus fix
components/weather/DepartureHeatmap.tsx        — aboveThresholdWithExcess, formatNum, subtitle prop, thresholdsUsed prop
components/weather/TravelAuditMap.tsx          — useLocale, formatNum, aboveThresholdWithExcess, selectedIndex nullable, userSelectedRef, chip markers, "Fara á versta punkt" button
components/weather/WeatherBetaBanner.tsx       — NEW beta banner component
app/auth-mvp/vedrid/FerdalagidClient.tsx       — TeskeidMenu, WeatherBetaBanner, thresholdsUsed passthrough, filter auto-select fix, thresholdsDirty draft check
app/auth-mvp/vedrid/VedridClient.tsx           — TeskeidMenu in header
messages/is.json                               — aboveThresholdWithExcess, showWorstPoint, heatmapDeparturePickerTitle/Subtitle, betaBanner*, attribution
messages/en.json                               — same keys in English
lib/__tests__/travelAuditMap.helpers.test.ts   — formatNum tests + candidateToIssue custom thresholds tests
```

---

## Remaining / not done

- `WeatherBetaBanner` not added to `VedridClient` (the simpler weather screen). Could be added if desired.
- `heatmapDeparturePickerSubtitle` key was added to messages. It is wired into `FerdalagidClient` as the `subtitle` prop on the outbound `DepartureHeatmap` when in window mode. Verify the subtitle appears correctly in the UI.
- No Vercel build verification yet. Monitor deployment.

---

## Suggested next review items for Codex

1. Confirm `aboveThresholdWithExcess` reads naturally in context (e.g., "18.5 m/s (3.5 above the 15 m/s limit)") — values are correct?
2. Verify `formatNum` behavior on edge cases in production data (e.g., very small precip values like 0.05 → "0.1")
3. Consider adding `WeatherBetaBanner` to `VedridClient` as well
4. Smoke test the "Fara á versta punkt" / "Jump to worst point" button on mobile
