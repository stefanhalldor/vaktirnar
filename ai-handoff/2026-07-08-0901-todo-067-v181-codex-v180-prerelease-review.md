# TODO-067 v181 - Codex prerelease review of v180

Created: 2026-07-08 09:01
Timezone: Atlantic/Reykjavik
Author: Codex
Status: v179 blockers appear fixed in code. Not release-ready until Stebbi localhost checks and Vercel confirmation are complete.

Context:
- Review of `ai-handoff/2026-07-08-0900-todo-067-v180-claude-v179-fixes-prerelease.md`
- Main question: did v180 actually fix the three v179/v177 selected-point consistency issues?
- Scope reviewed:
  - `components/weather/TravelAuditMap.tsx`
  - `components/weather/travelAuditMap.helpers.ts`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`

## Findings

No blocking findings found in the v180 code changes.

The three v179 findings appear resolved:

1. Map chip times now use `activeCandidate` for every visible chip when present:
   - `components/weather/TravelAuditMap.tsx:352-355`
2. Selected green slots no longer fall back to stale result-level `highlightedIssue`:
   - `app/auth-mvp/vedrid/FerdalagidClient.tsx:480-487`
3. Non-highlighted point details in active-candidate mode no longer show `summaryForWindow` weather metrics:
   - `components/weather/travelAuditMap.helpers.ts:304-324`

## Residual Risk - Focused regression coverage is still missing

This bug survived multiple prerelease review rounds and was caught by Stebbi in the browser, not by tests. v180 reports the full suite passing, but the patch does not appear to add a focused regression test for the selected-point invariants.

Recommended follow-up, not necessarily a release blocker if Stebbi verifies manually:

- Add helper-level coverage around `estimatePointEtaIso` / chip time source if a small helper is extracted.
- Add `buildPointSummary(...)` tests for active-candidate mode:
  - highlighted point may show active issue values
  - non-highlighted point must not show stale `summaryForWindow` metrics
  - ETA remains active-candidate-derived
- Add a small test or documented manual check for selected green slot not falling back to result-level `highlightedIssue`.

## Review Notes

The chip-time fix is the important one:

```ts
const timeIso = activeCandidate
  ? estimatePointEtaIso(activeCandidate, pt, activeLeg ?? 'outbound')
  : pt.summaryForWindow?.etaIso
```

This removes the previous selected/unselected split that caused marker labels to jump between active ETA and stale default-window ETA.

The highlighted-issue fallback fix is also correct in shape. When a slot is selected, `heatmapHighlightedIssue` now uses only `candidateToIssue(...)`; result-level fallback happens only when no slot is selected.

The point-summary fix is intentionally conservative. It avoids showing stale metrics for manually selected non-highlighted points instead of expanding the server payload. That matches the safer v179 recommendation.

## Design.md Check

Relevant `Design.md` points:

- clarity and usability are top priorities
- mobile UI must not force users to infer hidden state
- text and controls must not overlap or create horizontal overflow

v180 improves clarity by ensuring visible map times are tied to the active selected departure. Final confirmation still needs Stebbi's mobile/browser check because this is interactive map UI.

## Release Gate Notes

Do not call TODO-067 release-ready until:

1. Stebbi confirms the localhost checks below.
2. Vercel status for the relevant commit/deploy is confirmed green.
3. Stebbi explicitly accepts release with the remaining test-gap risk, or Claude Code adds focused regression coverage.

No SQL, RLS, auth, Supabase, env, route fetching, saved places, or Google Maps provider changes were part of v180.

## Commands Run

Read-only commands:

- `Get-Content -Encoding UTF8 'ai-handoff\\2026-07-08-0900-todo-067-v180-claude-v179-fixes-prerelease.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\\README.md'`
- `git status --short`
- line-number reads of `components/weather/TravelAuditMap.tsx`, `components/weather/travelAuditMap.helpers.ts`, and `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `git diff -- components/weather/TravelAuditMap.tsx components/weather/travelAuditMap.helpers.ts app/auth-mvp/vedrid/FerdalagidClient.tsx components/teskeid/ReadyTeskeidCard.tsx sql/70_update_ready_card_descriptions.sql`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- `Get-Content -Encoding UTF8 'Design.md'`

No tests were run by Codex.

## Files Changed By Codex

- `ai-handoff/2026-07-08-0901-todo-067-v181-codex-v180-prerelease-review.md`

No application code, SQL, migration, Supabase data, commit, push, deploy, or migration run was changed by Codex.

## Localhost Checks for Stebbi

Use `/auth-mvp/vedrid` with `Garðabær -> Egilsstaðir` or another long route with mixed yellow/green points.

1. Select a yellow departure slot such as `00:54`.
2. Click several warning points on the map.
3. Expected: a given route point's black time chip stays tied to the selected departure ETA across all clicks. It must not change from `01:20` to `08:20` when another point is selected.
4. Expected: `Valin veðurspá` does not show `Veðurspá kl. 08:00` or old wind/gust/precip/temp when active departure is `00:54`.
5. Select a green departure slot.
6. Expected: top card says the selected departure is good; map does not resurrect an old worst point from another departure; point detail panel does not show stale warning metrics.
7. Toggle map filters and scrubber filters.
8. Expected: filter changes visibility only, not the meaning of time labels.
9. Check 360px mobile width.
10. Expected: no horizontal overflow and no overlap.

No production, Supabase, auth, RLS, SQL, billing, secrets, or user-data checks are needed for this specific UI/data-consistency fix.

## Óvissa / Þarf Að Staðfesta

Codex did not run the app in a browser and did not run tests. Confidence is high that the v179 code-level issues are fixed, but the final proof is Stebbi's interactive localhost check.
