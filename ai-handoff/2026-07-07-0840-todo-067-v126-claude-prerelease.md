# Handoff: todo-067 v126 — Claude post-v125 fixes

**Date:** 2026-07-07 08:40
**From:** Claude (Sonnet 4.6)
**To:** Codex or next Claude session
**Branch:** main

---

## What was done

Implemented all required fixes from Codex v126 review of v125.

### P1: Scrubber title/subtitle in both modes

`app/auth-mvp/vedrid/FerdalagidClient.tsx` line ~747-748:

Before: `heatmapDeparturePickerTitle` and `heatmapDeparturePickerSubtitle` were only used in `windowMode`. Single-departure/timeline mode fell back to `timelineSingleDepartureTitle` with no subtitle.

After: Both `title` and `subtitle` props unconditionally use `heatmapDeparturePickerTitle` and `heatmapDeparturePickerSubtitle` in all modes.

### P1: Beta banner on VedridClient

`app/auth-mvp/vedrid/VedridClient.tsx`:
- Added `import { WeatherBetaBanner } from '@/components/weather/WeatherBetaBanner'`
- Added `<WeatherBetaBanner />` between the header block and the form

### P2: Beta banner body includes screenshot/explanation instruction

`messages/is.json` `betaBannerBody` updated:
> "Við erum að þróa ferðaveðrið. Berðu matið saman við opinbera veðurspá og aðstæður á vegum. Ef eitthvað er óskýrt eða rangt máttu senda okkur skilaboð á Facebook með skjámynd og skýringu."

`messages/en.json` `betaBannerBody` updated:
> "We are still developing the travel weather assessment. Compare it with official forecasts and road conditions. If something is unclear or wrong, send us a Facebook message with a screenshot and explanation."

### P2: `aboveThresholdShort` replaced in FerdalagidClient

`app/auth-mvp/vedrid/FerdalagidClient.tsx`:
- Added `formatNum` to helpers import
- Next caution summary line: `nc.issue.value.toFixed(1)` → `formatNum(nc.issue.value, locale)`, `aboveThresholdShort` → `aboveThresholdWithExcess` with computed `excess`
- `IssueAuditCard` function component: added `const locale = useLocale()`, `issue.value.toFixed(1)` → `formatNum(issue.value, locale)`, `aboveThresholdShort` → `aboveThresholdWithExcess` with computed `excess`
  - Also tightened guard: `thresholdValue !== undefined` → `thresholdValue !== undefined && issue.value !== undefined` (excess requires both values)

### P3: TeskeidMenu active prefix for weather

`components/teskeid/TeskeidMenu.tsx`:
- Added `'/auth-mvp/vedrid'` to `activePrefixes` of the `teskeidar` menu item
- Weather screens now highlight the "Teskeið" menu item as active

---

## Test results

- `npm run type-check` — clean
- `npm run test:run` — 1756 passed / 27 skipped / 8 todo (53 files)

---

## Files changed

```
app/auth-mvp/vedrid/FerdalagidClient.tsx   — formatNum import, scrubber title fix, aboveThresholdWithExcess in next-caution + IssueAuditCard
app/auth-mvp/vedrid/VedridClient.tsx       — WeatherBetaBanner import + render
components/teskeid/TeskeidMenu.tsx         — /auth-mvp/vedrid added to activePrefixes
messages/is.json                           — betaBannerBody with screenshot instruction
messages/en.json                           — betaBannerBody with screenshot instruction
```

---

## Remaining known gap (not for this pass)

The v119/v121 trust-map scope (ETA + forecast timestep chip labels, active-candidate per-point forecast times in PointDetailsPanel) is still not complete. `buildPointSummary` hides `forecastTimeIso` and `nextForecast` when `activeCandidate` is set to avoid stale data. This is the safer behavior for now. Full implementation requires extending the per-point data model to include active-candidate forecast times, which is larger work.

## Localhost checks for Stebbi

1. **Beta banner**: Open `/auth-mvp/vedrid` (simple weather screen) and Ferðalagið — both should show "Prófanaútgáfa" banner with the screenshot sentence and Facebook feedback link.
2. **Scrubber title**: Complete a Ferðalagið route. Both window-mode and single-departure/timeline should show "Brottfarartíminn í Teskeið" with the helper subtitle.
3. **Threshold wording**: Any yellow/red result — next caution line and "Af hverju?" card both should show e.g. `8,7 m/s (0,7 yfir 8 m/s mörkum)` with comma decimals.
4. **Menu active**: Open TeskeidMenu on any weather screen — "Teskeið" item should be highlighted.
