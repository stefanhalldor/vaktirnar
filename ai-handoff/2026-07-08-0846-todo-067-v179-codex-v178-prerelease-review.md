# TODO-067 v179 - Codex prerelease review of v178

Created: 2026-07-08 08:46
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Not ready for release. v177 findings are still open and v178 was pushed with known blockers.

Context:
- Review of `ai-handoff/2026-07-08-0844-todo-067-v178-claude-shipped-prerelease-handoff.md`
- User request from Stebbi: review v178 and include everything from v177 if those issues were not fixed.
- v178 itself says: "Known issues flagged by Codex v177 - NOT fixed in this commit".

## Findings

### Blocker - v177 map chip time bug is still present

The v177 blocker is not fixed.

`components/weather/TravelAuditMap.tsx:352-358` still computes map chip time from two different sources:

```ts
if (isSelected && activeCandidate) {
  timeIso = estimatePointEtaIso(activeCandidate, pt, activeLeg ?? 'outbound')
} else {
  timeIso = pt.summaryForWindow?.etaIso
}
```

That means:

- selected point uses ETA for the active selected departure
- unselected warning points use `summaryForWindow.etaIso`, which can belong to another/default departure window

This is exactly the behavior Stebbi saw in screenshots: the same marker time can change from e.g. `01:20` to `08:20` when another point is clicked.

This remains a release blocker because the map appears to mutate route timing based on point selection. The selected scrubber slot must make the whole result screen about that departure time.

Required fix from v177, still applicable:

1. For every visible chip while `activeCandidate` exists, use `estimatePointEtaIso(activeCandidate, pt, activeLeg ?? 'outbound')`, regardless of whether the marker is selected or only a warning marker.
2. Fall back to `pt.summaryForWindow?.etaIso` only when there is no `activeCandidate`.
3. Keep visual selection state separate from time source.
4. Add a focused helper/unit test if useful.

### High - v177 point detail stale metric bug is still present

The v177 high finding is not fixed.

`components/weather/travelAuditMap.helpers.ts:301-332` now computes active-candidate `etaIso`, but still sources weather values from `pt.summaryForWindow`:

- `windMs`
- `gustMs`
- `precipMmPerHour`
- `decisiveTempC`
- `status`
- `decisiveMetric`
- `decisiveTimeFormatted`

Then `components/weather/TravelAuditMap.tsx:673-717` displays active-candidate departure/ETA next to those `summaryForWindow` weather values and decisive forecast time.

Practical result:

- `Brottfarartími` can be from selected slot `00:54`
- `Áætlaður tími` can be active-candidate ETA
- `Veðurspá kl. ...` and wind/gust/precip/temp can still be from another/default route summary window

That makes `Valin veðurspá` internally inconsistent. The v178 text rewrite made the panel more readable, but it did not fix the data-source mismatch.

Required release-safe fix from v177, still applicable:

1. Do not show `summaryForWindow` weather values or `decisiveTimeFormatted` while an `activeCandidate` is selected unless those values are known to belong to that candidate.
2. For manually selected points in active-candidate mode, show only active-candidate-safe values:
   - point number
   - selected departure time
   - ETA at that point
   - distance from origin/leg start
   - active candidate point status if available from `selectedCandidatePointStatuses`
   - coordinates/forecast/map links if still desired
3. Keep richer metric lines for the true active highlighted issue because `candidateToIssue(...)` carries active-candidate metric/time values for that one worst point.
4. If richer per-point data is needed for every warning marker, expand `CandidatePointStatus` deliberately and delta-encode it. `lib/weather/types.ts:92-107` still only carries `{ routeIndex, status }`.

Do not solve this with AI copy. The fix should remain deterministic route/timing/forecast data.

### High - v177 green-slot highlightedIssue fallback is still present

The v177 high finding is not fixed.

`app/auth-mvp/vedrid/FerdalagidClient.tsx:480-485` still does this:

```ts
selected candidate issue ?? result?.travelPlan?.highlightedIssue
```

That fallback is correct only when no scrubber slot is selected. It is wrong when a selected candidate exists and is green. In that case `candidateToIssue(...)` correctly returns `undefined`, but the code falls back to the old result-level highlighted issue.

Practical effect:

- top card can say the selected departure is good
- selected candidate point statuses can be empty/green
- map/panel can still resurrect an old worst point and old metric details from another departure

Required fix from v177, still applicable:

1. Split "slot is selected" from "candidate has an issue".
2. If a selected outbound/return candidate exists, use only `candidateToIssue(selectedCandidate, ...)`.
3. Do not fall back to `result.travelPlan.highlightedIssue` for selected green candidates.
4. Only use `result.travelPlan.highlightedIssue` when no scrubber slot is selected.
5. When selected candidate has no issue, `TravelAuditMap` should default to a neutral active-candidate-safe point, not a stale `summaryForWindow` red/yellow point.

Note: v178 extended `initialSelectedIndex(...)` with `activeCandidate` and worst metric route index, which is useful for non-green selected candidates. It does not fix the fallback above, because `highlightedIssue` can still be stale before `initialSelectedIndex(...)` runs.

### High - v178 was pushed while known prerelease blockers were still open

`ai-handoff/2026-07-08-0844-todo-067-v178-claude-shipped-prerelease-handoff.md:6` says:

> Status: Committed and pushed. Vercel deploy in progress. Known data-consistency issues documented below for next pass.

This is a workflow/release risk:

- v178 knowingly shipped with the v177 selected-point blocker still open.
- The handoff says Vercel deploy was still in progress, not confirmed green.
- WORKFLOW says a push to main requires watching Vercel until build completes and not describing push as done until Vercel is confirmed green.

Required next step:

1. Claude Code should provide the final Vercel deployment status for commit `a31123a`.
2. If it deployed to production/main, Stebbi should treat the selected-point issue as a live known bug until a follow-up fix is merged.
3. Do not call TODO-067 release-ready until v177 blockers are fixed or Stebbi explicitly accepts the bug with a concrete release decision.

### Medium - v178 handoff is missing required Localhost checks and command results

`ai-handoff/README.md` and WORKFLOW require every handoff/review to include `Localhost checks for Stebbi`.

The v178 handoff has no `Localhost checks for Stebbi` section, and the `rg` check found no `Commands Run` section either.

This matters more than usual here because the issue is visible only through interactive behavior:

- selecting scrubber slots
- clicking multiple map points
- watching chip labels and the point detail panel

Required fix:

1. Claude Code should add or provide a follow-up handoff with exact command results and exit codes.
2. Claude Code should include localhost checks for Stebbi, especially the v177 regression checks copied below.

## v177 Content Carried Forward

Everything below remains active because v178 did not fix these issues.

### v177 Blocker - Map time chips mix active-candidate ETA with stale/default-window ETA

`components/weather/TravelAuditMap.tsx` renders time chips for selected and warning points, but uses two different time sources:

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

### v177 High - Manual point details can combine selected departure time with old weather values

The lower point detail panel has the same underlying problem in a less obvious form.

`components/weather/travelAuditMap.helpers.ts` sets `departureIso` and `etaIso` from `activeCandidate`, but leaves `windMs`, `gustMs`, `precipMmPerHour`, `status`, and `decisiveTimeFormatted` sourced from `pt.summaryForWindow`.

Then `components/weather/TravelAuditMap.tsx` displays:

- `Brottfarartími` from the selected active candidate
- `Áætlað á leið` from the selected active candidate
- weather values and forecast/decisive time from `summaryForWindow` unless the point is exactly `highlightedIssue`

Root cause:

- `CandidatePointStatus` only carries `{ routeIndex, status }`.
- `evaluateCandidate` only stores per-point status deltas.
- The client therefore has no per-point wind/gust/precip/forecast-time values for a manually selected non-highlighted point in the active candidate.

Recommended release-safe fix:

1. Do not show `summaryForWindow` weather values or `decisiveTimeFormatted` in `PointDetailsPanel` while an `activeCandidate` is selected unless those values are known to belong to the active candidate.
2. For manually selected points, show only values that are active-candidate-safe.
3. Keep the richer metric line for the true highlighted issue because `candidateToIssue(...)` gives active-candidate metric/time values for that one worst point.
4. If Claude Code wants the richer panel for every warning point, expand the server payload deliberately: include per-point `etaIso`, `forecastTimeIso`, `windMs`, `gustMs`, `precipMmPerHour`, and `decisiveMetric` for non-green `pointStatuses`. Keep it delta-encoded to avoid a large response.

### v177 High - Green selected departure can still inherit the old highlighted issue

`app/auth-mvp/vedrid/FerdalagidClient.tsx` computes:

```ts
selected candidate issue ?? result?.travelPlan?.highlightedIssue
```

That fallback is fine when no scrubber slot is selected. It is wrong when a scrubber slot is selected and that selected candidate is green.

Recommended fix:

1. Split "selected candidate exists" from "no selection exists".
2. If a selected outbound/return candidate exists, use only `candidateToIssue(selectedCandidate, ...)`; do not fall back to `result.travelPlan.highlightedIssue`.
3. Only use `result.travelPlan.highlightedIssue` when no heatmap slot is selected.
4. When the active selected candidate has no issue, `TravelAuditMap` should default to the destination or another neutral point, not a `summaryForWindow` red/yellow point from another departure.

## Design.md Check

Relevant Design.md principles remain the same as v177:

- clarity and usability are the top priorities
- Teskeið should feel like a mobile app
- text and controls must not confuse state changes or force the user to infer hidden behavior

The v178 implementation improves copy and panel readability, but the data-source mismatch still violates clarity. The user cannot tell whether a displayed time is "when I reach this point for selected departure" or "some forecast/default-window time from another calculation".

## Suggested Claude Code Scope

Keep the next pass narrow:

1. Fix chip time source first.
2. Fix selected green candidate fallback.
3. Make active-candidate point details avoid stale `summaryForWindow` metrics.
4. Add focused tests around helper logic and/or expanded payload shape.
5. Provide final Vercel status for `a31123a`.
6. Do not touch SQL, Supabase, RLS, saved places, Google Maps provider setup, auth, or migrations for this fix.

## Commands Run

Read-only commands:

- `Get-Content -Encoding UTF8 'ai-handoff\\2026-07-08-0844-todo-067-v178-claude-shipped-prerelease-handoff.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\\2026-07-08-0809-todo-067-v177-codex-v176-prerelease-review.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\\README.md'`
- `rg -n "activeCandidate|selectedCandidatePointStatuses|summaryForWindow|highlightedIssue|manual|PointDetailsPanel|estimatePointEtaIso|pointStatuses|getPointChip|candidateToIssue|routeIndex|forecastTimeIso|etaIso" app\\auth-mvp\\vedrid\\FerdalagidClient.tsx components\\weather\\TravelAuditMap.tsx components\\weather\\travelAuditMap.helpers.ts components\\weather\\DepartureHeatmap.tsx lib\\weather\\types.ts lib\\weather\\travel.ts lib\\__tests__`
- line-number reads of `components/weather/TravelAuditMap.tsx`, `components/weather/travelAuditMap.helpers.ts`, `app/auth-mvp/vedrid/FerdalagidClient.tsx`, and `lib/weather/types.ts`
- `rg -n "Localhost checks for Stebbi|Commands Run|Vercel|Committed and pushed|Known issues" 'ai-handoff\\2026-07-08-0844-todo-067-v178-claude-shipped-prerelease-handoff.md'`
- `git status --short`
- `rg --files ai-handoff | rg "todo-067-v179|todo-067-v18[0-9]|todo-067-v17[8-9]"`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

No tests were run in this Codex review pass.

## Files Changed By Codex

- `ai-handoff/2026-07-08-0846-todo-067-v179-codex-v178-prerelease-review.md`

No application code, SQL, migration, Supabase config, auth, deployment config, commit, push, or deploy was changed by Codex.

## Localhost Checks for Stebbi

Use `/auth-mvp/vedrid` on localhost with `Garðabær -> Egilsstaðir` or another long route that shows mixed yellow/green points.

After Claude Code fixes this:

1. Select a yellow departure slot such as `00:54`.
2. Click several warning points on the map.
3. Expected: a given route point's black time chip always stays tied to the selected departure ETA. It must not change from `01:20` to `08:20` merely because another point was selected.
4. Expected: `Valin veðurspá` must not show active departure/ETA together with an unrelated old `Veðurspá kl. 08:00` or old wind/gust/precip/temp line.
5. Select a green departure slot.
6. Expected: the top card says the selected departure is good, the map does not resurrect an old worst point from another departure, and the point panel does not show stale warning metrics.
7. Toggle map filters and scrubber filters.
8. Expected: filter selection changes visibility only; it must not change the meaning of time labels.
9. Check 360px mobile width.
10. Expected: no horizontal overflow, no overlap in map chips/pills/details, and the map/detail cards still fit without manual zooming.

No production, Supabase, auth, RLS, SQL, billing, secrets, or user-data checks are needed for this specific UI/data-consistency fix unless Claude Code chooses to change server payload shape. If server payload shape changes, run focused weather tests before another prerelease review.

## Óvissa / Þarf Að Staðfesta

Confidence is high that all three v177 findings remain open. This is confirmed by both v178's own "NOT fixed" section and current code inspection.

I did not run the app in a browser and did not check Vercel status from Codex. Claude Code should provide the final Vercel deployment result for commit `a31123a`.
