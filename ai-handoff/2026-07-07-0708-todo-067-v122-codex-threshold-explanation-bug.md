# todo-067 v122 - Codex handoff: threshold explanation text must match actual weather limits

Created: 2026-07-07 07:08  
Timezone: Atlantic/Reykjavik  
Relevant TODO: todo-067 - Veðrið / Ferðalagið

## Context

Stebbi found a trust-breaking mismatch in the travel weather result.

Example from localhost:

- User has configured weather limits:
  - `Óþægilegt ef vindur fer yfir 8 m/s`
  - `Hættulegt ef vindur fer yfir 15 m/s`
  - `Hættulegt ef hviður fara yfir 18 m/s`
  - `Óþægilegt ef úrkoma fer yfir 2 mm/klst`
- Timeline slot is orange / `Óþægilegt`.
- Selected slot detail says:
  - `Vindur: 8.7 m/s yfir mörkum 13.0 m/s`

That is wrong. The discomfort was caused by `8.7 m/s` crossing the user-configured `8 m/s` caution threshold. The correct Icelandic explanation should be:

`Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`

This is not merely copy polish. It is a correctness issue: the explanation must use the same metric and threshold that caused the status/color.

## Findings / likely root cause

### P1 - `DepartureHeatmap` appears to derive thresholds without the active user thresholds

`components/weather/DepartureHeatmap.tsx` currently derives the detail threshold with:

`deriveThreshold(metric, candidate.reasonCode)`

That call does not pass the resolved thresholds used for this calculation. Therefore it falls back to default constants from `lib/weather/thresholds.ts`, such as caravan `13 m/s`, instead of the custom threshold Stebbi set in the UI.

Relevant areas:

- `components/weather/DepartureHeatmap.tsx:60` - component props do not appear to include `thresholdsUsed`.
- `components/weather/DepartureHeatmap.tsx:243-275` - `CandidateDetailCard` calculates decisive metric and calls `deriveThreshold(...)` without resolved thresholds.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:633` and `:649` - `DepartureHeatmap` is rendered without passing `result.travelPlan.thresholdsUsed`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:522-529` - `result.travelPlan.thresholdsUsed` is already available in the client.

### P1 - `candidateToIssue` may have the same fallback problem

`components/weather/travelAuditMap.helpers.ts` also calls `deriveThreshold(...)` without resolved thresholds inside `candidateToIssue`. If this helper feeds selected candidate issues or map/audit details, it can show default thresholds even when the trip used custom thresholds.

Relevant area:

- `components/weather/travelAuditMap.helpers.ts:150-180` - threshold derivation uses defaults unless changed to accept `ResolvedTravelThresholds`.

### P2 - Current string hides the important delta

Current message key:

- `messages/is.json:684` - `aboveThresholdShort`: `yfir mörkum {threshold} {unit}`
- `messages/en.json:680` - `aboveThresholdShort`: `above threshold {threshold} {unit}`

That wording is too vague and led to awkward output. For threshold debugging and user trust, the UI should show:

- measured value
- threshold used
- how far above the threshold it is

## Required behavior

When a point, timeline slot, next caution, audit map card, or issue card explains why something is `Óþægilegt` or `Hættulegt`, it must use the exact threshold that triggered that status.

For the screenshot case:

- metric: wind
- value: `8.7 m/s`
- active caution threshold: `8 m/s`
- excess: `0.7 m/s`
- display:
  - `Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`

Rules:

1. If wind triggers yellow / `Óþægilegt`, compare wind against `thresholdsUsed.cautionWindMs`.
2. If wind triggers red / `Hættulegt`, compare wind against `thresholdsUsed.redWindMs`.
3. If gusts trigger red / `Hættulegt`, compare gusts against `thresholdsUsed.redGustMs`.
4. If precipitation triggers yellow / `Óþægilegt`, compare precipitation against `thresholdsUsed.cautionPrecipMmPerHour`.
5. Do not display “yfir mörkum X” unless the shown value is actually above X.
6. If multiple metrics are bad, show the strongest/worst trigger first. Keep secondary metrics as plain context unless they also get their own clear threshold explanation.
7. Use Icelandic decimal comma in Icelandic UI text.
8. Prefer no unnecessary trailing `.0` / `,0` for whole-number thresholds. `8 m/s` is better than `8,0 m/s`.

Suggested Icelandic examples:

