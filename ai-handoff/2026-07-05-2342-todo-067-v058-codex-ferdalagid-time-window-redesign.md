# TODO 067 - Ferdalagid time-window redesign

Created: 2026-07-05 23:42  
Timezone: Atlantic/Reykjavik

## Context

This supersedes v057 as the implementation direction for Ferðalagið.

Stebbi tested the current localhost flow and the result technically works, but
the product model is wrong for the real use case. The current UI asks for a
precise departure timestamp too early and then returns an opaque status. That is
too rigid and too close to a raw weather lookup.

Ferðalagið should be a travel timing advisor:

- The user often does not know the exact departure time yet.
- The useful question is usually "Can I travel sometime between now and latest
  arrival?"
- If current conditions are poor but improve later, Teskeið should suggest a
  better departure window.
- If return travel has a latest-home constraint, Teskeið should identify bad
  return windows and usable return windows.

This is not just a copy fix. It requires changing the time-step UX and enriching
the weather analysis so the answer is based on time windows, not only one exact
departure time.

## Product Direction

### Outbound travel

Replace the rigid "Brottfarardagur og -tími" requirement with a more natural
question:

```txt
Hvenær ertu að spá í að leggja af stað?
```

But do not require the user to pick an exact minute as the only analysis point.
The product should also ask:

```txt
Hvenær viltu vera komin/nn á áfangastað í síðasta lagi?
```

The default analysis should evaluate possible departure windows from now until
the latest feasible departure that still arrives by the user's latest-arrival
time.

Example:

- now = 14:00
- route duration = 1h 30m
- latest arrival = 19:00
- possible departure window = 14:00-17:30

For each candidate departure window, evaluate route weather from departure to
arrival. Then tell the user:

- whether leaving now is OK
- whether any risky weather appears before latest arrival
- best suggested departure window
- if relevant, "wait X hours, it calms down around HH:mm"
- if all windows are bad, say that clearly

### Return travel

For the return section, remove the separate "Heimferð (valfrjálst)" exact time
field from the MVP UX.

Keep only:

```txt
Þarf að vera heima í síðasta lagi? (valfrjálst)
```

If the user sets latest-home-by, analyze possible return departure windows from
the destination that still arrive home before latest-home-by.

If there are bad return windows, say so:

- "Ekki gott að leggja af stað heim milli HH:mm og HH:mm vegna vinds..."
- "Besti heimferðarglugginn virðist vera HH:mm-HH:mm."
- "Ef þú bíður lengur en HH:mm lendirðu í verra veðri / kemur of seint heim."

Do not force the user to choose an exact return departure time before Teskeið can
give useful advice.

## Required UX Changes

### Time step fields

Current fields:

- Brottfarardagur og -tími
- Heimferð (valfrjálst)
- Þarf að vera heima í síðasta lagi (valfrjálst)

Replace with:

1. "Hvenær ertu að spá í að leggja af stað?"
   - Optional-ish planning anchor.
   - Use native datetime-local for now if fastest, but wording should make it
     feel like an approximate plan, not a strict exact answer.
   - Default can be blank or "núna" as an explicit quick choice.

2. "Hvenær viltu vera komin/nn á áfangastað í síðasta lagi?"
   - Required for flexible-window analysis.
   - Native datetime-local is OK for MVP.

3. "Þarf að vera heima í síðasta lagi? (valfrjálst)"
   - Optional.
   - Native datetime-local.

Remove the exact "Heimferð (valfrjálst)" field from this MVP pass.

### Useful quick choices

Add simple quick-choice buttons if feasible without overcomplicating:

- "Núna"
- "Eftir 1 klst."
- "Í kvöld"

If this makes the pass too big, do not block the core redesign on it. But the
copy must not imply that exact minute selection is the only supported model.

## Required Analysis Changes

### Candidate departure windows

Implement a deterministic planner that evaluates multiple possible departure
times between:

- earliest outbound departure:
  - selected "spá í að leggja af stað" if provided
  - otherwise now
- latest outbound departure:
  - latestArrivalBy - routeDurationS

Sampling interval for MVP:

