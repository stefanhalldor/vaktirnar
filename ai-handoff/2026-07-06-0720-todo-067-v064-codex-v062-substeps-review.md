# TODO 067 - Codex review of v062 sub-steps 1 + 2

Created: 2026-07-06 07:20  
Timezone: Atlantic/Reykjavik

## Reviewed

Reviewed handoff:

- `ai-handoff/2026-07-06-0722-todo-067-v062-claude-subst1-2-shipped.md`

Reviewed key files:

- `lib/weather/types.ts`
- `lib/weather/travel.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `lib/__tests__/weather-travel.test.ts`
- `messages/is.json`
- `messages/en.json`

Commands run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-coords.test.ts lib/__tests__/weather-tools.test.ts
```

Results:

- `npm run type-check`: passed
- targeted weather tests: passed, `113 passed | 5 skipped`

## Findings

### Blocker 1 - Route weather is not evaluated at the time the user reaches each point

Files:

- `lib/weather/travel.ts:24`
- `lib/weather/travel.ts:73`
- `app/api/teskeid/weather/travel/route.ts:124`

`evaluateCandidate()` currently evaluates every sampled route point against the
full trip window from departure to arrival. That means a destination-near point
can use weather from the departure time even though the user reaches it much
later. On a 5-hour route, bad weather at the far end at 08:00 can incorrectly
affect a user who reaches that point around 13:00.

This is the core deterministic correctness issue. To answer "what weather will I
hit on this drive?", each route point needs an estimated arrival offset.

Recommended fix:

- Add `etaOffsetS` to each `TravelPointForecast`.
- For outbound: point ETA = `candidateDeparture + etaOffsetS`.
- For return: point ETA = `candidateDeparture + (durationS - etaOffsetS)`.
- Evaluate the forecast point closest to that ETA or within a small window,
  rather than filtering every hour in the full route window for every point.

Until this is fixed, the model may be deterministic, but it is not reliably
deterministic about the user's actual drive.

### Blocker 2 - "Besti brottfararglugginn" uses arrival time as the window end

File:

- `lib/weather/travel.ts:126`
- `lib/weather/travel.ts:314`

`groupCandidatesIntoWindows()` sets `TravelWindow.toIso` to the `arrivalIso` of
the last candidate in the group. Then the UI text says:

```txt
Besti brottfararglugginn virðist vera kl. {from}-{to}
```

This can turn a departure window like `08:00-10:00` into something like
`08:00-15:00` if the route takes 5 hours. That is directly misleading.

Recommended fix:

- Store departure-window fields separately:
  - `departureFromIso`
  - `departureToIso`
  - optionally `arrivalFromIso`
  - optionally `arrivalToIso`
- In user copy, only call it a brottfarargluggi if both values are departure
  times.

### Blocker 3 - Impossible latest-home target is silently treated as green

File:

- `lib/weather/travel.ts:272`
- `lib/weather/travel.ts:295`

If `latestHomeBy` is set but the user cannot physically get home by then,
`returnPlan` is created with empty candidates. Then `returnOverallStada` falls
back to `graent`, and the answer can still say the trip looks fine.

This violates v060:

```txt
Miðað við aksturstíma nærðu ekki heim fyrir þennan tíma.
```

Recommended fix:

- Add a return-impossible status/reason, e.g. `home_too_soon`.
- Overall status should become at least `gult`.
- `svar` must explicitly explain the latest-home constraint.
- Add a test that asserts status/copy, not only empty candidates.

### Major 1 - Highlighted issue reason can mismatch the highlighted point

File:

- `lib/weather/travel.ts:299`

`highlightedIssue` is selected by `buildHighlightedIssue(outboundWorst,
returnWorst)`, but `issueReasonCode` is computed separately as:

```ts
const issueReasonCode = outboundWorst?.reasonCode ?? returnWorst?.reasonCode
```

If outbound is yellow and return is red, the highlighted issue can be the return
leg while the reason text comes from outbound. Example: return wind issue could
be described as precipitation.

Recommended fix:

- Have `buildHighlightedIssue()` return the selected candidate reason and leg,
  or return `{ issue, candidate }`.
- Derive `issueReasonCode`, `issueText`, time, distance, and status from the
  same selected source.

Related: `worstCandidateOf()` tie-breaks same-status candidates by wind only
(`lib/weather/travel.ts:158`). For precipitation-driven yellow results, it can
choose a candidate with lower precipitation just because wind is higher. The
tie-break should be reason-aware.

### Major 2 - Return leg distance/location wording uses outbound origin

File:

- `lib/weather/travel.ts:306`

The result says `um X km frá {originName}` for both outbound and return issues.
On return, the user is driving from destination back to origin, so this can be
confusing or wrong from a travel-experience standpoint.

