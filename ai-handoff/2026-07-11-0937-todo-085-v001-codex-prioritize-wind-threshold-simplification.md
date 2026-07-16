# TODO #85 - Codex handoff: prioritize wind-threshold simplification before continuing TODO #78

## Decision

Proceed directly to new TODO #85 before continuing the larger Ferðalagið / shared weather core refactor.

Claude v026 (`2026-07-11-0929-todo-078-v026-claude-phase07-patch-prerelease`) fixes the Phase 0.7 fail-open issue and `npm run type-check` passes. There is no need to keep iterating Phase 0.7 right now unless Stebbi wants to release/test that affordance separately.

Recommended order:

1. Treat v026 as acceptable prerelease base.
2. Start TODO #85 now.
3. After #85 is complete and reviewed, continue TODO #78 refactor work.

## Why #85 Should Come First

#85 changes core assumptions in the weather flow:

- removes the visible `Eftirvagn` step,
- changes which thresholds users set,
- changes the labels users see in pills/scrubber/result,
- hides gust-related controls/copy,
- changes summary threshold text.

Doing this before building more Ferðalagið UI avoids wiring new trip/multi-stop surfaces to threshold/status concepts that Stebbi already wants to replace.

## Important Scope Clarification From Stebbi

For this first pass, do **not** do a large destructive refactor of all gust/precip data paths.

Instead:

- Keep gust and precipitation fields/types in the background where needed.
- Set hidden/background gust and precipitation thresholds to high neutral values, e.g. `100`, so they do not influence user-visible assessment.
- Hide gust and precipitation threshold controls from the user.
- Change the threshold summary text so it only shows:
  - uncomfortable wind,
  - dangerous wind.
- Continue showing precipitation as informational weather data where it is useful in result/detail, unless that creates inconsistency.
- Do not show gust values or gust threshold copy in the UI for this phase.

This gives a small, reversible, low-risk phase while avoiding the current user-facing confusion.

## Desired Product Behavior

Remove the `Eftirvagn` step.

The weather-threshold step should only ask for:

- `Óþægilegur vindur`
- `Hættulegur vindur`

Rename user-visible status:

- `Gott veður` -> `Innan marka`

Add wind-distance labels:

- `Innan marka`: wind is under uncomfortable wind threshold and more than 2 m/s away from it.
- `Nálgast óþægindi`: wind is less than 2 m/s below uncomfortable threshold. Yellow.
- `Óþægilegt`: wind is at/above uncomfortable threshold but more than 2 m/s below dangerous threshold.
- `Nálgast hættumörk`: wind is less than 2 m/s below dangerous threshold. Needs a clear warning treatment distinct from actual red/danger.
- `Hættulegt`: unchanged for at/above dangerous threshold.

Note: if current internals only support `graent/gult/rautt`, prefer adding a display substatus/label rather than breaking all severity enums at once. Keep internal severity stable if that reduces risk.

## Threshold / Status Technical Direction

Start by mapping current model:

- Where `trailerKind` affects default thresholds.
- Where `redGustMs` and `cautionPrecipMmPerHour` are validated.
- Where thresholds are summarized in nav/pills.
- Where `STATUS_STYLES`, `WeatherStatus`, `graent/gult/rautt` and display labels are computed.
- Where route option preview, trip assessment and result summary consume those statuses.

Preferred first-phase implementation:

- Remove `trailer` from visible wizard/step-nav.
- Keep state fields if needed, but set/derive a neutral no-trailer mode internally.
- Default hidden `redGustMs` and precipitation thresholds to `100`.
- Do not expose those fields in the threshold form.
- Ensure request payloads still satisfy current API/schema expectations.
- Add/derive a display label for the five visible wind states.
- Keep tests focused on the new wind boundary rules.

Potential boundary rules:

```ts
if (wind >= dangerousWind) return 'haettulegt'
if (dangerousWind - wind < 2) return 'nalgast-haettumork'
if (wind >= uncomfortableWind) return 'othaegilegt'
if (uncomfortableWind - wind < 2) return 'nalgast-othaegindi'
return 'innan-marka'
```

Clarify exact inclusivity in tests:

- "minna en 2 m/s frá" means `< 2`, not `<= 2`, unless Stebbi says otherwise.
- At the threshold itself, status is over/at the threshold, e.g. `wind >= uncomfortableWind` is `Óþægilegt`.
- At dangerous threshold, `wind >= dangerousWind` is `Hættulegt`.

