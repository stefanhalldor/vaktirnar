# TODO 067 - v059 decisions for implementation

Created: 2026-07-06 00:13  
Timezone: Atlantic/Reykjavik

## Context

Stebbi reviewed `2026-07-05-2355-todo-067-v059-claude-v058-review.md`
and made the product decisions below.

This file supersedes the open questions in v059. Claude Code should use this as
the final implementation direction for the next Ferðalagið pass.

## Decisions From Stebbi

### 1. `latestArrivalBy` is optional

Choose v059 **Valkostur B**:

- `latestArrivalBy` is optional.
- If `latestArrivalBy` is provided, Ferðalagið performs candidate-window analysis.
- If `latestArrivalBy` is empty, Ferðalagið falls back to a single-window
  assessment from `earliestDeparture`.

Important product rule:

- If `latestArrivalBy` is empty, the UI must not claim to have found the "best
  departure window".
- It can say whether leaving at the selected/assumed time looks OK and explain
  the decisive weather values.

### 2. Lodging/stay analysis is out of scope for this phase

Do not implement the broad stay/lodging model from v059.

For this first pass, focus on the driving itself:

- outbound driving
- optional return-driving window based on latest-home-by
- trailer/caravan sensitivity for driving
- where/when the decisive route weather happens

Gisting/stay/tent-at-destination assessment should be deferred to a later phase.

Implementation guidance:

- Remove or hide the lodging step from the current Ferðalagið MVP flow.
- Send `lodgingKind: 'none'` or keep backward-compatible defaults in the API if
  needed, but do not ask the user to choose lodging in this pass.
- Do not show stay/destination-lodging advice in the result card.
- Do not spend this pass building broad destination stay windows.

### 3. Status labels should change

Change the user-facing travel labels:

- Green: `Ferðaveður lítur vel út`
- Yellow: `Varúð`
- Red: `Ekki mælt með ferð`

Do not use `Meðgótt`.

If shared `statusGraent/statusGult/statusRautt` keys would affect old hidden
Grill/Golf/chat surfaces, either confirm those surfaces are hidden or add
travel-specific labels under `teskeid.vedrid.ferdalagid`.

### 4. Red status must always include a reason

`Ekki mælt með ferð` is only acceptable with clear reasoning.

The result must say:

- which condition caused red/yellow
- whether it is outbound or return
- when it happens
- approximately where on the route it happens
- the relevant value and threshold context where useful

Example pattern:

```txt
Ekki mælt með ferð. Vindur fer yfir viðmið fyrir eftirvagn á útleið um kl. 15:00,
um 62 km frá Reykjavík. Mesti vindur er 19 m/s og hviður 26 m/s.
```

If the reason is missing because data is incomplete, the UI must say that:

```txt
Ekki hægt að meta ferðina nægilega vel vegna skorts á spágögnum á hluta leiðarinnar.
```

Do not show a red status with only a generic sentence.

## Final MVP Behavior

### Time step UX

The time step should move away from rigid exact departure planning.

Recommended fields:

1. `Hvenær ertu að spá í að leggja af stað?`
   - Optional planning anchor.
   - If empty, default to "now" in the analysis.
   - Native `datetime-local` is OK for this phase.

2. `Hvenær viltu vera komin/nn á áfangastað í síðasta lagi?`
   - Optional.
   - If set, run outbound candidate-window analysis.
   - If empty, evaluate only one outbound trip from the earliest departure.

3. `Þarf að vera heima í síðasta lagi? (valfrjálst)`
   - Optional.
   - If set, run return candidate-window analysis.

Remove the exact `Heimferð (valfrjálst)` field for this MVP.

### Outbound analysis

If `latestArrivalBy` is set:

- earliest departure = selected departure if provided, else now
- latest feasible departure = `latestArrivalBy - routeDuration`
- evaluate candidate departures every 30 minutes if feasible
- group adjacent candidates into readable windows
- choose best outbound window
- identify bad outbound windows
- keep decisive worst weather source metadata

If `latestArrivalBy` is not set:

- earliest departure = selected departure if provided, else now
- arrival = earliest departure + routeDuration
- evaluate that one route window
- explain the result without pretending there was a broader search

If `latestArrivalBy - routeDuration` is earlier than earliest departure:

- return a user-friendly validation/result state saying the arrival target is
  too soon for the route duration.

### Return analysis

If `latestHomeBy` is set:

- Use the route duration to compute `latestReturnDeparture = latestHomeBy - routeDuration`.
- Earliest possible return departure should be based on estimated arrival at
  destination from the selected/best outbound plan.
- Evaluate return candidate departures every 30 minutes between earliest possible
  return departure and latest return departure.
- Report best and bad return windows.

If this window is impossible or empty, explain it clearly:

```txt
Miðað við aksturstíma nærðu ekki heim fyrir þennan tíma.
```

No exact return departure field should be required.

### Trailer sensitivity stays in scope

Keep trailer/caravan/eftirvagn handling for driving, because this directly
affects route safety and was part of the core Ferðalagið use case.

## Required Data Model Behavior

The implementation must retain where and when decisive values happen.

At minimum:

```ts
type WorstMetric = {
  value: number
  timeIso: string
  lat?: number
  lon?: number
  routeIndex?: number
  distanceFromOriginM?: number
  routeFraction?: number
}
```

For each candidate route leg, the system must be able to identify:

- worst wind
- worst gust
- worst precipitation
- which metric caused the status/reason
- source time
- source approximate location

Do not return only aggregate maxima without metadata.

## Result UI Requirements

The result card should answer a normal user's questions:

- Má ég leggja af stað núna eða á þessum tíma?
- Ef ekki, hvenær er betra að leggja af stað?
- Hvað er vandamálið?
- Hvenær gerist það?
- Hvar á leiðinni gerist það?
- Er heimferðin vandamál ef ég þarf að vera komin/nn heim fyrir tiltekinn tíma?

The result should not feel like a raw weather dump.

Minimum result structure:

1. Status label:
   - `Ferðaveður lítur vel út`
   - `Varúð`
   - `Ekki mælt með ferð`

2. Recommendation:
   - single-window: "Miðað við brottför kl. HH:mm..."
   - flexible-window: "Besti glugginn virðist vera HH:mm-HH:mm..."

3. Cause:
   - decisive metric
   - value
   - time
   - approximate route location

4. Return advice if `latestHomeBy` was set.

5. Collapsible technical details.

## Testing Requirements

Claude Code should add/update tests for:

- `latestArrivalBy` provided -> candidate windows generated
- `latestArrivalBy` empty -> single-window fallback
- no "best window" copy when no window search happened
- impossible latest-arrival target
- `latestHomeBy` return-window generation
- impossible latest-home target
- worst metric keeps time and route source metadata
- red result always has a reason/issue
- status label copy does not include `Meðgótt`
- lodging/stay is not part of this phase

Run at minimum:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-coords.test.ts lib/__tests__/weather-tools.test.ts
```

If UI/messages/types are touched broadly, also run the full test suite and build
if practical.

## Localhost checks for Stebbi

After implementation, Stebbi should test `/auth-mvp/vedrid` on localhost:

1. Choose origin and destination.
2. Confirm the time step no longer has exact `Heimferð (valfrjálst)`.
3. Leave latest arrival empty and submit.
   - Expected: single-trip assessment from now/selected departure.
   - Expected: no "best window" claim.
4. Set latest arrival at destination and submit.
   - Expected: best outbound window appears if one is available.
   - Expected: bad windows appear if weather is problematic.
5. Set latest-home-by.
   - Expected: return advice appears without asking for exact home departure.
6. Select a trailer/caravan and verify wind-sensitive wording changes if relevant.
7. Verify every yellow/red result explains cause, time, and approximate route location.
8. Verify status labels are natural Icelandic and `Meðgótt` is gone.
9. Verify mobile layout does not zoom, overflow, or overlap.

Do not test production, change production keys, commit, push, deploy, run SQL,
or change Supabase/Vercel settings as part of this phase unless Stebbi gives
separate explicit approval.

## Suggested Claude Code Execution Scope

This is implementation work and requires explicit Stebbi approval before Claude
Code changes code.

Allowed if Stebbi approves:

- TypeScript/types changes
- deterministic weather analysis changes
- route API validation/payload changes
- Ferðalagið UI changes
- message copy changes
- tests

Not allowed unless separately approved:

- commit
- push
- deploy
- SQL/migration
- Supabase production changes
- Vercel/env/Google key changes

## Confidence / Remaining Risk

Confidence: medium-high.

The product direction is now clear. The main remaining implementation risk is
scope: candidate-window analysis plus result UI can grow quickly. Claude Code
should keep this phase focused on driving windows only and avoid reintroducing
lodging/stay logic.
