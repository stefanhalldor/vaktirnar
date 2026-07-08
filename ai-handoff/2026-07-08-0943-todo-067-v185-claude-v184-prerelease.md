# TODO-067 v185 - Claude handoff - v184 slot detail prerelease

Created: 2026-07-08 09:43
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Committed and pushed. Vercel deploy in progress. Awaiting Stebbi localhost review.

Commit: `965d43f`

## Sessions covered

This handoff covers work done in two commits since v183:

- `83fe904` — CandidateDisplayPoint, forecast line order fix (v183)
- `965d43f` — displayPoint-driven top slot detail, distance + ETA + weather (v184)

## What shipped

### v183 — `83fe904`

**CandidateDisplayPoint** (`lib/weather/types.ts`, `lib/weather/travel.ts`)

New type added to `TravelCandidate`:

```ts
type CandidateDisplayPoint = {
  routeIndex: number
  forecastTimeIso: string
  windMs: number
  gustMs: number
  precipMmPerHour: number
  airTemperatureC: number
  metric: 'wind' | 'gust' | 'precipitation'
  distanceFromOriginM: number  // added in v184
  routeFraction: number        // added in v184
}
```

`evaluateCandidate` in `travel.ts` computes `displayPoint` using the same decisive-metric logic as `candidateToIssue` / `buildHighlightedIssue`. Values come from the exact `HourPoint` that drove the candidate's status decision — wind/gust/precip/temp are always consistent with the selected departure window. Not set for `no_data` candidates.

**`buildPointSummary`** — three-tier priority when `activeCandidate` is set:
1. `isHighlighted` point → `summaryForWindow` (candidateToIssue already carries active-candidate values here)
2. `isDisplayPoint` (routeIndex matches `displayPoint`) → `displayPoint` values
3. All other manually selected points → metrics suppressed (unchanged from v180)

**`initialSelectedIndex`** — prefers `displayPoint.routeIndex` before `worstWind/worstGust/worstPrecip` fallback chain.

**Forecast line order fixed** (`TravelAuditMap.tsx`):
- Old: `Veðurspá kl. HH:MM á þessum stað`
- New: `Veðurspá á þessum stað kl. HH:MM`

New message key `pointForecastHereAt` (IS + EN).

14 new tests in `travelAuditMap.helpers.test.ts` and `weather-travel.test.ts`.

### v184 — `965d43f`

**`CandidateDisplayPoint`** extended with `distanceFromOriginM` and `routeFraction` so `SlotDetail` can compute route-point ETA and leg distance independently.

**`DepartureHeatmap.tsx` — `SlotDetail`**

When `candidate.displayPoint` is present, shows:

```
Brottför: kl. 09:22 · Komutími: kl. 17:02
Mest krefjandi er 501 km frá Garðabæ, kl. 15:24.
Vindur: 6,8 m/s · Úrkoma: 0,1 mm/klst · Hiti: 15,2°C
```

The time `kl. 15:24` is the **estimated arrival at the route point** (from departure/arrival ISO + routeFraction), not the forecast hour. The lower map panel continues to show the forecast hour separately via `Veðurspá á þessum stað kl. ...`.

Old `worstWind/worst*` fallback kept for candidates without `displayPoint` — no existing behavior removed.

New message keys: `slotDetailWorstDistanceAt`, `slotDetailWeatherSummary` (IS + EN).

## Commands run

```
npm run type-check  # exit 0 (both commits)
npm run test:run    # 58 files, 1868 passed, 27 skipped, 8 todo — all green (both commits)
```

## Files changed

**v183 (`83fe904`):**
- `lib/weather/types.ts`
- `lib/weather/travel.ts`
- `components/weather/travelAuditMap.helpers.ts`
- `components/weather/TravelAuditMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/travelAuditMap.helpers.test.ts`
- `lib/__tests__/weather-travel.test.ts`

**v184 (`965d43f`):**
- `lib/weather/types.ts`
- `lib/weather/travel.ts`
- `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/travelAuditMap.helpers.test.ts`

## No changes to

- SQL, RLS, auth, env, Supabase, migrations, deployment config
- Route fetching, Google Maps provider, saved places

## Vercel status

Commits `83fe904` and `965d43f` — monitor Vercel until build confirmed green.

## Localhost checks for Stebbi

Use `/auth-mvp/vedrid` with `Garðabær -> Egilsstaðir` or another long route.

### Top slot detail (v184)

1. Select a green departure slot (e.g. `09:10`).
2. Expected top slot detail box shows:
   - `Brottför: kl. 09:10 · Komutími: kl. HH:MM`
   - `Mest krefjandi er X km frá Garðabæ, kl. HH:MM.` — the time here is the estimated arrival at that route point, not the forecast hour
   - `Vindur: X m/s · Úrkoma: Y mm/klst · Hiti: Z°C`
3. Select a yellow slot.
4. Expected: same three-line format, values change to match the selected departure window.
5. Switch between slots rapidly — expected: top box updates with each slot, no stale values.

### Lower map panel (v183)

6. After selecting a slot, map auto-selects `Mest krefjandi á leiðinni`.
7. Expected lower panel:
   - `Brottfarartími: kl. HH:MM`
   - `Áætlaður tími X km frá Garðabæ: kl. HH:MM`
   - `Veðurspá á þessum stað kl. HH:MM` (new order — was `Veðurspá kl. HH:MM á þessum stað`)
   - `Vindur: X m/s · Hviður: Y m/s · Úrkoma: Z mm/klst · Hiti: T°C`
8. Click another point manually.
9. Expected: `Valin veðurspá` panel shows no stale weather values (only departure + ETA + links).
10. Select a green slot → expected: top card says departure is good, map shows worst point, lower panel shows values, no resurrection of old `highlightedIssue`.
11. Check 360px mobile width — no horizontal overflow, no overlap.
