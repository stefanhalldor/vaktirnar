# Codex review - todo 071 v024 prerelease

Source handoff reviewed: `ai-handoff/2026-07-12-0910-todo-071-v024-claude-prerelease.md`

## Findings

### P2 - Active-candidate fallback can still show a stale forecast timestamp in a no-derived-data edge case

File: `components/weather/travelAuditMap.helpers.ts`

`buildPointSummary()` correctly avoids stale `summaryForWindow` weather values for active-candidate points, and v024 now derives weather values from `forecastRows` for clicked route points. But `forecastTimeIso` still falls back to `pt.summaryForWindow?.forecastTimeIso` even when `activeCandidate` is present and `derivePointWeatherForCandidate()` returns `null`:

```ts
forecastTimeIso: dp ? dp.forecastTimeIso : derived ? derived.forecastTimeIso : pt.summaryForWindow?.forecastTimeIso,
```

That means a clicked point with an active selected departure but no usable `forecastRows` can show `Veðurspá ... kl. X` from a static/default window, while the actual active-candidate weather values are intentionally suppressed. It is the same class of stale-active-candidate fallback v022/v023 were trying to remove, just on the forecast timestamp rather than the metric values.

Recommended fix:

```ts
forecastTimeIso: dp
  ? dp.forecastTimeIso
  : derived
    ? derived.forecastTimeIso
    : activeCandidate
      ? undefined
      : pt.summaryForWindow?.forecastTimeIso,
```

Also extend the existing “no forecastRows” unit test to assert `summary.forecastTimeIso` is `undefined`.

This is probably not release-blocking if localhost cannot reproduce the no-forecastRows path, but it is a small, low-risk cleanup and I would prefer taking it before deploy.

## What Looks Good

No P1 blockers found.

The previous v023 blocker appears fixed:

- `PointDetailsPanel` now makes the full weather line primary when summary values exist.
- Single metric display is now only a fallback when no summary weather data exists.
- Non-display clicked route points now derive weather from the nearest `forecastRows` row instead of falling back to stale `summaryForWindow` values.
- The helper test now asserts exact values for the non-display active-candidate case.
- Map timestamp chips are removed from the map overlay path.

Button affordance changes are scoped and reasonable:

- route-confirm buttons now have visible clickable affordance (`shadow-sm`, pointer cursor, hover/active states)
- disabled states are explicit
- threshold submit button is disabled while either wind threshold field is empty

Design note: the button polish follows the mobile-first feedback direction in `Design.md`. I did not see a card/layout change that violates the card nesting or mobile overflow guidance.

## Files Reviewed

- `ai-handoff/2026-07-12-0910-todo-071-v024-claude-prerelease.md`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `components/weather/RouteSelectionStep.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/travelAuditMap.helpers.test.ts`

## Commands Run

```powershell
npm run type-check
```

Result: exit code 0.

```powershell
npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts
```

Result: exit code 0. `62 passed`.

I also inspected targeted diffs and relevant line ranges with `Select-String` / `Get-Content`.

## Recommendation

Ask Claude Code to make the one-line `forecastTimeIso` fallback fix and add the missing assertion. After that, localhost review should be enough.

If Stebbi wants to keep momentum and localhost does not show weird timestamp behavior when clicking points, this is not a hard stop, but it is exactly the kind of tiny stale-data edge case that is cheap to close now.

## Localhost checks for Stebbi

1. Open `/vedrid` on localhost and calculate a route with enough route points to show the map and scrubber.
2. Confirm the map itself no longer shows timestamp labels on route/weather points.
3. Click the “Mest krefjandi” point and confirm the detail panel shows the same style of information as the worst-point card:
   - punktur x/y
   - departure time
   - ETA / distance from origin
   - forecast point distance from road
   - forecast time
   - wind, precipitation and temperature on one line
   - links unchanged
4. Click a normal non-worst point on the map and confirm the same detailed structure appears, with values matching that point’s nearest forecast time.
5. Try the weather-threshold step with one field empty and confirm the calculate button is disabled and labelled `Veldu þín veðurmörk`.
6. Fill both thresholds and confirm the button becomes enabled and visually clickable.
7. Regression check: selecting a route and calculating the weather should still work for both public and signed-in flows.

No SQL, Supabase, auth, production data, secrets, deployment or billing changes were reviewed or run in this v024 check.