- `Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`
- `Úrkoma: 2,4 mm/klst (0,4 yfir 2 mm/klst mörkum)`
- `Hviður: 19,1 m/s (1,1 yfir 18 m/s hættumörkum)`

Suggested English examples:

- `Wind: 8.7 m/s (0.7 above the 8 m/s limit)`
- `Precipitation: 2.4 mm/h (0.4 above the 2 mm/h limit)`
- `Gusts: 19.1 m/s (1.1 above the 18 m/s danger limit)`

## Implementation plan for Claude Code

### 1. Pass active thresholds into all candidate/detail derivation paths

Use `result.travelPlan.thresholdsUsed` as the source of truth for the result.

Likely changes:

- Add optional or required `thresholdsUsed: ResolvedTravelThresholds` prop to `DepartureHeatmap`.
- Pass `result.travelPlan.thresholdsUsed` from `FerdalagidClient` into both outbound and return `DepartureHeatmap` instances.
- Pass `thresholdsUsed` into `CandidateDetailCard`.
- Change `deriveThreshold(metric, reasonCode)` calls in `DepartureHeatmap` to `deriveThreshold(metric, reasonCode, thresholdsUsed)`.
- Update `candidateToIssue(...)` in `components/weather/travelAuditMap.helpers.ts` to accept `thresholdsUsed?: ResolvedTravelThresholds` or a required option:
  - `opts?: { routeDistanceM?: number; legStartName?: string; thresholdsUsed?: ResolvedTravelThresholds }`
- Ensure every caller that has `result.travelPlan.thresholdsUsed` passes it.

Do not use `WEATHER_THRESHOLDS.*` directly in UI explanation paths when `thresholdsUsed` is available.

### 2. Make decisive metric logic use resolved thresholds

In `DepartureHeatmap`, current gust decisiveness appears to use default constants:

- `WEATHER_THRESHOLDS.caravan.redGustMs`
- `WEATHER_THRESHOLDS.driving.redGustMs`

For this screen, that should use `thresholdsUsed.redGustMs` instead.

This matters if Stebbi changes gust thresholds in `Veðurmörk`; the UI must not silently keep using old defaults for decisive metric selection.

### 3. Add a small formatting helper for threshold explanations

Avoid scattering arithmetic and `toFixed(1)` formatting across components.

Recommended helper behavior:

- Input:
  - metric label
  - value
  - threshold
  - unit
  - locale
  - optional severity label / danger wording
- Output can be composed from translation keys.
- Use `Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 })`.
- Compute `excess = value - threshold`.
- Only include the parenthetical if `excess > 0`.

Possible message keys:

```json
"thresholdExceededDetail": "{metric}: {value} {unit} ({excess} yfir {threshold} {unit} mörkum)",
"thresholdExceededDangerDetail": "{metric}: {value} {unit} ({excess} yfir {threshold} {unit} hættumörkum)"
```

English equivalent:

```json
"thresholdExceededDetail": "{metric}: {value} {unit} ({excess} above the {threshold} {unit} limit)",
"thresholdExceededDangerDetail": "{metric}: {value} {unit} ({excess} above the {threshold} {unit} danger limit)"
```

Claude Code can choose exact key names, but user-facing text must remain in `messages/is.json` and `messages/en.json`.

### 4. Replace the affected UI text

Audit and update at least:

- `components/weather/DepartureHeatmap.tsx`
- `components/weather/TravelAuditMap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` next caution line and issue cards
- `components/weather/travelAuditMap.helpers.ts` if it produces `TravelIssue.thresholdValue`

The same rule should apply everywhere: if the UI says something crossed a threshold, it must show the threshold that was actually used for the status.

### 5. Add focused tests

Minimum useful tests:

1. Custom wind caution threshold:
   - thresholds: `cautionWindMs = 8`, `redWindMs = 15`, `redGustMs = 18`, `cautionPrecipMmPerHour = 2`
   - candidate: `caution_wind_driving`, wind `8.7`
   - expected threshold: `8`
   - expected excess: `0.7`

2. Custom red wind threshold:
   - wind above `redWindMs`
   - expected threshold is `redWindMs`, not caution threshold.

3. Custom gust threshold:
   - gust above `redGustMs`
   - expected metric is gust and threshold is `redGustMs`.

4. Precipitation threshold:
   - precip `2.4`, threshold `2`
   - expected excess `0.4`.

