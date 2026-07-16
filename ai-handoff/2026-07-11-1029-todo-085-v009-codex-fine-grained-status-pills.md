# TODO 085 - Fine-grained wind status must drive pills, counts, and map markers

Created: 2026-07-11 10:29
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Addendum / implementation handoff
Related TODO: #85 Wind threshold simplification
Context: Stebbi screenshot after v007/v008 review

## Stebbi's New Observation

Stebbi tested with thresholds around `9.5/15 m/s`. The selected summary correctly shows:

- `😬 Nálgast óþægindi`

But the heatmap/filter pill still says:

- `Innan marka (149)`

And the map filter pill still says:

- `Innan marka (68)`

That is inconsistent. If a slot/point is close enough to the uncomfortable wind threshold to be `Nálgast óþægindi`, it should not be counted or colored as plain `Innan marka`.

## Root Cause

The new five-level display status only exists in the result summary row:

- `classifyWindDistance()`
- `WIND_STATUS_META`
- the `Á leiðinni` display in `app/auth-mvp/vedrid/FerdalagidClient.tsx`

But the scrubber and map filter systems still use the old coarse statuses:

- `components/weather/DepartureHeatmap.tsx`
  - `ALL_SLOT_STATUSES: ['graent', 'gult', 'rautt', 'no_data']`
  - `statusCounts` counts `slotStatus(c)`
  - filtering is based on `graent/gult/rautt/no_data`
- `components/weather/TravelAuditMap.tsx`
  - `MAP_PILL_STATUSES: ['graent', 'gult', 'rautt', 'no_data']`
  - `mapStatusCounts` counts old status values
  - marker visibility/color is based on old status values
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - state types are still `Set<SlotStatus>` for scrubber and map filters
  - auto-selection after filtering still prioritizes `rautt`, then `gult`, then any

So near-threshold green slots remain counted and displayed as `Innan marka`.

## Required Behavior

The fine-grained wind label should apply consistently to:

1. Heatmap/scrubber filter pills and counts.
2. Heatmap/scrubber dot color.
3. Map visibility pills and counts.
4. Map point/marker color where the point has a wind value.
5. Detail card status badge where possible.

Expected filter/status labels:

- `🙂 Innan marka`
- `😬 Nálgast óþægindi`
- `😟 Óþægilegt`
- `😰 Nálgast hættumörk`
- `⚠️ Hættulegt`
- `Ófullnægjandi gögn`

In the screenshot case, `Nálgast óþægindi` should have its own pill and count. Those candidates/points should not be counted under `Innan marka`.

## Recommended Implementation

### 1. Create one shared display status helper

Avoid duplicating classification logic in `FerdalagidClient`, `DepartureHeatmap`, and `TravelAuditMap`.

Suggested shape:

```ts
export type WindDisplayStatus = WindDistanceLabel | 'no_data'

export function classifyCandidateWindDisplayStatus(
  candidate: TravelCandidate,
  thresholds: ResolvedTravelThresholds,
): WindDisplayStatus
```

Rules:

- If `candidate.reasonCode === 'no_data'`, return `no_data`.
- Otherwise use `candidate.worstWind?.value` if available.
- Classify with `classifyWindDistance(wind, thresholds.cautionWindMs, thresholds.redWindMs)`.
- Do not classify by gust.
- Do not classify by precipitation in this #85 phase.

For map points, create a sibling helper:

```ts
export function classifyPointWindDisplayStatus(
  windMs: number | undefined,
  hasData: boolean,
  thresholds: ResolvedTravelThresholds,
): WindDisplayStatus
```

or equivalent local adapter in `TravelAuditMap`, as long as it uses the same classifier.

### 2. Move display metadata out of `FerdalagidClient`

`WIND_STATUS_META` currently lives in `app/auth-mvp/vedrid/FerdalagidClient.tsx`.

Move the status metadata to a shared UI helper, for example:

- `components/weather/windDisplayStatus.ts`

or a domain-safe helper if no React/UI classes are included:

- `lib/weather/windDisplayStatus.ts`

It needs:

- label key
- icon
- dot/marker color class or color token
- priority order

Recommended order for filters and auto-select:

1. `haettulegt`
2. `nalgast-haettumork`
3. `othaegilegt`
4. `nalgast-othaegindi`
5. `innan-marka`
6. `no_data`

### 3. Update `DepartureHeatmap`

Change filter/count logic from coarse `SlotStatus` to fine-grained `WindDisplayStatus`.

Key places:

- `ALL_SLOT_STATUSES`
- `statusCounts`
- `filteredWithIdx`
- `toggleStatus`
- dot color / `STATUS_BG`
- selected slot visible-check
- empty-filter copy that currently assumes green only

