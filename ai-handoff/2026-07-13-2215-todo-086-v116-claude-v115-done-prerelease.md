# TODO 086 v116 - Claude v115 done, prerelease

Created: 2026-07-13 22:15 Atlantic/Reykjavik
Agent: Claude Code
Implements: v115 Codex review + Stebbi's localhost feedback

## Stebbi's localhost feedback addressed

1. "Ég vil að það sé líka hægt að haka út met.no gögnin" — met.no is now a real toggle, not a locked-on indicator.
2. "Spjöldin eru enn eins / fjölgar spápunktunum ekkert" — Veðurstofan cards are now visually distinct (primary-tinted border and background, primary-colored badge). MET/Yr cards now show a `met.no` provider badge (or `met.no + Veðurstofan` when blended).

## What changed

### met.no is now a real toggle (`FerdalagidClient.tsx`)

- Added `showMetno` state (default `true`), reset to `true` on new result alongside `showVedurstofan`.
- met.no row in the provider filter changed from a static indicator to a full `<button role="switch" aria-checked={showMetno}>`.
- The entire row (switch + label) is the tap target with `min-h-[40px]` and `w-full`, meeting the 40px target.
- When `showMetno` is false, MET/Yr `RoutePointRow` cards are hidden from "Allir spápunktarnir".
- The main assessment card/result always shows regardless of `showMetno` state.

### Veðurstofan switch: full-row tap target (v111/v115 fix)

- The Veðurstofan row is now also a full-width `<button role="switch">` wrapping both the switch widget and the label.
- `min-h-[40px] w-full` ensures the entire row is tappable on mobile.

### Provider labels on MET/Yr cards

- `RoutePointRow` gained an optional `providerLabel?: string` prop.
- Call sites now pass:
  - `met.no` when showing the baseline MET/Yr result
  - `met.no + Veðurstofan` when `showVedurstofan` is true (values are max-blended)
- The label appears as a subtle `bg-muted/70` chip in `headerExtra`, before the wind status chip.

### Veðurstofan cards visually distinct

- `VedurstofanPointRow` card changed from `border-border/60` plain style to `border-primary/25 bg-primary/5` (primary-tinted border and very subtle background tint).
- Provider badge changed from `bg-muted text-muted-foreground` to `bg-primary/10 text-primary` (matches the "decisive point" badge style — clearly different from MET/Yr chip).

### New translation key

Both `messages/is.json` and `messages/en.json` (in `teskeid.vedrid.ferdalagid`):

| Key | is | en |
|---|---|---|
| `metnoBlendedLabel` | `met.no + Veðurstofan` | `met.no + Veðurstofan` |

## v115 findings status

| # | Finding | Status |
|---|---|---|
| 1 | Veðurstofan points per-station vs per-route-sample | Not changed in this patch. `layerPoints` still maps per route point. Distinct stations can appear multiple times. Stebbi should check on a real route — if duplicates are visible and confusing, dedupe by stationId in a follow-up. |
| 2 | MET/Yr cards not provider-labelled | Fixed — `met.no` badge added; blended rows show `met.no + Veðurstofan`. |
| 3 | Switch hit target too small | Fixed — whole row is now the interactive button. |
| 4 | `available` status for all-stale data | Not changed. Per-row stale indicator still works. Layer status model left for later. |
| 5 | `mm/klst` unit hardcoded in `VedurstofanPointRow` | Not changed in this patch. |

## Tests and type-check

```
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
# 2 files passed, 24 tests passed

npm run type-check
# exit 0
```

## Files changed

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `showMetno` state added
  - `setShowMetno(true)` on new result
  - Provider filter: met.no and Veðurstofan both full-row toggle buttons
  - `RoutePointRow` conditionally hidden when `!showMetno`, receives `providerLabel`
  - `RoutePointRow` component: `providerLabel` prop added, badge in `headerExtra`
  - `VedurstofanPointRow`: distinct tinted border/background and primary badge
- `messages/is.json` — added `metnoBlendedLabel`
- `messages/en.json` — added `metnoBlendedLabel`

## Localhost checks for Stebbi

Preconditions: sign in as user with `elta-vedrid` access, set `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true` and `WEATHER_ELTA_VEDRID_FLAG=true`, ensure product table is warmed.

1. Run a route weather check.
2. Confirm `Gagnaveitur` panel appears at top of result card.
3. `met.no` toggle: tap the row (not just the small switch widget). Confirm it toggles on/off.
4. With `met.no` off: confirm MET/Yr route point cards disappear from "Allir spápunktarnir". Summary card still shows.
5. With `met.no` on again: MET/Yr cards return, each with a subtle `met.no` badge.
6. `Veðurstofan (í prófun)` toggle: tap the full row. Confirm it toggles.
7. With Veðurstofan on: MET/Yr cards now show `met.no + Veðurstofan` badge (values are blended).
8. Open "Allir spápunktarnir" with Veðurstofan on: Veðurstofan station cards appear in a distinct section with primary-tinted border/background and a `Veðurstofan (í prófun)` primary badge — clearly different from MET/Yr cards.
9. Veðurstofan cards do not show Yr or met.no links. They show a `vedur.is` link when `sourceUrl` is available.
10. Toggle met.no off and Veðurstofan on: only Veðurstofan station cards visible in the point list.
11. `Vegagerðin (í vinnslu)` is visible and grayed out, not interactive.
12. Toggle Veðurstofan on/off: forecast drawer and comparison drawer close automatically.
13. At 360, 390, 460 px: no overflow, provider filter rows are fully tappable, labels wrap cleanly.
14. With feature flag/access off: provider filter not visible, existing weather flow unchanged.
