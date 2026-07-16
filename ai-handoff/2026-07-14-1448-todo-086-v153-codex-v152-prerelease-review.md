# TODO 086 v153 - Codex review of v152 prerelease

Created: 2026-07-14 14:48
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviews: `2026-07-14-1446-todo-086-v152-claude-v151-done-prerelease.md`

## Findings

No blocking findings.

The v151 Medium finding is fixed. `components/weather/TravelAuditMap.tsx` now has a shared `overlayIsVisible(...)` helper and uses it consistently for:

- overlay marker visibility
- highlighted overlay auto-select
- selected overlay replacement in `toggleMapStatus`
- `selectionResetSignal` slot-reset behavior

That means the map should no longer auto-select or keep showing a Veðurstofan overlay point that is hidden by the active status filter.

## Low - Overlay marker/detail text still has small localization/formatting debt

`components/weather/TravelAuditMap.tsx:347`
`components/weather/TravelAuditMap.tsx:348`
`components/weather/TravelAuditMap.tsx:731`

The overlay marker title still builds user-visible text inline:

```ts
titleParts.push(`${sp.windMs} m/s`)
titleParts.push(`spá kl. ${formatKlTime(sp.forecastTimeIso)}`)
```

The overlay detail panel also prints raw wind:

```tsx
<span>{point.windMs} m/s</span>
```

This is not a prerelease blocker, but it should be cleaned up soon:

- use existing translation keys where possible (`vedurstofanForecastFrom`, `metricWind`)
- format wind with the same locale-aware helper used elsewhere (`formatNum`)
- avoid Icelandic hardcoded tooltip/title text in English locale

## What Looks Good

- The overlay visibility rule is now centralized and easier to reuse for Vegagerðin.
- The reset effect now respects active filters and falls back to first visible overlay or MET/Yr selection.
- The change is scoped to `TravelAuditMap.tsx`; no SQL, Supabase, cron, Vercel, migrations, feature access, commit, push, or deploy changes were included.
- The implementation still follows the compact structured panel pattern from `Design.md`: semantic border/card tokens, compact text, and no nested card-in-card structure beyond the existing map detail panel.

## Tests Run By Codex

```powershell
npm run test:run -- lib/__tests__/weather-provider-comparator.test.ts lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result: exit 0, 3 test files passed, 47 tests passed.

```powershell
npm run type-check
```

Result: exit 0.

```powershell
git diff --check -- components/weather/TravelAuditMap.tsx app/auth-mvp/vedrid/FerdalagidClient.tsx lib/weather/providerComparator.ts lib/__tests__/weather-provider-comparator.test.ts
```

Result: exit 0.

## Recommended Next Step For Claude Code

This can proceed to Stebbi localhost verification.

After Stebbi confirms the map/filter behavior, the next small technical cleanup should be:

1. Replace hardcoded overlay marker/detail strings with translations and locale formatting.
2. Then add provider identity cleanup before Vegagerðin lands: use a composite overlay key (`provider:id`) instead of bare station id.

Keep Vegagerðin integration separate from this prerelease validation.

## Localhost checks for Stebbi

Preconditions:

- Localhost is running.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- Veðurstofan layer is enabled and warmed.
- Do not run migrations, cron jobs, Supabase changes, commit, push, or deploy for this check.

Checks:

1. Generate a route with both `met.no` and `Veðurstofan` active.
2. Confirm map pills show combined point counts for MET/Yr + Veðurstofan.
3. Click a Veðurstofan marker.
   - Expected: map card shows that station.
4. Hide that station's status using the map pill filter.
   - Expected: marker hides and the card no longer shows that hidden station.
5. While the filter is still active, change the departure slot.
   - Expected: the card does not auto-select a hidden Veðurstofan station.
6. If another visible Veðurstofan station exists, it may select that station.
7. If no visible Veðurstofan station exists and MET/Yr is active, fallback to MET/Yr selection or no card is acceptable.
8. Clear the filter.
   - Expected: Veðurstofan markers and eligible auto-selection return.
9. Turn MET/Yr off and leave only Veðurstofan.
   - Expected: pills, markers, and map card are all Veðurstofan-only.

## Óvissa / þarf að staðfesta

- I did not run browser/Google Maps interaction tests. This review is based on code inspection plus targeted unit tests/type-check.
- There still appears to be no automated component test for `TravelAuditMap` overlay filter/reset behavior, so Stebbi's localhost verification is important.
