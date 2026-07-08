# TODO-071 v004 - Claude handoff - numeric distance + full RoutePointRow

Created: 2026-07-08 15:00
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Implementation complete. Awaiting Stebbi localhost review and explicit commit/push approval.

## What changed

### `components/weather/travelAuditMap.helpers.ts`

Exported `haversineMeters` so it can be used in `RoutePointRow`:

```ts
export function haversineMeters(a: LatLngLiteral, b: LatLngLiteral): number {
```

### `components/weather/TravelAuditMap.tsx` — PointDetailsPanel section 5

Removed the `< 50 m` fuzzy-wording branch. Distance is now always shown as a numeric value:

```tsx
{summary.forecastDistanceFromRouteM < 1000
  ? tf('forecastPointDistanceMeters', { meters: summary.forecastDistanceFromRouteM })
  : tf('forecastPointDistanceKilometers', { kilometers: formatNum(...) })}
```

`forecastPointOnRoute` ("Spápunktur er nánast á veginum.") is now unused in the main card. The key is kept in both message files for now and can be removed in a later cleanup pass.

### `app/auth-mvp/vedrid/FerdalagidClient.tsx` — RoutePointRow

Rebuilt to show the same information order as `PointDetailsPanel`. Added:
- `useLocale()` hook
- `haversineMeters` import
- `forecastDistanceM` computed from route vs forecast coordinates
- ETA line (`Áætlaður tími: kl. X`) when `summaryForWindow.etaIso` is present
- Forecast distance line (always numeric, same logic as main card)
- Forecast time line (`Veðurspá á þessum stað kl. X`) when `summaryForWindow.forecastTimeIso` is present
- Temperature (`· Hiti: X°C`) added to weather values line
- Raw met.no coord line removed (replaced by structured metadata)
- Weather values formatted using `formatNum` for locale-aware decimals instead of `.toFixed(1)`

Row info order:
1. `Punktur x/y` + badges
2. `N km frá uppruna`
3. `Áætlaður tími: kl. ...` (if etaIso)
4. `Spápunktur um X m frá veginum.`
5. `Veðurspá á þessum stað kl. ...` (if forecastTimeIso)
6. `Vindur · Úrkoma · Hiti`
7. Links

Note: departure time (`Brottfarartími`) is not available in `RouteWeatherPoint`, so that line is omitted from all-points rows. All other metadata matches the main card.

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 59 files, 1902 passed, 27 skipped, 8 todo — all green
```

## Files changed

- `components/weather/travelAuditMap.helpers.ts`
- `components/weather/TravelAuditMap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

## No changes to

- `messages/is.json` / `messages/en.json` (no new keys needed; `forecastPointOnRoute` left in place as unused cleanup for later)
- `lib/weather/types.ts`, SQL, auth, Supabase

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid` and calculate a route.
2. Expected main card: `Spápunktur um X m frá veginum.` shows a number, never "nánast á veginum".
3. Open `Allir spápunktarnir á leiðinni`.
4. Expected each `Punktur x/y` row shows:
   - distance from origin
   - ETA (if available)
   - `Spápunktur um X m frá veginum.`
   - `Veðurspá á þessum stað kl. ...`
   - wind/precipitation/temperature
   - the three links
5. Test mobile widths 360-460 px — no horizontal overflow.
6. Three links (`Skoða veðurspá`, `Opna á korti`, `Hrá met.no gögn`) unchanged.

No Supabase migration, production data, auth config, billing, secrets, commit, push or deploy is part of these checks.
