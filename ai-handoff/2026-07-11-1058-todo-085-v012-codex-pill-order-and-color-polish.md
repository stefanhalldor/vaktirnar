# TODO 085 - Pill order and color polish

Created: 2026-07-11 10:58
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: UI polish handoff
Related TODO: #85 Wind threshold simplification and fine-grained wind labels
Context: Stebbi screenshot after v010 prerelease

## Stebbi's Observation

The status pills now use the new labels, but the ordering and color still feel wrong.

Screenshot example:

- `😟 Óþægilegt (12)`
- `😬 Nálgast óþægindi (32)`
- `🙂 Innan marka (117)`
- `– Ófullnægjandi gögn (50)`

Problems:

1. The pills are not in the natural user-facing order.
2. `Óþægilegt` does not have enough visible color; it should clearly read as orange.

## Root Cause / Likely Cause

`lib/weather/windDisplayStatus.ts` currently has:

```ts
export const WIND_DISPLAY_STATUS_ORDER: WindDisplayStatus[] = [
  'haettulegt',
  'nalgast-haettumork',
  'othaegilegt',
  'nalgast-othaegindi',
  'innan-marka',
  'no_data',
]

export const ALL_WIND_DISPLAY_STATUSES: WindDisplayStatus[] = WIND_DISPLAY_STATUS_ORDER
```

That order is good for severity priority and auto-select, but not good for pill display. The user-facing pill row should read like a weather scale from safe to dangerous.

## Required Product Behavior

Use two separate orders:

### Display order for pills

```ts
[
  'innan-marka',
  'nalgast-othaegindi',
  'othaegilegt',
  'nalgast-haettumork',
  'haettulegt',
  'no_data',
]
```

This should apply to:

- DepartureHeatmap scrubber pills.
- TravelAuditMap map pills.
- Any other visible status filter chip list.

### Priority order for auto-select

Keep severity-first priority for choosing the most important visible slot:

```ts
[
  'haettulegt',
  'nalgast-haettumork',
  'othaegilegt',
  'nalgast-othaegindi',
  'innan-marka',
  'no_data',
]
```

This should continue to apply to auto-selection logic in `FerdalagidClient`.

## Recommended Implementation

In `lib/weather/windDisplayStatus.ts`, split the arrays:

```ts
export const WIND_DISPLAY_STATUS_PRIORITY_ORDER: WindDisplayStatus[] = [
  'haettulegt',
  'nalgast-haettumork',
  'othaegilegt',
  'nalgast-othaegindi',
  'innan-marka',
  'no_data',
]

export const WIND_DISPLAY_STATUS_PILL_ORDER: WindDisplayStatus[] = [
  'innan-marka',
  'nalgast-othaegindi',
  'othaegilegt',
  'nalgast-haettumork',
  'haettulegt',
  'no_data',
]
```

Then:

- Use `WIND_DISPLAY_STATUS_PRIORITY_ORDER` in auto-selection.
- Use `WIND_DISPLAY_STATUS_PILL_ORDER` in `DepartureHeatmap` and `TravelAuditMap`.
- Either remove `ALL_WIND_DISPLAY_STATUSES`, or make it explicitly alias `WIND_DISPLAY_STATUS_PILL_ORDER` only if all current callers are display callers. Avoid ambiguous naming if possible.

## Color Polish

`Óþægilegt` should have a clearly orange visual treatment. It is not enough that the emoji differs.

Recommended metadata for `othaegilegt`:

- dot: orange
- border: orange
- active pill background: subtle orange
- label/text: orange or foreground with clearly orange dot and border

If the current pill renderer only uses `dotClass` and `borderClass`, add a `chipActiveClass` or similar to `WIND_STATUS_META`, for example:

```ts
chipActiveClass: 'border-orange-500 bg-orange-50 text-orange-700'
```

Suggested chip classes:

- `innan-marka`: green border/background tint
- `nalgast-othaegindi`: amber/yellow border/background tint
- `othaegilegt`: orange border/background tint
- `nalgast-haettumork`: red border/background tint, possibly lighter than dangerous
- `haettulegt`: red/destructive border/background tint
- `no_data`: muted grey

Keep this accessible for colorblind users:

- Keep emoji/icons.
- Keep text label.
- Do not rely on color alone.

## Acceptance Criteria

- The pill row reads:
  - `🙂 Innan marka`
  - `😬 Nálgast óþægindi`
  - `😟 Óþægilegt`
  - `😰 Nálgast hættumörk`
  - `⚠️ Hættulegt`
  - `Ófullnægjandi gögn`
- Statuses with zero count can remain hidden except `Innan marka` if the existing behavior intentionally always shows it.
- Auto-selection still prioritizes the most severe visible status, not the first pill in display order.
- `Óþægilegt` has a clear orange treatment in both scrubber pills and map pills.
- No hviður/gust values are reintroduced.

## Localhost Checks for Stebbi

1. Open `/vedrid` on localhost.
2. Use a route/threshold setup that creates at least:
   - `Innan marka`
   - `Nálgast óþægindi`
   - `Óþægilegt`
   - `Ófullnægjandi gögn`
3. Confirm the pill order is safe-to-danger:
   - `Innan marka`
   - `Nálgast óþægindi`
   - `Óþægilegt`
   - `Nálgast hættumörk`
   - `Hættulegt`
   - `Ófullnægjandi gögn`
4. Confirm `Óþægilegt` is visibly orange, not visually washed out.
5. Click the `Óþægilegt` pill and confirm the scrubber filters correctly.
6. Confirm the selected slot jumps to the most severe visible slot when filtering still works.
7. Open the map section and confirm the map pill order and colors match the scrubber.
8. Confirm no measured gust/hviður values appear in result text, map details, point cards, comparison strip, or drawer.

No SQL, RLS, auth, Supabase, secrets, billing, production data, or deployment changes are involved.

## Óvissa / þarf að staðfesta

- I did not browser-test the exact color rendering. The recommendation is based on Stebbi's screenshot and the current metadata in `lib/weather/windDisplayStatus.ts`.
- If Claude Code already has another design token pattern for status chips, use that instead of hardcoding new Tailwind class names.
