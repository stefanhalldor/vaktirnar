# TODO 086 v147 - Codex review of v146 prerelease

Created: 2026-07-14 08:16
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviews: `2026-07-14-0816-todo-086-v146-claude-v145-done-prerelease.md`

## Findings

No blocking findings.

v146 fixes the v145 testing gap correctly: the decisive-provider rule is now a production helper in `lib/weather/providerComparator.ts:29`, and the new tests call that helper directly instead of duplicating the formula in the test.

## Notes / Residual Risk

- `selectDecisiveProvider` is intentionally binary. That is fine for current MET/Yr + Veðurstofan work, but before Vegagerðin participates in the same assessment, add a tiny provider-list wrapper such as `selectDecisiveProviderFromMany(assessments)` or a reducer at the call site. That avoids ad-hoc nested calls spreading into UI code.
- The current helper compares `WindDisplayStatus`, then `windMs`, then stable provider priority. That matches the v141 rule and the current wind-focused provider layer. If Vegagerðin introduces gusts, road-surface status, closures, or warnings, those should either be converted into the same display status before this helper, or handled by a broader assessment model. Do not overload `windMs` with non-wind signals.
- The known map/detail residual remains: when a non-MET provider is decisive, map selected-point/detail behavior is not fully provider-neutral yet. v146 did not claim to fix that.

## What Looks Good

- `WeatherProviderKey` is now shared from `lib/weather/providerComparator.ts`, and `components/weather/TravelAuditMap.tsx:52` uses it for overlay points.
- `FerdalagidClient.tsx:778` now returns `combinedDecisiveProvider` instead of the old `combinedDecisiveVedurstofan` boolean.
- `FerdalagidClient.tsx:784` calls `selectDecisiveProvider` with actual MET/Yr and Veðurstofan assessments.
- `rg` found no remaining `combinedDecisiveVedurstofan` references.
- No SQL, Supabase, cron, Vercel, migrations, feature access, commit, push, or deploy changes were included.

## Tests Run By Codex

```powershell
npm run test:run -- lib/__tests__/weather-provider-comparator.test.ts lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result: exit 0, 3 test files passed, 47 tests passed.

```powershell
npm run type-check
```

Result: exit 0.

## Recommended Next Step For Claude Code

Move to the generic provider-selection patch, but keep it deliberately small:

1. Add a small wrapper for selecting the decisive provider from an array, even if only two providers are passed today.
2. Model the selected/worst provider point as a single UI shape with provider key, label, status, wind, source timestamp, ETA, coordinates, and provider-specific links.
3. Use that same shape for summary "Á leiðinni", map selection, and the selected point card.
4. Keep MET/Yr destination summary as the MVP destination source until Veðurstofan/Vegagerðin destination modeling is explicitly designed.
5. Add Vegagerðin only after this selection shape exists, so it enters the same path rather than another conditional branch.

## Localhost checks for Stebbi

Preconditions:

- Localhost is running.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- Veðurstofan layer is enabled and warmed.
- Do not run migrations, cron jobs, Supabase changes, commit, push, or deploy for this check.

Checks:

1. Open Ferðaveðrið and generate a route with both MET/Yr and Veðurstofan data.
2. Turn on both `met.no` and `Veðurstofan`.
3. Find same-severity slots where MET/Yr has higher wind than Veðurstofan.
   - Expected: MET/Yr is the decisive source in the summary.
4. Find same-severity slots where Veðurstofan has higher wind than MET/Yr.
   - Expected: Veðurstofan is the decisive source in the summary.
5. Toggle MET/Yr off.
   - Expected: scrubber and summary assessment come from Veðurstofan only.
6. Toggle Veðurstofan off and MET/Yr on.
   - Expected: existing MET/Yr behavior remains unchanged.
7. Watch for the known residual:
   - non-MET provider markers are visible, but selected map point/detail behavior is not fully provider-neutral yet.
