# todo-067 v088 - Codex review of Claude v087 full milestone

Created: 2026-07-06 16:48  
Timezone: Atlantic/Reykjavik  
Review target: `2026-07-06-1700-todo-067-v087-claude-v086-full-milestone-done`  
Reviewer: Codex  
Relevant TODO: `todo-067` Ferðalagið weather flow

## Findings

### P1 - Gust threshold logic can show a false "above threshold" explanation for non-trailer trips

In `lib/weather/travel.ts`, gust decisiveness is derived by checking both the driving and caravan red gust thresholds:

- `candidateSeverity()` uses `gustVal >= driving.redGustMs || gustVal >= caravan.redGustMs` at lines 194-196.
- `buildHighlightedIssue()` uses the same rule at lines 246-250.
- `buildRouteWeatherPoints()` uses the same rule for `decisiveMetric` at lines 289-294.

`components/weather/DepartureHeatmap.tsx` repeats the same issue at lines 134-147:

```ts
const isGustDecisive =
  (candidate.worstGust?.value ?? 0) >= 28 ||
  (candidate.worstGust?.value ?? 0) >= 25
```

Because `25` is the caravan threshold, a normal no-trailer trip with wind over the driving wind threshold and gusts at 25-27 m/s can be displayed as a gust-driven issue even though the no-trailer gust threshold is 28 m/s. The UI can then say something like `Hviður: 26.0 m/s yfir mörkum 28.0 m/s`, which is a direct contradiction.

Fix direction:

- Decide the relevant threshold from `trailerKind` first.
- For no-trailer trips, gust becomes decisive only at `WEATHER_THRESHOLDS.driving.redGustMs`.
- For trailer trips, gust becomes decisive only at `WEATHER_THRESHOLDS.caravan.redGustMs`.
- Add tests for:
  - no trailer, wind 21, gust 26 -> metric should be `wind`, threshold 20, not `gust`.
  - no trailer, gust 28 -> metric should be `gust`, threshold 28.
  - caravan, gust 25 -> metric should be `gust`, threshold 25.

### P1 - Route selection map can keep an old route line after changing origin

`components/weather/RouteSelectionStep.tsx` creates and clears the route preview line only inside the destination effect at lines 160-200. That effect depends on:

```ts
[destination?.lat, destination?.lon, mapLoaded]
```

It reads `origin`, but `origin` is not in the dependency list. The origin effect at lines 129-158 clears/recreates the origin marker, but it does not clear or redraw the line when a destination is already selected.

User-visible failure:

1. Select origin A.
2. Select destination B.
3. Clear/change origin to C while B remains selected.
4. The map can still show the old A -> B line while the form state submits C -> B.

This is especially risky because this screen exists to build trust that "frá" and "til" are correct.

Fix direction:

- Have one synchronized map-effect for `origin`, `destination`, markers, line and bounds, with both coordinates in dependencies.
- Or make the origin effect also clear/redraw the route line when destination exists.
- Add a component/browser regression check for changing only origin after both points are set.

### P1 - Heatmap slot selection is not connected to the audit map or route-point explanation

`DepartureHeatmap` owns selected slot state locally (`components/weather/DepartureHeatmap.tsx` lines 39-47), and `FerdalagidClient` renders it without any callback or shared selected candidate state at lines 448-457. The audit map is rendered separately at lines 460-470.

On the server, `routeWeatherPoints` are built once from `summaryCandidate` in `lib/weather/travel.ts` lines 613-625. In window mode, `summaryCandidate` usually becomes the best outbound window, not necessarily the red/yellow slot the user taps in the heatmap.

That means the user can tap a red heatmap slot and see a detail card, but the map and route point list still describe a different candidate/time window. This misses Stebbi's core requirement: if something is red, user should be able to click it and see exactly where and why on the route.

Fix direction:

- Promote selected candidate state to `FerdalagidClient`.
- Add enough issue metadata to each `TravelCandidate` to identify:
  - decisive metric,
  - value,
  - threshold,
  - routeIndex,
  - forecast point,
  - distance,
  - time.
- When a slot is selected, select the corresponding marker in `TravelAuditMap`.
- The selected slot, details panel, map marker and explainer rows should all describe the same candidate/time.

### P1 - Reverse geocode BFF is public and has no real rate limiting or kill switch

`app/api/place/reverse-geocode/route.ts` is unauthenticated and not feature-gated. Any caller can hit `/api/place/reverse-geocode?lat=...&lon=...`, and the server will proxy to Nominatim.

The endpoint has an in-memory cache rounded to two decimals (`lines 3-8`) but no app-wide throttle, no per-IP/user throttle, no env kill switch, and no auth/feature guard. The client file also says "rate limiting" exists (`lib/weather/reverseGeocode.client.ts` line 2), but the server route does not implement it.

This is much better than browser-direct Nominatim, but it is still not production-safe as a public proxy.

Fix direction:

- Add an env/provider kill switch.
- Require auth + `vedrid` feature access, unless this is intentionally public.
- Add simple server-side throttling or queueing so the app cannot burst external reverse-geocode calls.
- Consider using Google geocoding for this while the app already depends on Google Maps billing/keys, or cache labels in a durable store if this becomes public.