- every 30 minutes is acceptable
- every 60 minutes is acceptable only if simpler, but 30 minutes gives a better
  user experience

For each candidate:

- arrival = candidateDeparture + routeDuration
- evaluate route weather over that leg
- keep status, reasonCode, worst wind/gust/precip, and source point/time

Then group adjacent candidates with the same/similar acceptable status into
human-readable windows.

### Suggested outbound result

Result should include:

- `leavingNow` or first candidate status
- `bestOutboundWindow`
- `badOutboundWindows`
- `highlightedIssue`
- route distance/duration
- selected/assumed earliest departure
- latest-arrival constraint

Recommended answer patterns:

Green:

```txt
Þú ættir að geta farið á þessu tímabili. Besti glugginn virðist vera HH:mm-HH:mm.
```

Yellow:

```txt
Það er hægt að fara, en ég myndi frekar miða við HH:mm-HH:mm. Mesta athyglin er úrkoma/vindur um HH:mm, um X km frá [origin].
```

Red:

```txt
Ég myndi ekki mæla með ferðinni á þessu tímabili. Það eru engir góðir brottfarargluggar fyrir komu fyrir HH:mm.
```

### Return windows

If `latestHomeBy` is set:

- compute latest return departure = latestHomeBy - routeDurationS
- earliest return departure is trickier because the user may not know stay length.

For MVP, use one of these approaches:

Preferred simple model:

- Ask no exact return departure.
- Analyze the broad return window from estimated outbound arrival to latest
  return departure.
- Evaluate candidates every 30 minutes.
- Report best and bad return windows.

This is useful and honest enough:

```txt
Miðað við að þú getir lagt af stað heim eftir komu á áfangastað, þá er besti heimferðarglugginn HH:mm-HH:mm.
```

If same-day/overnight ambiguity makes this too broad, Claude Code should keep
the MVP constrained and explicit:

```txt
Heimferðarmat er miðað við tímabilið frá áætlaðri komu á áfangastað þar til þú þarft að leggja af stað heim til að ná heim fyrir HH:mm.
```

Do not silently assume an exact home departure time.

### Worst weather source metadata is mandatory

For each evaluated candidate leg, retain where and when the worst value occurred.

Do not return only numeric maxima.

At minimum keep:

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

The result must be able to answer:

- Hvar á leiðinni?
- Hvenær?
- Er þetta á útleið, heimleið eða á áfangastað?
- Hvaða gildi réð stöðunni?

If exact place names are unavailable, use distance from origin or approximate
route fraction. Do not invent place names.

## Data/API Shape Recommendation

Extend `DeterministicResult` with a travel-specific field instead of relying on
`facts: string[]`.

Suggested shape:

```ts
travelPlan?: {
  route: {
    originName: string
    destinationName: string
    distanceKm: number
    durationMinutes: number
  }
  outbound: {
    earliestDepartureIso: string
    latestArrivalIso: string
    latestDepartureIso: string
    candidates: TravelCandidate[]
    bestWindow?: TravelWindow
    badWindows: TravelWindow[]
    leavingNow?: TravelCandidate
  }
  return?: {
    earliestReturnDepartureIso: string
    latestHomeIso: string
    latestReturnDepartureIso: string
    candidates: TravelCandidate[]
    bestWindow?: TravelWindow
    badWindows: TravelWindow[]
  }
  highlightedIssue?: TravelIssue
}

type TravelCandidate = {
  departureIso: string
  arrivalIso: string
  status: WeatherStatus
  reasonCode?: string
  worstWind?: WorstMetric
  worstGust?: WorstMetric
  worstPrecip?: WorstMetric
}

type TravelWindow = {
  fromIso: string
  toIso: string
  status: WeatherStatus
  reasonCode?: string
}

type TravelIssue = {
  leg: 'outbound' | 'return' | 'stay'
  metric: 'wind' | 'gust' | 'precipitation' | 'data'
  value?: number
  unit?: 'm/s' | 'mm/klst'
  timeIso?: string
  lat?: number
  lon?: number
  distanceFromOriginM?: number
  routeFraction?: number
  reasonCode?: string
}
```

