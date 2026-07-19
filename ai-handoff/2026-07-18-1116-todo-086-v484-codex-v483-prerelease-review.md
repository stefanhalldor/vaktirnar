# 2026-07-18 11:16 - TODO 086 v484 - Codex review of v483 prerelease

Created: 2026-07-18 11:16
Timezone: Atlantic/Reykjavik

Reviewed handoff:
- `ai-handoff/2026-07-18-1113-todo-086-v483-claude-v482-done-prerelease.md`

## Verdict

Directionally this is the right architecture: Vegagerðin overview marker color is now driven by `WindDisplayStatus` and `WIND_STATUS_MARKER_COLOR`, not `measurementFreshness`. That aligns `/vedrid` with `/vedrid/ferdalagid` instead of creating a separate color language.

I would not release v483 exactly as-is. There are two fixes I would ask Claude Code to make first: status marker labels are translated from the wrong namespace, and the new number inputs violate the mobile 16px input rule in `Design.md`.

## Findings

1. **Medium: Vegagerðin marker status labels use the wrong translation namespace**

   In `components/weather/WeatherOverviewClient.tsx:81` the `t` hook is bound to `teskeid.vedrid.eltaVedrid`, but marker status labels are resolved with `t(WIND_STATUS_META[status].labelKey)` in `components/weather/WeatherOverviewClient.tsx:262`.

   The `WIND_STATUS_META` label keys (`statusWithinLimits`, `statusNearDiscomfort`, `statusUncomfortable`, `statusNearDanger`, `statusDangerous`, `heatmapNotAssessed`) live under `teskeid.vedrid.ferdalagid`, not `teskeid.vedrid.eltaVedrid`. I verified this with JSON lookup:
   - `messages/is.json`: `eltaVedrid.statusWithinLimits` = false
   - `messages/is.json`: `ferdalagid.statusWithinLimits` = true

   Risk: marker title/tooltip can show missing translation output or throw/log `MISSING_MESSAGE`, depending next-intl behavior. It also violates the goal that `/vedrid` and `/ferdalagid` share the same status vocabulary.

   Fix: add a separate hook, e.g. `const tf = useTranslations('teskeid.vedrid.ferdalagid')`, and use `tf(WIND_STATUS_META[status].labelKey as ...)`. Even better: create a small reusable `getWindStatusLabel(tf, status)` helper if the cast pattern is repeated.

2. **Medium/Mobile UX: WeatherThresholdBar inputs are `text-xs`, which can trigger mobile zoom**

   `components/weather/WeatherThresholdBar.tsx:195`-`205` renders number inputs with `text-xs`.

   `Design.md` explicitly requires text in `input`, `textarea`, and `select` to be at least 16px on mobile to avoid iOS/Safari zoom. This threshold panel is on `/vedrid`, a core mobile screen, so it should follow that rule even if desktop looked fine.

   Fix: use `text-base` on the `<input>` itself, and control the surrounding UI density with padding/height rather than shrinking the input font. Keep the label metadata small if needed, but not the actual input text.

3. **Low/Product polish: selected Vegagerðin station card still does not visibly show the status pill**

   v483 made marker tooltip labels threshold-aware, but the selected station detail at `components/weather/WeatherOverviewClient.tsx:585`-`620` still shows `contextLine={tOv('vegagerdinCurrentLabel')}` and measurement fields only. On mobile, marker hover/title is not a reliable visible UI, so the user can see colored dots but not the shared `WindStatusBadge` label after opening a station.

   This was listed as out of scope in v483, so it is not a hard blocker if Stebbi wants to test quickly. But for the "same experience as ferðalagið" product goal, add `WindStatusBadge` to the selected Vegagerðin detail card using the same `classifyObservationWindDisplayStatus` result and `thresholds`.

4. **Low/Architecture: WeatherThresholdBar is overview-specific in comments/API even though it should become shared**

   `components/weather/WeatherThresholdBar.tsx:40`-`49` describes the component as "for /vedrid overview", and `lib/weather/useWeatherThresholds.ts:18`-`30` says it manages thresholds "for /vedrid overview".

   The component itself is mostly reusable, which is good. The naming/comments should not lock it mentally to overview, because the whole point is a shared threshold control/state contract between `/vedrid` and `/vedrid/ferdalagid`.

   Fix: adjust comments to say it is a compact shared weather-threshold control currently used by overview, and add a follow-up TODO to let `FerdalagidClient` consume the same hook/component once safe.

## Things that look good

- `lib/weather/windDisplayStatus.ts:95`-`110` adds a pure observation classifier instead of leaking Vegagerðin-specific logic into UI.
- `components/weather/IcelandOverviewMap.tsx:27`-`35` uses `markerColor` as a generic override while leaving `tone` for z-index. This keeps the map wrapper provider-neutral.
- `components/weather/WeatherOverviewClient.tsx:251`-`263` classifies each Vegagerðin station per observation and threshold, so changing thresholds should recolor markers without refetch.
- `measurementFreshness` is no longer a primary marker-color input. Good.
- SQL 81 was not run. Good.

## Commands I ran

```
npm run type-check
```

Exit 0.

```
npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts
```

Exit 0. 3 files, 36 tests passed.

No SQL was run. No commit, push, deploy, env, Vercel, or production changes were made.

## Recommended next handoff for Claude Code

Claude Code, please make a small hardening pass before release:

1. Fix Vegagerðin marker `statusLabel` translation namespace:
   - use `teskeid.vedrid.ferdalagid` for `WIND_STATUS_META` keys
   - add a focused test or at least a guard that these keys resolve from the correct namespace if the existing test setup supports it

2. Fix mobile input font size in `WeatherThresholdBar`:
   - actual `<input>` text must be `text-base` / 16px minimum
   - keep the component compact through layout/padding, not sub-16px input text

3. Add visible status badge to selected Vegagerðin station detail if it stays small:
   - use `WindStatusBadge`
   - classify with `classifyObservationWindDisplayStatus`
   - pass/derive `thresholds` into `VegagerdinStationDetail`
   - if this makes the patch sprawl, leave it as explicit next follow-up, but do not pretend tooltip-only status is fully mobile-friendly

4. Update comments in `WeatherThresholdBar` and `useWeatherThresholds` so they describe a shared weather-threshold control/state contract, not an overview-only helper.

5. Re-run:
   - `npm run type-check`
   - `npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts`

No SQL, commit, push, deploy, Vercel/env changes, or production changes.

## Localhost checks for Stebbi

After Claude's hardening pass:

1. Open `http://localhost:3004/vedrid`.
2. Toggle Vegagerðin on and verify old measurements still leave the Vegagerðin pill active.
3. Hover/click a Vegagerðin marker:
   - marker tooltip should use real status text like `Innan marka` / `Nálgast óþægindi`, not missing translation text
   - selected card should show the same visible status if the badge follow-up is included
4. Open the threshold edit panel on mobile width 390-460 px:
   - focusing number inputs must not zoom the page
   - no horizontal overflow
   - buttons/inputs remain tappable
5. Change thresholds to something tight, e.g. `10 / 15`, and verify marker colors update instantly without refetch.
6. Click into `/vedrid/ferdalagid` and verify the existing trip map/status pills still look unchanged.

## SQL / Supabase

- This review does not ask for SQL.
- SQL 81 remains separate and must only be run if Stebbi explicitly approves it.
- No RLS, grants, policies, auth, or production data behavior should be affected by this hardening pass.

## Confidence

High on findings #1 and #2.

Medium on whether #3 should be included immediately or as a follow-up; product-wise it is the right direction, but it may be okay to defer if Stebbi wants to test marker recoloring first.
