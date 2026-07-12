# TODO 071 - Codex review of v022 map point detail prerelease

Created: 2026-07-12 09:01  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Prerelease review  
Related TODO: #71 Veður: allir spápunktar og fjarlægð frá vegi  
Reviewed handoff: `2026-07-12-0900-todo-071-v022-claude-prerelease.md`

Status: Review only. No implementation done by Codex.

## Findings

### P1 - Worst point panel can still render only the single highlighted metric

Files:

- `components/weather/TravelAuditMap.tsx:623`
- `components/weather/TravelAuditMap.tsx:688`

The data layer part of v022 mostly follows the handoff: `buildPointSummary()` can now return full active-candidate-safe values for displayPoint and non-displayPoint route points.

However, `PointDetailsPanel` still has the old `hasIssueValues` branch:

```tsx
{hasIssueValues ? (
  <p>
    {issueMetricLabel}: {formatNum(highlightedIssue!.value!, locale)} ...
  </p>
) : (
  full wind / precipitation / temperature line
)}
```

For the highlighted/worst point, `summary.isHighlighted` and `highlightedIssue.value` are both likely true, so the panel can still show only the decisive metric, for example `Vindur: 10 m/s`, instead of the full line:

```text
Vindur: X m/s · Úrkoma: Y mm/klst · Hiti: Z°C
```

That means v022 may not fully satisfy Stebbi's exact requirement:

> Við viljum sýna nákvæmlega sömu gögn fyrir valinn punkt og versta punkt.

Recommended fix:

- Keep the threshold/excess text only as secondary/supporting detail if it is still useful.
- Make the primary weather line always use `summary.windMs`, `summary.precipMmPerHour`, and `summary.decisiveTempC` when those values are available.
- For highlighted issue points, do not replace the full weather line with the single issue metric.
- Add/adjust a test so the highlighted issue + displayPoint case expects full wind/precip/temp values to be renderable, not just `highlightedIssue.value`.

This is user-visible and should be fixed before release.

### P2 - New helper tests are partly too weak to prevent regression

File:

- `lib/__tests__/travelAuditMap.helpers.test.ts`

The new non-displayPoint test is directionally right, but it only asserts:

- `windMs` is not the stale summary value;
- `windMs > 0`;
- time fields are defined.

It does not assert the exact forecast row values (`9.5`, `12.0`, `0.2`, `6.0`, `10:00`). That means a wrong nearest-row implementation could still pass if it returns any positive non-stale value.

Also, the comment says routeFraction is unknown/default 0, while the test sets `routeFraction: 0.2`. Small thing, but it makes future debugging needlessly slippery.

Recommended fix:

- Assert exact values for the non-displayPoint path:
  - `windMs`
  - `gustMs`
  - `precipMmPerHour`
  - `decisiveTempC`
  - `forecastTimeIso`
  - `decisiveTimeFormatted`
- Update the misleading comment.
- Consider avoiding tie cases in "nearest row" tests, or explicitly document first-row-on-tie behavior.

This is not as urgent as P1, but it is worth tightening while Claude is already in this code.

## What Looks Good

- Timestamp chip marker code was removed from `TravelAuditMap.tsx`; the map should be visually calmer.
- `derivePointWeatherForCandidate()` is the right abstraction for avoiding stale `summaryForWindow` values.
- `RoutePointRow` now uses the shared helper for active-candidate non-displayPoint rows, so `Allir spápunktarnir á leiðinni` should be much closer to the intended behavior.
- TypeScript check is clean.
- Targeted helper tests pass.
- No SQL, RLS, auth, Supabase, env, or analytics changes are part of v022.

## Commands Codex Ran

```bash
npm run type-check
```

Result: exit 0.

```bash
npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts
```

Result: exit 0. `1 passed`, `62 passed`.

## Scope / Safety Notes

No database or production-data risk found in this diff.

Main remaining risk is purely user-visible correctness:

- worst point and manually selected point may still not have true parity because `PointDetailsPanel` chooses the old single-metric branch for highlighted issues.

## Recommended Next Step For Claude Code

Do a small v024 patch:

1. Change `PointDetailsPanel` so the full weather line is the primary line for both worst and manual selected points.
2. Keep issue/threshold excess copy only as extra supporting context, not as a replacement for wind/precip/temp.
3. Strengthen the helper tests with exact value assertions.
4. Re-run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts
```

No broader refactor needed.

## Localhost Checks For Stebbi

After Claude's follow-up patch:

1. Open `/vedrid` or `/auth-mvp/vedrid`.
2. Calculate a route with multiple weather points.
3. Confirm the map has no floating `HH:mm` timestamp chips.
4. Click the automatically selected/worst point.
5. Expected: the panel shows full weather line:
   - wind
   - precipitation
   - temperature
   - forecast time
6. Click another non-worst map point.
7. Expected: same data shape as the worst point, not a thinner/sparser card.
8. Change the departure scrubber slot.
9. Expected: clicked point updates to the selected slot's ETA/forecast values and does not use stale default-window values.
10. Open `Allir spápunktarnir á leiðinni`.
11. Expected: point rows with forecast rows show the same active-slot weather details.
12. Mobile 360-460 px: no horizontal overflow; links wrap naturally.

No Supabase, auth, RLS, SQL, secrets, billing, or production-data checks are needed for this specific patch.
