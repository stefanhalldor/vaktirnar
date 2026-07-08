# TODO-067 v177 - Codex prerelease review of v176

Created: 2026-07-08 08:09
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Not ready for release. Stebbi found a real selected-point time consistency bug.

Context:
- Review of `ai-handoff/2026-07-08-0805-todo-067-v176-claude-v175-done-prerelease.md`
- Stebbi's localhost point: the time shown on selected map points changes when another point is clicked.
- Screenshots show the same route/departure where one point changes between `01:20` and `08:20`, and another between `08:31` and `01:31`, depending on whether it is selected.

## Findings

### Blocker - Map time chips mix active-candidate ETA with stale/default-window ETA

`components/weather/TravelAuditMap.tsx:346-357` renders time chips for selected and warning points, but it uses two different time sources:

- selected point: `estimatePointEtaIso(activeCandidate, pt, activeLeg ?? 'outbound')`
- unselected warning point: `pt.summaryForWindow?.etaIso`

That matches Stebbi's screenshots. A point shows the active departure ETA while selected, then reverts to its `summaryForWindow` ETA when another point is selected and the first point becomes only a warning marker.

This is a prerelease blocker because the map appears to mutate the route timing when the user clicks around. The user model is now:

> selected scrubber slot = the whole result screen is about that departure time.

The chip labels must follow that model.

Recommended minimal fix:

1. For every visible chip while `activeCandidate` exists, use `estimatePointEtaIso(activeCandidate, pt, activeLeg ?? 'outbound')`, regardless of whether the marker is selected or just a warning marker.
2. Fall back to `pt.summaryForWindow?.etaIso` only when there is no `activeCandidate`.
3. Keep the selected chip and warning chips visually different only by marker selection state, not by time source.
4. Add a small helper if useful, e.g. `getPointChipTimeIso(pt, activeCandidate, activeLeg)`, and unit-test the helper. The Google Maps marker layer itself does not need a heavy browser test for this fix.

### High - Manual point details can combine selected departure time with old weather values

The lower point detail panel has the same underlying problem in a less obvious form.

`components/weather/travelAuditMap.helpers.ts:239-268` sets `departureIso` and `etaIso` from `activeCandidate`, but leaves `windMs`, `gustMs`, `precipMmPerHour`, `status`, and `decisiveTimeFormatted` sourced from `pt.summaryForWindow`.

Then `components/weather/TravelAuditMap.tsx:673-715` displays:

- `Brottfarartími` from the selected active candidate
- `Áætlað á leið` from the selected active candidate
- weather values and the plain `kl. HH:MM` line from `summaryForWindow` unless the point is exactly `highlightedIssue`

This can produce a panel like:

- `Brottfarartími: kl. 00:54`
- `Áætlað á leið: kl. 01:31`
- weather/decisive time from around `08:00`

That is not just copy polish. It makes `Valin veðurspá` internally inconsistent.

Root cause:

- `CandidatePointStatus` only carries `{ routeIndex, status }` (`lib/weather/types.ts:91-106`).
- `evaluateCandidate` only stores per-point status deltas (`lib/weather/travel.ts:111-129`).
- The client therefore has no per-point wind/gust/precip/forecast-time values for a manually selected non-highlighted point in the active candidate.

Recommended release-safe fix:

1. Do not show `summaryForWindow` weather values or `decisiveTimeFormatted` in `PointDetailsPanel` while an `activeCandidate` is selected unless those values are known to belong to the active candidate.
2. For manually selected points, show only values that are active-candidate-safe:
   - point number
   - selected departure time
   - ETA at that point
   - distance from origin/leg start
   - active candidate point status if available from `selectedCandidatePointStatuses`
   - coordinates and links
3. Keep the richer metric line for the true highlighted issue because `candidateToIssue(...)` gives active-candidate metric/time values for that one worst point.
4. If Claude Code wants the richer panel for every warning point, expand the server payload deliberately: include per-point `etaIso`, `forecastTimeIso`, `windMs`, `gustMs`, `precipMmPerHour`, and `decisiveMetric` for non-green `pointStatuses`. Keep it delta-encoded to avoid a large response.

Do not solve this by asking AI for text. It should remain deterministic route/timing/forecast data.

### High - Green selected departure can still inherit the old highlighted issue

`app/auth-mvp/vedrid/FerdalagidClient.tsx:480-485` currently computes:

```ts
selected candidate issue ?? result?.travelPlan?.highlightedIssue
```

That fallback is fine when no scrubber slot is selected. It is wrong when a scrubber slot is selected and that selected candidate is green. In that case `candidateToIssue(...)` correctly returns `undefined`, but the code falls back to the old result-level highlighted issue anyway.

Practical effect:

- top card can say the selected departure looks good
- map markers can be colored green from `selectedCandidatePointStatuses = []`
- point panel can still auto-select/show the old worst point and old metric details

This is another way the result screen can stop being about the selected departure.

Recommended fix:

