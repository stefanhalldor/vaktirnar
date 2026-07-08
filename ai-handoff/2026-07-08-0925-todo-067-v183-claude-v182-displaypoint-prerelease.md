# TODO-067 v183 - Claude handoff - displayPoint and forecast line fix

Created: 2026-07-08 09:25
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Changes written, type-checked, all tests passing. Awaiting commit/push and Stebbi localhost review.

## What was fixed

### 1. CandidateDisplayPoint — new type, computed server-side in evaluateCandidate

`lib/weather/types.ts`

Added `CandidateDisplayPoint` type:

```ts
export type CandidateDisplayPoint = {
  routeIndex: number
  forecastTimeIso: string
  windMs: number
  gustMs: number
  precipMmPerHour: number
  airTemperatureC: number
  metric: 'wind' | 'gust' | 'precipitation'
}
```

Added optional `displayPoint?: CandidateDisplayPoint` to `TravelCandidate`.

`lib/weather/travel.ts` — `evaluateCandidate`

After computing `legResult`, uses the same decisive-metric logic as `candidateToIssue` / `buildHighlightedIssue` (precipitation → gust if gust >= redGustMs → wind) to identify the worst metric point. Finds the matching `TravelPointForecast` by `routeIndex` and the matching `HourPoint` by `timeIso`, then builds `displayPoint` with values from that exact hour.

This means `displayPoint` is always consistent with the candidate's departure time window — the same values that drove the candidate's status calculation.

Not set for `no_data` candidates (early-return path before `displayPoint` is computed).

### 2. buildPointSummary — uses displayPoint when routeIndex matches

`components/weather/travelAuditMap.helpers.ts`

Added `isDisplayPoint = !isHighlighted && activeCandidate?.displayPoint?.routeIndex === pt.routeIndex`.

Priority when `activeCandidate` is set:

1. `isHighlighted` (non-green slot with an issue) → `summaryForWindow` (unchanged from v180)
2. `isDisplayPoint` (auto-selected worst point for green/any slot) → `displayPoint` values
3. All other manually selected points → metrics suppressed (unchanged from v180)

The `dp` alias makes the ternaries readable:
```ts
const dp = isDisplayPoint ? activeCandidate!.displayPoint! : undefined
windMs: dp ? dp.windMs : (showSummaryMetrics ? (summaryForWindow?.worstWindMs ?? 0) : 0),
...
decisiveTimeFormatted: dp ? formatKlTime(dp.forecastTimeIso) : (...)
```

This fixes the specific regression from v180: the auto-selected `Mest krefjandi á leiðinni` point for a green slot now shows real wind/gust/precip/temp/forecastTime from the active candidate's decisive hour, not zero values.

### 3. initialSelectedIndex — prefers displayPoint.routeIndex

`components/weather/travelAuditMap.helpers.ts`

```ts
const worstRouteIdx =
  activeCandidate?.displayPoint?.routeIndex ??
  activeCandidate?.worstWind?.routeIndex ??
  activeCandidate?.worstGust?.routeIndex ??
  activeCandidate?.worstPrecip?.routeIndex
```

`displayPoint.routeIndex` is always the decisive metric point, so this is more precise than the old per-metric fallback chain.

### 4. Forecast line order fixed

`components/weather/TravelAuditMap.tsx`

Old (wrong order): `Veðurspá kl. {time} á þessum stað`
New (correct order): `Veðurspá á þessum stað kl. {time}`

Changed from three separate keys to one combined key:
```tsx
{decisiveTime && (
  <span>{tf('pointForecastHereAt', { time: decisiveTime })}</span>
)}
```

New message keys:
- IS: `"pointForecastHereAt": "Veðurspá á þessum stað kl. {time}"`
- EN: `"pointForecastHereAt": "Forecast at this point at {time}"`

Old keys `pointForecastLabel` and `pointForecastHere` kept in message files (harmless, used by no other code path).

## Files changed

- `lib/weather/types.ts`
- `lib/weather/travel.ts`
- `components/weather/travelAuditMap.helpers.ts`
- `components/weather/TravelAuditMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/travelAuditMap.helpers.test.ts` (10 new tests)
- `lib/__tests__/weather-travel.test.ts` (4 new tests)

## Commands run

```
npm run type-check  # exit 0, no errors
npm run test:run    # 58 files, 1868 passed (was 1858), 27 skipped, 8 todo — all green
```

## No changes to

- SQL, RLS, auth, env, Supabase, migrations, deployment config
- Route fetching, Google Maps provider, saved places

## Localhost checks for Stebbi

Use `/auth-mvp/vedrid` with `Garðabær -> Egilsstaðir` or another long route.

1. Select a green departure slot (e.g. `09:10`).
2. Map auto-selects `Mest krefjandi á leiðinni` at the worst wind/gust point.
3. Expected card:
   - `Brottfarartími: kl. 09:10`
   - `Áætlaður tími X km frá Garðabæ: kl. HH:MM`
   - `Veðurspá á þessum stað kl. HH:MM` (new order, no longer "kl. HH:MM á þessum stað")
   - `Vindur: X m/s · Hviður: Y m/s · Úrkoma: Z mm/klst · Hiti: T°C`
4. Click another point manually.
5. Expected: `Valin veðurspá` shows no stale weather values (only ETA and departure).
6. Select a yellow departure slot.
7. Expected: challenging point still shows active-candidate values (not old default-window values).
8. Verify forecast line reads `Veðurspá á þessum stað kl. HH:MM` (not reversed).
9. Check 360px mobile width for no overlap or overflow.