## Copy

Threshold step should include a short caution note, not a wall of text:

```text
Hviður í spágögnum eru ekki nógu áreiðanlegar til að nota í þessu mati. Fylgstu sérstaklega vel með hviðum og aðstæðum á vef Vegagerðarinnar, sérstaklega þegar vindurinn er utan markanna sem þú stillir hér.
```

Use `messages/is.json` and `messages/en.json`. Do not hardcode.

## UI / Design Notes

Read `Design.md` before implementation.

Important:

- Mobile-first.
- No horizontal overflow.
- No nested cards.
- Keep the threshold step compact.
- Threshold summary near scrubber should only mention wind thresholds.
- If `Eftirvagn` step removal changes step-nav spacing, make sure the three remaining steps still feel balanced:
  - Leið
  - Veðurmörk
  - Niðurstaða

## Files Likely Touched

Expect at least:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- weather threshold/status helpers in `lib/weather/*`
- route/trip assessment tests under `lib/__tests__/*`
- `messages/is.json`
- `messages/en.json`

Maybe:

- `components/weather/DepartureHeatmap.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `components/weather/ForecastDrawer.tsx`
- `components/weather/TravelAuditMap.tsx`

Do not touch SQL.

## Relationship To v026 / TODO #78

Keep the Phase 0.7 Ferðalag affordance changes from v026 unless they actively conflict with #85.

Do not expand the Ferðalag affordance in this phase.

Do not add multi-stop UI yet.

After #85 is complete, return to TODO #78 and continue from the shared weather core refactor with the simplified threshold/status model as the new base.

## Suggested Tests

Add/adjust tests for:

- hidden gust/precip thresholds do not change visible status for ordinary cases,
- `Innan marka`,
- `Nálgast óþægindi`,
- `Óþægilegt`,
- `Nálgast hættumörk`,
- `Hættulegt`,
- exact boundary behavior at:
  - uncomfortableWind - 2,
  - uncomfortableWind - 1.99,
  - uncomfortableWind,
  - dangerousWind - 2,
  - dangerousWind - 1.99,
  - dangerousWind.

Run:

```powershell
npm run type-check
npm run test:run -- --runInBand
```

If the full suite is too broad/slow, run targeted weather tests plus `npm run type-check`, and say exactly what was skipped.

## Localhost Checks For Stebbi

Before implementation, Stebbi can verify current baseline:

1. Open `/vedrid` or `/auth-mvp/vedrid`.
2. Confirm the `Eftirvagn` step exists.
3. Confirm threshold text includes more than just uncomfortable/dangerous wind.
4. Confirm labels still include `Gott veður`.

After implementation:

1. Open `/vedrid` as public user if `WEATHER_PUBLIC_ENABLED=true`.
2. Expected: no `Eftirvagn` step.
3. Open `/auth-mvp/vedrid` as logged-in user.
4. Expected: same simplified flow.
5. On threshold step, expected only two user-editable wind fields:
   - uncomfortable wind,
   - dangerous wind.
6. Expected: no gust field and no precipitation-threshold field.
7. Expected: threshold summary near scrubber/result only mentions uncomfortable/dangerous wind.
8. Expected: caution copy about gusts/Vegagerðin is visible and short enough on mobile.
9. Choose thresholds so wind is clearly below uncomfortable threshold.
10. Expected: `Innan marka`.
11. Choose thresholds so wind is less than 2 m/s below uncomfortable threshold.
12. Expected: `Nálgast óþægindi`, yellow.
13. Choose thresholds so wind is above uncomfortable threshold but more than 2 m/s below dangerous threshold.
14. Expected: `Óþægilegt`.
15. Choose thresholds so wind is less than 2 m/s below dangerous threshold.
16. Expected: `Nálgast hættumörk`, distinct warning treatment.
17. Choose thresholds so wind is above dangerous threshold.
18. Expected: `Hættulegt`.
19. Check result summary, route point list, map detail and forecast drawer.
20. Expected: no visible gust thresholds or gust status labels.
21. Check mobile width 360-460 px.
22. Expected: no overlap, no horizontal scroll, no unwanted zoom.

## Codex Recommendation

Yes: move directly to #85 now.

Do not spend more time on v025/v026 unless Stebbi wants to release Phase 0.7 separately first. v026 is good enough to keep as the current base; #85 is the more important foundation before the next Ferðalagið refactor step.