Keep old `facts` only as temporary backward compatibility if tests depend on it.
The Ferðalagið result UI should render from `travelPlan`.

## Result UI Requirements

The result card must not show an unexplained yellow dot with vague text.

It must show:

1. Clear status:
   - Green: "Gott ferðaveður"
   - Yellow: "Varúð"
   - Red: "Ekki mælt með ferð"

2. Time basis:
   - "Miðað við ferð milli HH:mm og komu fyrir HH:mm..."
   - or equivalent

3. Recommendation:
   - best outbound window
   - whether leaving now is OK
   - if waiting helps, say when

4. Cause:
   - metric, value, time, and approximate location

5. Return advice if latest-home-by is set:
   - best return window
   - bad return windows

6. Route/map:
   - At minimum keep place confirmation maps.
   - Prefer result map with route line and highlighted issue marker.
   - If map marker is too big for this pass, the textual "where/when" is still
     mandatory.

7. Technical details behind disclosure:
   - candidate windows
   - worst wind/gust/precip by outbound/return
   - disclaimer

## Important Copy Notes

Do not use "Meðgótt".

Avoid overpromising safety:

- Good: "lítur vel út veðurfarslega"
- Bad: "öruggt"

Use natural Icelandic:

- "Varúð"
- "Ég myndi frekar miða við..."
- "Mesta athyglin er..."
- "Besti glugginn virðist vera..."
- "Þetta er veðurmat, ekki umferðar- eða farartrygging."

## Acceptance Criteria

- The user is no longer forced into a single exact outbound departure timestamp
  as the only meaningful analysis mode.
- The UI asks for latest arrival at destination.
- Exact return departure is removed from MVP.
- Latest-home-by is used to analyze possible return windows.
- The answer can recommend a better departure time/window if weather improves.
- The answer identifies bad windows if weather worsens.
- The answer says where and when the decisive worst value occurs.
- "Meðgótt" is gone.
- No fake place names are invented.
- Mobile layout remains app-like and no field causes zoom/overflow.
- Tests cover:
  - candidate generation from earliest departure to latest feasible departure
  - best outbound window selection
  - bad outbound window detection
  - latest-home return window analysis
  - worst metric source point/time retained
  - result copy/status labels

## Sequencing Recommendation

This is bigger than a cosmetic pass. Claude Code should implement in two tight
sub-steps, but may do them in one execution if scope stays controlled:

1. Analysis/data model:
   - candidate windows
   - worst metric metadata
   - tests

2. UI/copy:
   - time-step field changes
   - result card changes
   - mobile checks

Do not add AI narration for this pass. The point is deterministic decision
support. AI can later help phrase follow-up questions, but it should not decide
whether travel is good.

## Localhost checks for Stebbi

After implementation, Stebbi should test on `/auth-mvp/vedrid`:

1. Choose origin and destination, e.g. Reykjavík -> Húsafell or Akranes -> Apavatn.
2. On the time step, verify there is no required exact "Heimferð" field.
3. Enter or choose an approximate outbound time.
4. Enter latest arrival at destination.
5. Submit with no trailer and no lodging.
6. Verify the result:
   - says whether leaving now/selected time is OK
   - suggests a better window if applicable
   - explains the decisive weather value with time and approximate route location
   - uses natural status labels
7. Repeat with a trailer/caravan selected.
8. Add "Þarf að vera heima í síðasta lagi" and verify return advice appears.
9. Test narrow windows where latest arrival is too soon; the UI should explain
   the constraint rather than crash or give nonsense.
10. Keep DevTools open and verify no new console/API errors.

Do not test production, change production keys, deploy, commit, push, or run
migrations as part of this pass unless Stebbi explicitly approves those actions.

## Risk / Open Questions

- The broad return-window model can become ambiguous for overnight trips. MVP
  should be explicit about the assumption rather than pretending to know the
  user's full plan.
- If candidate analysis creates too many met.no lookups, reuse the same sampled
  route forecasts and filter by candidate time windows. Do not fetch met.no per
  candidate.
- Precipitation severity thresholds may need a later product decision. For now,
  the result must at least explain heavy precipitation clearly.