1. Split "selected candidate exists" from "no selection exists".
2. If a selected outbound/return candidate exists, use only `candidateToIssue(selectedCandidate, ...)`; do not fall back to `result.travelPlan.highlightedIssue`.
3. Only use `result.travelPlan.highlightedIssue` when no heatmap slot is selected.
4. When the active selected candidate has no issue, `TravelAuditMap` should default to the destination or another neutral point, not a `summaryForWindow` red/yellow point from another departure.

This may require extending `initialSelectedIndex(...)` or adding a map-level selected-candidate-aware initial selection path.

## Notes On v176 Changes

The v176 text/link changes look directionally good:

- `weatherDisclaimer` now points users toward road-condition context.
- `worstPointTitle` as "Mest krefjandi á leiðinni" is calmer and better than "Versti punktur".
- The intended default-to-worst-point behavior is sensible, but only when "worst" is computed for the active selected departure. Right now parts of the map still use `summaryForWindow`, so the behavior is not safe enough for release.

No SQL, Supabase, RLS, auth, migration, env, commit, push, or deploy changes were reviewed as part of v176. The active SQL migration file in Stebbi's IDE was not part of this handoff review.

## Design.md Check

Relevant Design.md principles:

- clarity and usability are the top priorities
- Teskeið should feel like a mobile app
- text and controls must not confuse state changes or force the user to infer hidden behavior

The current bug violates clarity: clicking a point makes the same route marker's visible time change because the UI silently switches data source. The fix should keep the mobile UI compact, but the displayed time/status must be stable and traceable to the selected departure.

## Suggested Claude Code Scope

Small, targeted fix only:

1. Make all map chip times use active-candidate ETA when `activeCandidate` exists.
2. Stop `PointDetailsPanel` from showing stale `summaryForWindow` metrics/times in active-candidate mode.
3. Remove the highlighted-issue fallback for selected green candidates.
4. Add focused tests around helper logic and/or travel candidate point payload if payload shape changes.
5. Do not touch SQL, Supabase, saved places, route fetching, auth, or Google Maps provider setup.

## Commands Run

Read-only commands:

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `rg --files ai-handoff`
- `Get-Content -Encoding UTF8 'ai-handoff\\README.md'`
- `rg -n "todo-067|weather|Ferðaveðrið|Valin veðurspá|Punktur|worst|versta|selected|selectedPoint|arrival|departure|00:54|01:31|08:20|01:20" app components lib messages sql ai-handoff`
- `Get-Content -Encoding UTF8 'ai-handoff\\2026-07-08-0805-todo-067-v176-claude-v175-done-prerelease.md'`
- line-number reads of `components/weather/TravelAuditMap.tsx`, `components/weather/travelAuditMap.helpers.ts`, `app/auth-mvp/vedrid/FerdalagidClient.tsx`, `components/weather/DepartureHeatmap.tsx`, `lib/weather/types.ts`, and `lib/weather/travel.ts`
- `Get-Content -Encoding UTF8 'Design.md'`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- `git status --short`
- `git diff -- app/auth-mvp/vedrid/FerdalagidClient.tsx components/weather/TravelAuditMap.tsx components/weather/travelAuditMap.helpers.ts components/weather/DepartureHeatmap.tsx lib/weather/types.ts lib/weather/travel.ts messages/is.json messages/en.json`

No tests were run in this Codex review pass.

## Files Changed By Codex

- `ai-handoff/2026-07-08-0809-todo-067-v177-codex-v176-prerelease-review.md`

No application code was changed.

## Localhost Checks for Stebbi

Use `/auth-mvp/vedrid` on localhost with `Garðabær → Egilsstaðir` or another long route that shows mixed yellow/green points.

After Claude Code fixes this:

1. Select a yellow departure slot such as `00:54`.
2. Click several warning points on the map.
3. Expected: a given route point's black time chip always stays tied to the selected departure ETA. It must not change from `01:20` to `08:20` merely because another point was selected.
4. Expected: `Valin veðurspá` must not show active departure/ETA together with an unrelated old `kl. 08:00` weather line.
5. Select a green departure slot.
6. Expected: the top card says the selected departure is good, the map does not resurrect an old worst point from another departure, and the point panel does not show stale warning metrics.
7. Toggle map filters and scrubber filters.
8. Expected: filter selection changes visibility only; it must not change the meaning of time labels.
9. Check 360px mobile width.
10. Expected: no horizontal overflow, no overlap in map chips/pills/details, and the map/detail cards still fit without manual zooming.

No production, Supabase, auth, RLS, SQL, deployment, billing, secrets, or user-data checks are needed for this specific UI/data-consistency fix unless Claude Code chooses to change server payload shape. If server payload shape changes, run the focused weather tests before prerelease review.

## Óvissa / Þarf Að Staðfesta

Confidence is high that the chip-time bug is caused by the split at `TravelAuditMap.tsx:351-357`.

I did not run the app in a browser from Codex. This review is based on Stebbi's screenshots plus static code inspection.
