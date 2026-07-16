# Review: TODO #73 v002 - arrival weather not visible in UI

Created: 2026-07-08 18:38  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Review target: `ai-handoff/2026-07-08-1825-todo-073-v002-claude-v001-done-prerelease.md`  
Related TODO: #73 - Veður: veður við komu á áfangastað

## Findings

### High - Arrival weather is attached to `outboundCandidates`, but the visible top-card active candidate usually comes from `timelineCandidates`

Stebbi reports no visible UI change. I think the most likely root cause is this mismatch:

- In single-departure mode, `FerdalagidClient` uses `travelPlan.outbound.timelineCandidates` as `outboundDisplayCandidates`.
- On new result, it auto-selects index `0` from those display candidates.
- `activeOutboundCandidate` then becomes `outboundDisplayCandidates[selectedHeatmapIdx]`.
- The arrival-weather UI is gated by `activeOutboundCandidate?.arrivalWeather`.
- Claude v002 only adds `arrivalWeather` to `outboundCandidates`, not to `timelineCandidates`.

Relevant lines:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:392-393` auto-selects first candidate from `timelineCandidates` in single-departure mode.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:462-465` defines `outboundDisplayCandidates` as `timelineCandidates` when `windowMode` is false.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:507-509` derives `activeOutboundCandidate` from `outboundDisplayCandidates` when a slot is selected.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:885` hides the entire block unless `activeOutboundCandidate.arrivalWeather` exists.
- `lib/weather/travel.ts:624-645` adds `arrivalWeather` only to `outboundCandidates`.
- `lib/weather/travel.ts:704-708` creates `timelineCandidates` later and leaves them without `arrivalWeather`.

Recommended fix: extract the destination-arrival enrichment into a helper, for example `withArrivalWeather(candidates, destinationForecast, trailerKind, resolved)`, and apply it to both:

- `outboundCandidates`
- `timelineCandidates` after `buildSingleDepartureTimeline`

That should make the block visible for the default selected slot and for clicked timeline slots.

### Medium - There do not appear to be tests covering `arrivalWeather`

I searched for `arrivalWeather` under `lib/__tests__` and found no hits. The handoff says the suite passed, but passing existing tests does not validate the new behavior.

Add tests in `lib/__tests__/weather-travel.test.ts` that prove:

1. `outbound.leavingAt.arrivalWeather` is populated when destination forecast covers `arrivalIso`.
2. `outbound.timelineCandidates[0].arrivalWeather` is also populated in single-departure mode.
3. `timelineCandidates[0].arrivalWeather.forecastTimeIso` matches or is near `leavingAt.arrivalWeather.forecastTimeIso`.
4. `timelineCandidates` for later clicked slots also get candidate-specific arrival weather.
5. `arrivalWeather` is omitted when destination forecast is absent or outside the allowed ETA window.

This specific regression would likely have been caught by checking `timelineCandidates[0].arrivalWeather`.

### Medium - v002 handoff is missing required `Localhost checks for Stebbi`

`ai-handoff/README.md` and `WORKFLOW.md` require every implementation handoff/review to include `Localhost checks for Stebbi`. The v002 handoff does not include that section. This matters here because a localhost check immediately revealed the UI was not visible.

Please include the section in the follow-up handoff and spell out:

- Route to test, for example Garðabær -> Akranes.
- Expected `Mættur` block in the top card.
- Click another heatmap slot and verify arrival weather updates.
- Confirm drawer opens from `Skoða spána`.
- Test mobile 360/390/460 px.

### Low - The v002 handoff says `USAGE_EVENT_SECRET` and SQL/71 are still open, but Stebbi had already reported both done

This is probably stale context in the handoff, not part of #73. It should not block the fix, but avoid repeating it in the next handoff unless re-verified.

## Suggested Claude fix plan

1. Do not redesign the UI yet; first make the existing block receive data in the selected timeline path.
2. In `lib/weather/travel.ts`, extract arrival-weather enrichment from the current inline block.
3. Apply the helper to `outboundCandidates` immediately after those candidates are generated.
4. Apply the same helper to `scanResult.timelineCandidates` before assigning `timelineCandidates`.
5. Keep `destinationForecastHours` one copy per `travelPlan`, as v002 did.
6. Add focused deterministic tests for `leavingAt` and `timelineCandidates`.
7. Run type-check and weather tests.
8. Return a new handoff with findings addressed and `Localhost checks for Stebbi`.

## Localhost checks for Stebbi after Claude follow-up

1. Open `/auth-mvp/vedrid` on localhost while signed in.
2. Calculate a route that shows the hourly departure scrubber, for example Garðabær -> Akranes.
3. Expected: the top card above the map shows a compact `Mættur` / arrival-weather block without needing to click anything else.
4. Click another departure slot.
5. Expected: the `Mættur` block updates arrival time and weather for that selected slot.
6. Click `Skoða spána`.
7. Expected: the drawer opens and highlights the same forecast hour used in the top card.
8. Test a long route where arrival is near forecast coverage end.
9. Expected: if no arrival forecast is available, the UI does not crash and does not show fake values.
10. Test mobile widths 360, 390, and 460 px.
11. Expected: no horizontal overflow or overlap; top card still feels readable.

No SQL, Supabase, RLS, auth, secrets, production data, billing, deployment, or migration checks are required for this follow-up.

## Notes

I did not change application code in this review. This is a review/handoff only.

I did not run tests. The code-level diagnosis is based on reading current HEAD and the v002 handoff.