Recommended fix:

- For return issues, show distance from destination, or show both:
  - `um X km frá Reykjavík á leiðinni`
  - `um Y km frá Akureyri á heimleið`
- This becomes easier if `etaOffsetS` and reverse route offset are added as in
  Blocker 1.

### Major 3 - Result UI still does not render structured travel details

File:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:355`

The UI still renders only:

- status label
- `result.svar`
- optional `result.suggestedAction`
- `result.facts`

It does not render structured `travelPlan` fields, best/bad windows, return
windows, highlighted issue details, coordinates, or audit links. That means
large parts of v060 are technically present in the API but not inspectable by
Stebbi in localhost.

Recommended fix:

- Render `travelPlan.outbound.bestWindow` and `badWindows`.
- Render return plan if `latestHomeBy` was set.
- Render `highlightedIssue` with leg, metric, time, value, and route location.
- Add the audit/transparency layer from v062/v063 before calling this ready for
serious localhost validation.

### Major 4 - v062/v063 auditability requirements are not implemented

Files:

- `lib/weather/types.ts:31`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:370`

The current `WorstMetric` does not include:

- rounded met.no forecast coordinates
- met.no raw forecast URL
- Google Maps point URL
- total point count
- route weather point list
- destination-nearest point marker

This means Stebbi still cannot manually verify the exact forecast point against
met.no and the route. This was the core concern behind the later auditability
addenda.

Recommended fix:

- Add `forecastLat`, `forecastLon`, `metnoUrl`, `googleMapsUrl`.
- Expose compact `routeWeatherPoints` under `travelPlan`.
- Render an expandable "Spápunktar á leiðinni" / beta trust layer.
- Do not include raw met.no payloads in the normal API response.

### Major 5 - Route sampling does not guarantee a destination-nearest route point

File:

- `app/api/teskeid/weather/travel/route.ts:123`

The sampling loop does not force inclusion of the last route point. A separate
destination forecast is fetched, but it is no longer used for lodging and is not
included in route point transparency.

For the current product direction, the user needs to see the spápunktur closest
to destination.

Recommended fix:

- Ensure the last route point is included, or explicitly append a destination
  route point if it is not already sampled.
- Mark `isDestinationClosest` in `travelPlan.routeWeatherPoints`.
- Be careful to keep the max point cap bounded.

### Minor 1 - Some Icelandic copy is still rough

File:

- `lib/weather/travel.ts:192`

Examples:

- `cautionviðmiðum`
- `Vindur á cautionviðmiðum fyrir eftirvagn`

Recommended:

- `Vindur nálgast varúðarmörk`
- `Vindur er orðinn varasamur fyrir eftirvagn`

### Minor 2 - Invalid optional date payloads are silently ignored

File:

- `app/api/teskeid/weather/travel/route.ts:69`

Invalid optional dates become `undefined` instead of returning a 400. This is not
likely from the current UI, but API behavior is less predictable.

Recommended fix:

- If a field is present but invalid, return a specific 400 error.
- If absent/empty, treat as optional.

## What Looks Good

- `Meðgótt` is gone.
- Lodging/stay is out of the current flow.
- `latestArrivalBy` is optional, with single-window fallback.
- The code now carries route point metadata farther than before.
- TypeScript and targeted weather tests pass.
- Google/provider/API key work is not touched.

## Recommendation

Do not treat v062 as ready for serious localhost validation yet. It is fine for a
quick smoke test that the UI still loads, but the travel-weather decision model
needs another correction pass first.

Highest-priority fix order:

1. ETA-per-route-point evaluation.
2. Correct departure-window start/end semantics.
3. Latest-home impossible-state handling.
4. Reason/highlight source consistency.
5. Auditability/transparency layer from v062/v063.

## Localhost checks for Stebbi

If Stebbi still wants to smoke test before the fix pass:

1. Open `/auth-mvp/vedrid`.
2. Confirm the wizard loads and has no lodging step.
3. Confirm search, map confirmation, and submit still work.
4. Do not trust timing recommendations yet.
5. Do not treat "best brottfarargluggi" as reliable until the window-end bug is fixed.
6. Do not treat return advice as reliable until latest-home impossible states and
   reverse-route timing are fixed.

After the next fix pass, Stebbi should specifically test:

1. A long route where weather differs by time at origin and destination.
2. A route with `latestArrivalBy` set, checking that the best window shows
   departure times only.
3. A `latestHomeBy` that is impossible, expecting clear warning copy.
4. A yellow/red result, opening details and manually checking the highlighted
   point on Google Maps and met.no.

No production, env, billing, Supabase, SQL, commit, push, or deploy actions are
part of this review.
