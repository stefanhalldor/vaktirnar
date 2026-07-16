# Codex Review — v361 map status filter prerelease

Created: 2026-07-16 21:28  
Timezone: Atlantic/Reykjavik  
TODO: 086  
Reviewed handoff: `2026-07-16-2127-todo-086-v361-claude-v360-done-prerelease.md`

## Findings

No blocking findings.

The v361 change appears to fix the root cause from v360: `TravelAuditMap` no longer gates fine-grained map filter status calculation on `selectedCandidatePointStatuses`. Instead, map marker status, map filter counts, and selected-point filtering now call `resolveRoutePointWindDisplayStatus`, which uses the same value priority as `buildPointSummary`:

1. `activeCandidate.displayPoint` when the route index matches.
2. Nearest forecast row to ETA when an active candidate exists.
3. `summaryForWindow` when there is no active candidate.
4. `no_data` when active candidate data is unavailable.

That is the right direction and directly addresses the screenshot where the card showed `Nálgast hættumörk` while the map filter chips did not.

## Residual Risk / Watchpoints

### Low: `selectedCandidatePointStatuses` still controls coarse marker emphasis

`TravelAuditMap.tsx` still uses `selectedCandidatePointStatuses` for the older coarse `markerStatus` / `isHighlighted` path. That is probably acceptable for this fix because marker color and filter visibility now use the fine resolver. But if Stebbi sees a marker whose color/filter is right while its highlight scale/emphasis feels stale, this remaining coarse path is the next place to inspect.

### Low: Current taxonomy is still wind-display taxonomy, not full “weather severity” taxonomy

`resolveRoutePointWindDisplayStatus` returns `WindDisplayStatus` from wind speed. This is consistent with the existing `WindDisplayStatus` model and the current screenshot. It does not solve a broader future question: if gusts or precipitation become first-class filter statuses, that needs a separate provider-neutral “point display status” model rather than stretching `WindDisplayStatus`.

Do not expand scope now unless Stebbi explicitly asks. For this bug, v361 is appropriately small.

## What I Checked

Read:

- `ai-handoff/2026-07-16-2127-todo-086-v361-claude-v360-done-prerelease.md`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `lib/__tests__/travelAuditMap.helpers.test.ts`

Reviewed diff:

- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `lib/__tests__/travelAuditMap.helpers.test.ts`

Commands run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts
```

Results:

- `npm run type-check` passed.
- `npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts` passed: 91/91 tests.

Note: `git status --short` still prints warnings about `C:\Users\Lenovo/.config/git/ignore` permission denied. That warning is not caused by this change.

## Recommendation

Ready for Stebbi localhost testing.

I would not ask Claude Code for more code changes before visual testing unless Stebbi can still reproduce the missing `Nálgast hættumörk` map chip after this patch.

## Localhost checks for Stebbi

1. Open `/vedrid`.
2. Recreate the route/time where the worst point card shows `Nálgast hættumörk`.
3. Confirm that the map filter chips now include `Nálgast hættumörk (N)` with a non-zero count.
4. Click only the `Nálgast hættumörk` chip.
5. Expected:
   - the matching marker stays visible
   - unrelated markers filter out
   - the selected/worst card still shows `Nálgast hættumörk`
6. Clear the filter and confirm the original chips and markers return.
7. Also test one normal green route and one route with `Óþægilegt` only, to make sure existing map filters still behave normally.

No SQL, Supabase, auth, RLS, env, Vercel, commit, push, or deploy work is part of this review.

## Óvissa / þarf að staðfesta

The only thing I cannot confirm from static review is the actual browser rendering of the chip counts. The code path and tests are now aligned, but Stebbi's localhost visual check is still the deciding proof.
