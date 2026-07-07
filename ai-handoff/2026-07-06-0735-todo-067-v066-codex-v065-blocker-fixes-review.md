# TODO 067 - Codex review of v065 blocker fixes

Created: 2026-07-06 07:35  
Timezone: Atlantic/Reykjavik

## Reviewed

Reviewed handoff:

- `ai-handoff/2026-07-06-0740-todo-067-v065-claude-blocker-fixes-shipped.md`

Reviewed key files:

- `lib/weather/types.ts`
- `lib/weather/travel.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/__tests__/weather-travel.test.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Commands run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-coords.test.ts lib/__tests__/weather-tools.test.ts
npm run build
npm run test:run
```

Results:

- `npm run type-check`: first run failed because `.next/types` referenced missing generated files; after `next build` regenerated `.next/types`, rerun passed.
- Targeted weather tests: passed, `114 passed | 5 skipped`.
- Full test suite: passed, `51 passed`, `1639 passed | 27 skipped | 8 todo`.
- `npm run build`: failed twice after successful compilation/type lint phase:
  - first: `Cannot find module for page: /_error`
  - second: `Failed to collect page data for /children`

The build failure may be unrelated to TODO 067, but this workspace cannot be
called build-clean from this review run.

## Findings

### Blocker 1 - Return-window weather still uses outbound ETA direction

File:

- `lib/weather/travel.ts:35`
- `lib/weather/travel.ts:88`
- `lib/weather/travel.ts:301`

v065 fixed ETA-per-point for outbound by evaluating each route point around:

```ts
etaMs = depMs + fraction * durMs
```

That is correct for outbound. But return candidates still call the same
`generateCandidates()` / `evaluateCandidate()` / `findWorstMetric()` path with
the same point metadata. For return travel, the route direction is reversed:

- destination-near points should be evaluated near return departure
- origin-near points should be evaluated near return arrival

Current code evaluates origin-near points near return departure and
destination-near points near return arrival. That is backwards.

Recommended fix:

- Add leg direction to candidate evaluation: `'outbound' | 'return'`.
- For outbound ETA: `depMs + fraction * durMs`.
- For return ETA: `depMs + (1 - fraction) * durMs`.
- Add tests where bad weather exists only near destination at return departure
  or only near origin at return arrival, so the bug cannot pass silently.

This remains a deterministic correctness blocker for latest-home return advice.

### Blocker 2 - Highlighted issue can still select the wrong worst point for precipitation

File:

- `lib/weather/travel.ts:174`
- `lib/weather/travel.ts:196`

Claude Code intentionally left `worstCandidateOf()` tie-break for later:

```ts
b.status === a.status && (b.worstWind?.value ?? 0) > (a.worstWind?.value ?? 0)
```

For same-status yellow candidates caused by precipitation, this can select the
candidate with higher wind but lower precipitation. Then `buildHighlightedIssue`
uses `reasonCode === 'precipitation'` and reports that candidate's
`worstPrecip`, which may not be the route's worst precipitation issue.

Example failure shape:

- Candidate A: wind 5 m/s, precipitation 7.6 mm/klst
- Candidate B: wind 14 m/s, precipitation 0.2 mm/klst
- Both are yellow due precipitation.
- Current tie-break can choose B because wind is higher.
- UI then says the decisive precipitation is 0.2, not 7.6.

This directly conflicts with Stebbi's requirement to verify the true worst point.

Recommended fix:

- Select highlighted candidate reason-aware:
  - precipitation reason: max `worstPrecip.value`
  - wind reason: max relevant wind/gust over threshold context
  - no_data: deterministic handling
- Add tests proving the highlighted precipitation issue is the maximum
  precipitation, not the highest-wind yellow candidate.

### Major 1 - Destination-nearest point is still not guaranteed when route sampling hits max cap

File:

- `app/api/teskeid/weather/travel/route.ts:132`
- `app/api/teskeid/weather/travel/route.ts:142`

v065 appends the last route point only if:

```ts
weatherPoints.length < MAX_WEATHER_POINTS
```

But on long routes the sampling loop commonly fills `weatherPoints` to the cap
already. In that case the final destination-nearest point is still not included.

Recommended fix:

- Reserve one slot for the final route point, or replace the last sampled point
  with the true final point when the cap is reached.
- Add a unit test/helper test for a route with more than `MAX_WEATHER_POINTS`
  points where the final point must still be present.

### Major 2 - Build is not passing in this workspace

Command:

```bash
npm run build
```

Build failed twice. It compiled successfully and then failed in page data
collection:

- `Cannot find module for page: /_error`
- `Failed to collect page data for /children`

This may be a pre-existing or local `.next`/Next issue rather than v065, but it
must be resolved before any release/push/deploy confidence. It also means this
review cannot confirm Claude Code's "clean" state beyond tests/type-check.

### Major 3 - Structured UI and auditability are still explicitly not done

Files:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:355`
- `lib/weather/types.ts:31`

v065 handoff correctly says these are still pending:

- structured `travelPlan` rendering
- highlighted issue details in UI
- `forecastLat`, `forecastLon`, `metnoUrl`
- `routeWeatherPoints`
- "Spápunktar á leiðinni"
- manual verification links

This is acceptable only if Stebbi treats v065 as a logic-fix checkpoint, not as
ready-for-real localhost validation.

### Minor 1 - ETA window uses worst value within ±1 hour, not nearest forecast point

File:

- `lib/weather/travel.ts:11`

This may be a valid conservative choice, but it should be intentional and
visible in the product/audit details. If the app says "weather at the point when
you reach it", using the worst value inside ±1 hour can overstate conditions.

Recommended:

- Either choose nearest forecast hour to ETA, or
- Keep conservative ±1h and explicitly say "spágildi innan um klukkustundar frá
  áætluðum tíma á punktinum".

## What Looks Fixed

- Outbound route-point ETA is no longer the full-route-window aggregation.
- Departure-window `toIso` is now a departure time, not an arrival time.
- Impossible `latestHomeBy` no longer silently stays green.
- `issueReasonCode` now comes from `highlightedIssue` unless home target is
  impossible.
- Return distance wording is improved.
- Invalid optional date payloads now return 400 when present and invalid.
- Icelandic caution copy is better.
- Targeted and full tests pass.

## Recommendation

Do not send this to broad localhost validation yet.

It is acceptable for a quick smoke test that the flow still renders, but not for
trusting return advice or "worst point" explanations. The next Claude Code pass
should fix:

1. Reverse ETA logic for return candidates.
2. Reason-aware highlighted issue selection.
3. Guaranteed destination-nearest route point under the cap.
4. Build failure investigation or at least a clear separation if unrelated.
5. Then continue into v062/v063 auditability UI.

## Localhost checks for Stebbi

If Stebbi wants to smoke test now:

1. Open `/auth-mvp/vedrid`.
2. Confirm place search and route submit still work.
3. Confirm lodging step is gone.
4. Confirm status labels are natural.
5. Do not trust return-window advice yet.
6. Do not trust the highlighted "worst point" for precipitation yet.
7. Do not expect spápunktar/audit links yet.

After the next fix pass:

1. Test a route with `latestHomeBy` and confirm return-point timing makes sense.
2. Test a rainy route and verify the highlighted issue is truly the highest
   precipitation point/time.
3. Test long routes and confirm the destination-nearest spápunktur appears.
4. Open the future "Spápunktar á leiðinni" details and verify map/met.no links.

No production, env, billing, Supabase, SQL, commit, push, or deploy actions were
part of this review.