5. No contradictory explanation:
   - If value is below threshold, do not show `yfir mörkum`.

Good likely homes:

- `lib/__tests__/weather-travel.test.ts` for server/data correctness.
- `lib/__tests__/travelAuditMap.helpers.test.ts` if `candidateToIssue` is changed.
- Add a small pure formatting helper test if Claude extracts one.

## Design / UX notes

This follows `Design.md`:

- Text should be short, practical and concrete.
- Status colors cannot be the only explanation; the text must explain the reason.
- All user-facing strings must be in `messages/is.json` and `messages/en.json`.
- Avoid raw technical wording like `threshold` in Icelandic UI where possible. Use `mörk`, `viðmið`, or concrete phrasing.

Recommended Icelandic wording from Stebbi:

`Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`

This is the preferred pattern for MVP.

## Do not do

- Do not merely change `13.0` to `8.0` in a string.
- Do not hardcode the `8 m/s` threshold.
- Do not derive UI thresholds from global defaults when `result.travelPlan.thresholdsUsed` exists.
- Do not show `above threshold` text for a metric that did not actually cross that threshold.
- Do not introduce a new rollout flag for this. Weather already has feature gating.
- Do not touch Supabase, SQL, RLS, auth, env vars, billing, deployment, commit, push, or production.

## Commands Codex ran while preparing this handoff

Read-only commands only:

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Content -Encoding UTF8 'Design.md'`
- `rg -n "yfir mörkum|mörkum|threshold|thresholds|windCaution|windDanger|gust|precipCaution|Óþægilegt|Hættulegt" components lib messages app`
- Snippet reads from:
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `components/weather/DepartureHeatmap.tsx`
  - `components/weather/TravelAuditMap.tsx`
  - `components/weather/travelAuditMap.helpers.ts`
  - `lib/weather/travel.ts`
  - `lib/weather/thresholds.ts`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

No tests were run by Codex. No app code was changed.

## Localhost checks for Stebbi

After Claude Code implements the fix and Stebbi restarts localhost if needed:

1. Open `/auth-mvp/vedrid`.
2. Choose a route that produces timeline warnings. The route in the screenshot is enough if the same forecast still produces orange points.
3. Go to `Veðurmörk`.
4. Set:
   - `Óþægilegt ef vindur fer yfir`: `8`
   - `Hættulegt ef vindur fer yfir`: `15`
   - `Hættulegt ef hviður fara yfir`: `18`
   - `Óþægilegt ef úrkoma fer yfir`: `2`
5. Recalculate the trip.
6. In the timeline, filter/select `Óþægilegt`.
7. Select an orange slot where wind is around `8.7 m/s`.
8. Expected result:
   - The detail text says something equivalent to:
     - `Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`
   - It must not say:
     - `yfir mörkum 13.0 m/s`
     - `yfir mörkum 15.0 m/s`
     - any other threshold that did not trigger the orange status.
9. Repeat for precipitation if a slot has precipitation over `2 mm/klst`:
   - Expected:
     - `Úrkoma: 2,4 mm/klst (0,4 yfir 2 mm/klst mörkum)` or equivalent.
10. Repeat for a red wind/gust case if available:
   - Red wind should compare against red wind threshold.
   - Red gust should compare against red gust threshold.
11. Check that Icelandic text uses decimal comma.
12. Optional English check:
   - Switch locale if available and verify English uses decimal point and natural English wording.

Regression checks:

- Timeline filter still filters the right slots.
- Map selected point/detail still updates when selecting a different slot.
- `Næst verður varasamt...` line, point detail card, and issue/audit cards all use the same threshold source.
- Default thresholds still work when Stebbi does not customize `Veðurmörk`.

Safety notes:

- This is a local UI/data correctness check only.
- Do not test against production unless Stebbi explicitly decides to deploy later.
- No Supabase, auth, billing, API key, deployment, or production data behavior should be affected by this fix.

## Óvissa / þarf að staðfesta

- Codex did not inspect the full current diff from Claude Code, only relevant snippets and search results.
- The most likely concrete bug is missing `thresholdsUsed` in `DepartureHeatmap` / `candidateToIssue`, but Claude Code should confirm all UI explanation paths.
- If Claude Code has already refactored these components after v121, adapt the plan to the current code rather than forcing these exact file-level changes.