Important: `thresholdsUsed` is optional today. For this flow it is passed. If `thresholdsUsed` is missing, fall back safely to old coarse status or resolve defaults. Prefer requiring `thresholdsUsed` where this component is used in Ferðaveðrið, if TypeScript allows it without unnecessary churn.

### 4. Update parent state types in `FerdalagidClient`

The filter state is currently:

```ts
useState<Set<SlotStatus>>
```

Update to:

```ts
useState<Set<WindDisplayStatus>>
```

for:

- `outboundVisibleStatuses`
- `returnVisibleStatuses`
- `mapOutboundVisibleStatuses`

Then update filter auto-selection logic:

- do not look for `rautt`/`gult` directly
- use the display status priority order above
- if selected slot no longer matches the active fine-grained filter, select the first visible candidate by priority

### 5. Update `TravelAuditMap`

Map filters and marker colors must use the same fine-grained status.

Key places:

- `visibleStatuses?: Set<WeatherStatus | 'no_data'>`
- `onVisibleStatusesChange`
- marker visibility in the marker update effect
- `mapStatusCounts`
- `MAP_PILL_STATUSES`
- pill label/dot class

TravelAuditMap probably needs `thresholdsUsed?: ResolvedTravelThresholds` passed from `FerdalagidClient`, because it cannot classify `Nálgast óþægindi` without the user's chosen thresholds.

Implementation detail:

- For route points, use the point summary wind value that corresponds to the active candidate/window.
- If the point has no data, keep `no_data`.
- If only coarse status is available and no wind value exists, fall back conservatively.

### 6. Update route point detail badge if possible

`RoutePointRow` still maps:

- `graent` -> `Innan marka`
- `gult` -> `Óþægilegt`
- `rautt` -> `Hættulegt`

If the row has a wind value and thresholds, use the fine-grained label there too. This matters because detail cards should not say `Innan marka` when they are within 2 m/s of the uncomfortable threshold.

### 7. Keep internal domain status unchanged

Do not rewrite `WeatherStatus = graent | gult | rautt` in this patch.

This is a display/filter layer. The deterministic backend can continue returning coarse statuses. The UI maps those candidates/points into fine-grained wind display statuses.

## Acceptance Criteria

- With thresholds `9.5/15`, a candidate with wind `7.8 m/s` shows and counts as `Nálgast óþægindi`, not `Innan marka`.
- Scrubber has a `Nálgast óþægindi` pill with count.
- The same candidates are not counted in `Innan marka`.
- Scrubber dots for `Nálgast óþægindi` are visually yellow/stressed, not green.
- Map filter pills include `Nálgast óþægindi` when applicable.
- Map points that are near threshold are colored consistently with `Nálgast óþægindi`.
- `Innan marka` count only includes truly within-limits points that are not within 2 m/s of uncomfortable wind threshold.
- No gust value is reintroduced.
- TypeScript stays green.

## Tests / Verification To Add If Practical

- Unit test for a display helper:
  - wind `7.8`, thresholds `9.5/15` -> `nalgast-othaegindi`
  - wind `7.4`, thresholds `9.5/15` -> `innan-marka`
  - wind `13.5`, thresholds `9.5/15` -> `nalgast-haettumork`
- If component tests exist for `DepartureHeatmap`, add one asserting the chip label/count changes from `Innan marka` to `Nálgast óþægindi` for near-threshold wind.

## Localhost Checks For Stebbi

1. Open `/vedrid` on localhost in mobile width.
2. Choose a route and set wind thresholds so a current selected slot is less than 2 m/s below the uncomfortable threshold, e.g. observed wind `7.8` and threshold `9.5`.
3. Confirm the `Á leiðinni` row says `Nálgast óþægindi`.
4. Confirm the scrubber/filter pill also says `Nálgast óþægindi`, with the correct count.
5. Confirm the same slots are not counted under `Innan marka`.
6. Confirm the scrubber dot color matches the near-discomfort status, not green.
7. Open the map/audit section.
8. Confirm map filter pills include `Nálgast óþægindi` when points fall into that range.
9. Confirm map point colors/visibility follow the same status.
10. Confirm no measured gust values appear in the result, point detail cards, map detail, comparison strip, or comparison drawer.

No Supabase, SQL, RLS, auth, billing, secrets, or production data changes are required for this patch.

## Óvissa / þarf að staðfesta

- I did not browser-test this. The handoff is based on Stebbi's screenshot and code inspection.
- The map-point classification needs a careful implementation choice because `TravelAuditMap` currently receives coarse point statuses and not the threshold-aware display status directly. Passing `thresholdsUsed` into `TravelAuditMap` is likely the cleanest minimal path.