### P2 - The "show gusts only when useful" rule is only partially applied

`TravelAuditMap` correctly shows `Hviður` only when `gustMs > windMs` at lines 370-379.

But the result facts in `lib/weather/travel.ts` still always include hviður when `worstWind` exists:

- outbound fact lines 602-604
- return fact lines 605-607

And the route-point rows in `app/auth-mvp/vedrid/FerdalagidClient.tsx` always show:

```tsx
Vindur ... · Hviður ... · Úrkoma ...
```

at lines 669-670.

This will still show `Hviður: 5.0 m/s` when wind is also `5.0 m/s`, which Stebbi explicitly wanted to avoid.

Fix direction:

- Apply the same display rule everywhere: show gust text only when `gust > wind`.
- For route rows, build the metric line conditionally instead of one fixed string.

### P2 - Worktree scope is wider than the v087 handoff describes

`git status --short` shows many modified/untracked files outside the files listed in the v087 handoff. Some are likely from earlier phases, but they are still in the same uncommitted worktree and can accidentally ship together.

Examples:

- `WORKFLOW.md` is modified and includes a typo: `Einzar undantekningar`.
- `TODO.md` was updated with #67.
- `app/api/teskeid/weather/ask/route.ts` and `app/auth-mvp/vedrid/VedridClient.tsx` still contain older chat/map-confirmation changes even though `/auth-mvp/vedrid/page.tsx` now renders `FerdalagidClient`.
- `package.json` and `package-lock.json` are modified.

This does not mean all of those changes are wrong. It means the commit/review boundary is messy.

Fix direction:

- Before commit/deploy, Claude Code should list exactly which files belong to the Ferðalagið milestone and which are leftover from earlier work.
- Do not include `WORKFLOW.md` changes in a product milestone unless Stebbi explicitly asked for a workflow-rule change.
- Split unrelated legacy chat changes from the route-weather milestone if they are not needed.

## What looks good

- `npm run type-check` passes locally in this review.
- The precipitation threshold is now `> 1.0 mm/klst`, which matches Stebbi's correction.
- The result screen now has `Breyta forsendum`, `Byrja aftur`, heatmap, audit map and deterministic explainer in the intended general order.
- `TravelAuditMap` has a real selected point panel, route markers, forecast-point markers and connector lines. That is a meaningful trust upgrade from the static image.
- i18n keys that previously showed as raw keys, such as `pointTimeLine` and `routePointCoord`, are present in both `messages/is.json` and `messages/en.json`.

## Verification run by Codex

```text
npm run type-check -> exit 0
```

I did not run the full Vitest suite or build in this review. Claude's handoff reports:

```text
npm run type-check -> exit 0
npm run test:run -> 52 files passed, 1699 tests passed
npm run build -> exit 0
```

## Recommended next step

Do not send this straight to production.

Ask Claude Code for a focused fix pass that only addresses the findings above, then send a new handoff back to Codex. The most important corrections are:

1. trailer-aware gust threshold logic,
2. stale route-preview line fix,
3. heatmap -> map selected slot synchronization,
4. reverse geocode BFF hardening or gating.

## Localhost checks for Stebbi

After Claude fixes this, test on `/auth-mvp/vedrid` with dev server already running.

### Route selection trust

1. Select `Garðabær` as origin and `Akranes` as destination.
2. Confirm that both pins appear and the line connects those two points.
3. Clear only origin.
4. Select a different origin, for example `Reykjavík`.
5. Expected: the line redraws from Reykjavík to Akranes, not the old Garðabær route.
6. Repeat by changing only destination.

### Gust threshold correctness

Use any test route/time where wind is high and gusts are close to wind. Check:

1. If `Hviður` equals wind, it should not be displayed.
2. If no trailer is selected, gusts under 28 m/s should not be described as over the no-trailer gust threshold.
3. If caravan/trailer is selected, the gust threshold should be 25 m/s where gust is the actual deciding metric.
4. Any `yfir mörkum` text must make mathematical sense: value must actually be above the displayed threshold.

### Heatmap and audit map synchronization

1. Choose a latest arrival time so window mode is active.
2. Wait for result and heatmap.
3. Tap a red or yellow departure slot.
4. Expected: the detail text, selected map marker and route point explanation describe the same time, metric, threshold and location.
5. Tap a green/best slot.
6. Expected: map details update to that slot, not a previous worst/best candidate by accident.

### Reverse geocode labels

1. Open the audit map result.
2. Click quickly between several middle route points.
3. Expected: the label always matches the selected point.
4. In Network tab, requests should go to `/api/place/reverse-geocode`, not directly to `nominatim.openstreetmap.org`.
5. Before production, confirm the endpoint is auth-gated or disabled if reverse geocoding should not be public.

### Layout and mobile

1. Test mobile widths 360, 390 and 430 px.
2. Confirm route selection, heatmap, map details, assumptions screen and result buttons fit without horizontal scroll.
3. Confirm date/time inputs do not trigger unwanted zoom.
4. Confirm the audit map remains usable and the point panel text does not overflow.

