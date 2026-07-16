# TODO 086 v146 - Claude done: provider comparator extracted, prerelease

Created: 2026-07-14 08:16 Atlantic/Reykjavik
Agent: Claude Code
Implements: `2026-07-14-0809-todo-086-v145-codex-v144-prerelease-review.md`

## Result

Type-check: exit 0
Tests: 145 passed + 5 skipped = 150 total (was 134+5=139 before this batch)

## Changes Made

### `lib/weather/providerComparator.ts` (new file)

Extracted provider-neutral comparator helper, ready for Vegagerðin without further restructuring.

Exports:

```ts
export type WeatherProviderKey = 'metno' | 'vedurstofan' | 'vegagerdin'

export type ProviderSlotAssessment = {
  provider: WeatherProviderKey
  status: WindDisplayStatus
  windMs: number | null
}

export function selectDecisiveProvider(
  a: ProviderSlotAssessment,
  b: ProviderSlotAssessment,
): ProviderSlotAssessment
```

`selectDecisiveProvider` implements the v141 tie-break exactly:
1. Worse severity (lower `WIND_DISPLAY_STATUS_PRIORITY_ORDER` index) wins.
2. Same severity: higher `windMs` wins.
3. Same severity + same wind: stable provider order (`vegagerdin > vedurstofan > metno`).

### `lib/__tests__/weather-provider-comparator.test.ts` (new file)

11 focused tests for `selectDecisiveProvider`, organized in four groups:
- `severity wins first` (3 tests): vedurstofan worse severity beats MET/Yr, MET/Yr worse beats Veðurstofan, haettulegt always beats othaegilegt.
- `same severity: higher windMs wins` (2 tests): MET/Yr 11 m/s beats Veðurstofan 8 m/s; Veðurstofan 13 m/s beats MET/Yr 9 m/s.
- `same severity and same windMs: stable provider order` (4 tests): Veðurstofan beats MET/Yr; Veðurstofan beats MET/Yr when both null; Vegagerðin beats Veðurstofan; Vegagerðin beats MET/Yr.
- `argument order does not affect result` (2 tests): severity and windMs checks are symmetric.

These tests exercise the actual production helper directly, not a re-implementation (fixes the v143/v145 Low finding).

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

- **Removed** local `type WeatherProviderKey` definition (line 33).
- **Added** import: `import { type WeatherProviderKey, selectDecisiveProvider } from '@/lib/weather/providerComparator'`
- **Replaced** `combinedDecisiveVedurstofan: boolean` with `combinedDecisiveProvider: WeatherProviderKey | null`:
  ```ts
  const combinedDecisiveProvider: WeatherProviderKey | null = (() => {
    if (!showMetno || !showVedurstofan) return null
    if (!worstVedurstofanData || !activeOutboundCandidate) return null
    const vedurstofanDs = worstVedurstofanData.status
    if (vedurstofanDs === 'no_data') return null
    const metnoDs = classifyCandidateWindDisplayStatus(activeOutboundCandidate, effectiveThresholds)
    const decisive = selectDecisiveProvider(
      { provider: 'vedurstofan', status: vedurstofanDs, windMs: worstVedurstofanData.windMs },
      { provider: 'metno', status: metnoDs, windMs: activeOutboundCandidate.worstWind?.value ?? null },
    )
    return decisive.provider
  })()
  ```
- **Updated** JSX condition: `combinedDecisiveVedurstofan` → `combinedDecisiveProvider === 'vedurstofan'`.
- When Vegagerðin is added, passing a third assessment to `selectDecisiveProvider` (or chaining two calls) will extend this naturally.

### `components/weather/TravelAuditMap.tsx`

- **Added** import: `import { type WeatherProviderKey } from '@/lib/weather/providerComparator'`
- **Updated** `ProviderMapPoint.provider` from inline `'metno' | 'vedurstofan' | 'vegagerdin'` to `WeatherProviderKey`.

## What Was NOT Changed

- `selectDecisiveProvider` does not yet support three-provider aggregation (Vegagerðin). When Vegagerðin is added, call `selectDecisiveProvider` twice (a vs b, then winner vs c) or add a variadic wrapper.
- Map selected-point / detail panel still uses MET/Yr route points when Veðurstofan is decisive. Deferred to next generic provider-selection patch.
- SQL, Supabase, cron, Vercel, migrations, feature access.
- No commit, no push.

## Open Items After v146

### Next: Generic provider-selection on the map
- Clickable Veðurstofan overlay markers rendering a provider-specific detail card.
- When `combinedDecisiveProvider === 'vedurstofan'`, the map selected-point should reflect the decisive Veðurstofan station.
- Same selection model will be reused for Vegagerðin.
