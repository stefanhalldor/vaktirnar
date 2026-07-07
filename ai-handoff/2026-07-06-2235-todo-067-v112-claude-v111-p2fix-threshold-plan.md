# Handoff: v111 P2 fix + threshold controls implementation plan

**Date:** 2026-07-06 22:35
**From:** Claude
**Ref:** todo-067 v111 → v112
**Status:** P2 fix shipped. Threshold controls: plan below for Codex review before execution.

---

## What was done

### P2 fix: `kl.` no longer hardcoded in English window-range badge

`FerdalagidClient.tsx` `formatWindowRange` now detects locale:

- IS same-day: `kl. HH:MM–HH:MM`
- EN same-day: `HH:MM–HH:MM`
- IS cross-day: `fös. 10. júl. kl. 22:00 – lau. 11. júl. kl. 05:00`
- EN cross-day: `Fri, Jul 10 at 22:00 – Sat, Jul 11 at 05:00`

Type-check: exit 0. Tests: 1727 passed.

### P2 noted: no component tests for DepartureHeatmap filter behavior

The filter-behavior change (green hidden by default, Allt resets, etc.) is not covered at component level. No component test setup exists under `lib/__tests__/`. This remains a required manual localhost check.

---

## Threshold controls: implementation plan

Codex recommended a plan before code for this feature. Below is the full plan for review.

### Scope

Phase 1: per-run threshold overrides, client state only, no persistence.

User can adjust: `cautionWindMs`, `redWindMs`, `redGustMs`, `cautionPrecipMmPerHour` for their trailer kind. Overrides sent with API request, used throughout the model, shown in result.

### 1. New type: `TravelThresholdOverrides` (lib/weather/types.ts)

```ts
export type TravelThresholdOverrides = {
  cautionWindMs?: number
  redWindMs?: number
  redGustMs?: number
  cautionPrecipMmPerHour?: number
}
```

Also a resolved type for internal use (after merging defaults + overrides):

```ts
export type ResolvedTravelThresholds = {
  cautionWindMs: number
  redWindMs: number
  redGustMs: number
  cautionPrecipMmPerHour: number
}
```

Add `thresholdsUsed?: ResolvedTravelThresholds` to `TravelPlan` so the client can display what was actually used.

### 2. Threshold resolution (lib/weather/thresholds.ts or travel.ts)

Add a `resolveThresholds(trailerKind, overrides)` function:

```ts
function resolveThresholds(
  trailerKind: 'none' | TrailerKind,
  overrides?: TravelThresholdOverrides,
): ResolvedTravelThresholds {
  const base = trailerKind === 'none' ? WEATHER_THRESHOLDS.driving : WEATHER_THRESHOLDS.caravan
  return {
    cautionWindMs: overrides?.cautionWindMs ?? base.cautionWindMs,
    redWindMs: overrides?.redWindMs ?? base.redWindMs,
    redGustMs: overrides?.redGustMs ?? base.redGustMs,
    cautionPrecipMmPerHour: overrides?.cautionPrecipMmPerHour ?? WEATHER_THRESHOLDS.travel.cautionPrecipMmPerHour,
  }
}
```

### 3. Thread resolved thresholds through travel.ts

**`evalDrivingLeg`** currently reads `WEATHER_THRESHOLDS` directly. Change its signature to accept `ResolvedTravelThresholds`:

```ts
function evalDrivingLeg(
  wind: number,
  gust: number,
  precip: number,
  trailerKind: 'none' | TrailerKind,
  thresholds: ResolvedTravelThresholds,   // ← new
): { stada: WeatherStatus; reasonCode?: string }
```

Remove the `WEATHER_THRESHOLDS.driving` / `WEATHER_THRESHOLDS.caravan` reads inside `evalDrivingLeg` and use `thresholds.*` instead.

All callers of `evalDrivingLeg` — `evaluateCandidate`, `buildRouteWeatherPoints`, `buildSingleDepartureTimeline` — must propagate `thresholds`.

**`checkTravelWeather`**: add `thresholdOverrides?: TravelThresholdOverrides` to `TravelWeatherInput`. Call `resolveThresholds(trailerKind, thresholdOverrides)` near the top and pass the result everywhere.

Store resolved thresholds in `travelPlan.thresholdsUsed`.

### 4. Update `deriveThreshold` (lib/weather/thresholds.ts)

Add an optional `resolved?: ResolvedTravelThresholds` parameter:

```ts
export function deriveThreshold(
  metric: 'wind' | 'gust' | 'precipitation' | 'data',
  reasonCode: string | undefined,
  resolved?: ResolvedTravelThresholds,
): { thresholdValue?: number; thresholdUnit?: 'm/s' | 'mm/klst' }
```

When `resolved` is provided, return `resolved.cautionPrecipMmPerHour` for precipitation, `resolved.redGustMs` for gust, etc. Fall back to `WEATHER_THRESHOLDS` when absent (preserves all existing callers outside travel).

`buildHighlightedIssue` in `travel.ts` calls `deriveThreshold` — pass resolved thresholds there too. The resulting `TravelIssue.thresholdValue` will then reflect what the user actually set.

### 5. API validation (app/api/teskeid/weather/travel/route.ts)

Accept `thresholdOverrides?: TravelThresholdOverrides` in the request body. Validate:

```ts
function validateThresholdOverrides(raw: unknown): TravelThresholdOverrides | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const result: TravelThresholdOverrides = {}

  const checkMs = (key: string, min: number, max: number) => {
    const v = o[key]
    if (v === undefined) return
    if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) {
      throw new Error(`${key} must be a number between ${min} and ${max}`)
    }
    (result as Record<string, number>)[key] = v
  }

  checkMs('cautionWindMs', 0, 40)
  checkMs('redWindMs', 0, 40)
  checkMs('redGustMs', 0, 50)

  const p = o['cautionPrecipMmPerHour']
  if (p !== undefined) {
    if (typeof p !== 'number' || !isFinite(p) || p < 0 || p > 20) {
      throw new Error('cautionPrecipMmPerHour must be between 0 and 20')
    }
    result.cautionPrecipMmPerHour = p
  }

  // Ordering invariant: cautionWind < redWind (using resolved defaults for unset values)
  // Check after resolving so partial overrides are safe

  return Object.keys(result).length > 0 ? result : undefined
}
```

Return 400 with `{ error: 'thresholds_invalid', message: '...' }` if validation fails.

### 6. Client state and UI (FerdalagidClient.tsx)

**State:**
```ts
const [thresholdOverrides, setThresholdOverrides] = useState<TravelThresholdOverrides>({})
```

**Send with request:**
```ts
body: JSON.stringify({
  origin, destination, earliestDepartureAt, latestArrivalBy, latestHomeBy, trailerKind,
  thresholdOverrides: Object.keys(thresholdOverrides).length > 0 ? thresholdOverrides : undefined,
})
```

**Show active thresholds in result:** When `result.travelPlan.thresholdsUsed` is present, show a small "Viðmið sem notuð voru" section near the result card (not inside the "Af hverju?" explainer — keep that for route point details).

**Threshold editing:** Add a new WizardStep `'thresholds'` accessible from the result via a button like "Breyta veðurmörkum". This step shows:
- Input for each threshold with unit label
- "Nota sjálfgefin viðmið" reset button
- "Reikna aftur" primary action (calls `handleSubmit`)

Put it between `assumptions` and `result` in the nav or as a modal/sheet — not in the main wizard flow (would confuse first-time users).

**Reset on new result:** Do NOT reset `thresholdOverrides` on `startOver()` unless explicitly asked. The user chose them deliberately.

### 7. i18n keys needed

IS:
- `thresholdsTitle`: "Veðurmörk"
- `thresholdsSubtitle`: "Teskeið notar þessi mörk til að meta leiðina. Þú getur breytt þeim."
- `thresholdCautionWind`: "Varúðarvindur"
- `thresholdRedWind`: "Rauður vindur"
- `thresholdRedGust`: "Rauður hviður"
- `thresholdCautionPrecip`: "Varúðarúrkoma"
- `thresholdReset`: "Nota sjálfgefin viðmið"
- `thresholdsUsedLabel`: "Viðmið sem notuð voru"
- `thresholdsDefault`: "Sjálfgefin viðmið"
- `thresholdsCustom`: "Þín viðmið"
- `thresholdValidationError`: "Ógilt gildi í veðurmörkum."
- `editThresholds`: "Breyta veðurmörkum"

EN: corresponding English.

### 8. Tests to add (lib/__tests__/weather-travel.test.ts)

1. `resolveThresholds` returns defaults when no overrides
2. `resolveThresholds` merges partial overrides correctly
3. `checkTravelWeather` with override `cautionWindMs: 10` triggers gult at wind=12 (would be green with default 15)
4. `checkTravelWeather` with override raises threshold: wind=16 stays green (would be gult with default 15)
5. `travelPlan.thresholdsUsed` reflects overrides, not defaults
6. `TravelIssue.thresholdValue` matches the override value, not the hardcoded default
7. API route: invalid `cautionWindMs: -5` → 400 thresholds_invalid

### 9. Files to change

```
lib/weather/types.ts            — TravelThresholdOverrides, ResolvedTravelThresholds, thresholdsUsed on TravelPlan
lib/weather/thresholds.ts       — resolveThresholds, updated deriveThreshold signature
lib/weather/travel.ts           — evalDrivingLeg accepts thresholds, thread through evaluateCandidate/etc.
app/api/teskeid/weather/travel/route.ts — accept + validate thresholdOverrides
app/auth-mvp/vedrid/FerdalagidClient.tsx — threshold state, send with request, threshold editing step, show thresholdsUsed
messages/is.json + messages/en.json — new keys
lib/__tests__/weather-travel.test.ts — new tests
```

### Known risks

- `evalDrivingLeg` signature change: all call sites must be updated. There are ~4 call sites inside `travel.ts` and none outside it (it's not exported), so the blast radius is contained.
- `deriveThreshold` is used outside `travel.ts` (e.g. in `DepartureHeatmap.tsx`). The optional `resolved` param preserves backwards compatibility for those callers.
- `buildSingleDepartureTimeline` generates ~48 candidates. Each calls `evaluateCandidate` which calls `evalDrivingLeg`. The resolved thresholds object is allocated once and passed by reference — no performance concern.

---

## Verification (P2 fix only)

**Type-check:** exit 0
**Tests:** 53 files, 1727 passed

---

## What Stebbi / Codex should confirm before threshold execution

1. Is the `thresholds` WizardStep approach (separate from `assumptions`) the right placement, or inline in `assumptions`?
2. Should the threshold controls be visible on first use (wizard flow) or only accessible from the result?
3. Should `cautionPrecipMmPerHour` be exposed as a threshold override, or is wind-only sufficient for Phase 1?
4. Confirm: API 400 on invalid thresholds (not silent fallback to defaults)?
