# TODO 086 v143 - Codex review of v142 prerelease

Created: 2026-07-14 08:01  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Reviewed: `2026-07-14-0800-todo-086-v142-claude-v141-done-prerelease.md`

## Findings

### Medium - Same-severity provider tie-break can show the lower-wind provider as decisive

v142 correctly aggregates selected providers for scrubber status with `worstWindDisplayStatus` (`app/auth-mvp/vedrid/FerdalagidClient.tsx:761-772`). That fixes the core "met.no must not trump Veðurstofan" issue at status level.

But the decisive provider logic in the summary chooses Veðurstofan whenever its status is at least as severe as MET/Yr:

```ts
return WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(vedurstofanDs) <=
  WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(metnoDs)
```

Reference: `app/auth-mvp/vedrid/FerdalagidClient.tsx:779-785`.

This means if both providers are in the same severity bucket, Veðurstofan always wins even if MET/Yr has the higher actual wind. Example:

- MET/Yr = `othaegilegt`, 11 m/s
- Veðurstofan = `othaegilegt`, 8 m/s
- Current decisive provider = Veðurstofan

That can make the summary show a lower wind than the actual worst selected-provider value. v141 asked for severity first, then higher `windMs`, then provider order only as final tie-break.

Recommended fix:

- Keep combined slot severity as-is.
- For the summary decisive point, compare:
  1. status priority
  2. actual `windMs` when both providers have comparable wind values
  3. stable provider order only if still tied

This probably needs a small helper so the same rule can later include Vegagerðin.

### Medium - Map selected/worst point still remains MET/Yr-oriented when Veðurstofan is decisive

v142 openly lists clickable Veðurstofan station selection as out of scope, which is acceptable for this batch. But there is still a visible mismatch risk when both providers are on and Veðurstofan drives the summary:

- `Á leiðinni` can show the Veðurstofan decisive station (`FerdalagidClient.tsx:1202+`).
- `TravelAuditMap` still uses `highlightedIssue`, `selectedCandidatePointStatuses`, and `activeCandidate` from MET/Yr candidates (`FerdalagidClient.tsx:609-621`, `1420-1428`).
- The selected point details panel inside `TravelAuditMap` is still based on `weatherPoints`, i.e. MET/Yr route points (`components/weather/TravelAuditMap.tsx:445-447`, `603-613`).

Result: the summary can say Veðurstofan is decisive while the map's selected point/details remain a MET/Yr point. That may be okay as a known MVP limitation, but it should be clear in the UI or be the very next patch. Stebbi already called out that "versti punkturinn" and selecting a point are still missing.

Recommended next implementation step:

- Add generic selected-provider point support, not a Veðurstofan-only one-off.
- At minimum, when `combinedDecisiveVedurstofan` is true, avoid implying the MET/Yr selected point is the decisive point.
- Ideal: provider overlay markers/cards can be selected and render a provider-specific detail card.

### Low - Provider disclaimer translation keys remain after render removal

The top disclaimer render was removed, but `vedurstofanLayerDisclaimer` still exists in `messages/is.json` and `messages/en.json` (`messages/is.json:870`, `messages/en.json:866`). This is not harmful unless the project enforces unused message cleanup, but Stebbi asked to "henda þessum texta". Consider removing the keys in the same cleanup batch if no other component uses them.

## What Looks Good

- Selected providers now aggregate for outbound scrubber status.
- `slotStatusOverrides={combinedSlotStatuses ?? undefined}` means both-provider mode uses combined statuses, not MET/Yr-only status.
- Parent outbound auto-select now uses `combinedSlotStatusesRef`, so filter/auto-selection no longer silently falls back to MET/Yr.
- Provider overlay markers now have a dedicated update effect watching `providerOverlayPoints`.
- Destination section is visible as MET/Yr context when a provider is active.
- Threshold box `Þín veðurmörk` uses `effectiveThresholds`, not hardcoded 10/15.
- Return MET/Yr heatmap is hidden when `met.no` is off.

## Commands Run

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result: exit 0, 2 test files passed, 35 tests passed.

```bash
npm run type-check
```

Result: exit 0.

I did not run the full 138-test suite in this Codex pass.

## Suggested Next Step For Claude Code

Small v144 patch:

1. Fix decisive provider tie-break:
   - severity first
   - higher wind second
   - stable provider order last
2. Add one test for same-severity tie where MET/Yr has higher wind than Veðurstofan and should remain decisive.
3. Decide whether to remove unused `vedurstofanLayerDisclaimer` translation keys.
4. Keep generic selected-provider point/card selection as the next feature patch unless Stebbi wants it in this batch.

No SQL, Supabase, cron, Vercel, migrations, commit, push, or deploy.

## Localhost Checks For Stebbi

Preconditions:

- Stebbi runs localhost himself.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`.
- Veðurstofan product data has been warmed recently.
- No Supabase migration, cron run, deploy, push, or commit is part of these checks.

1. MET/Yr only:
   - Scrubber/map/summary behave as before.
   - Threshold box appears.
   - Destination section appears.

2. Veðurstofan only:
   - Scrubber and summary are Veðurstofan-driven.
   - Overlay marker colors/titles update when changing scrubber slot.
   - Destination section appears as MET/Yr context only.

3. Both providers:
   - Scrubber colors/counts reflect worst selected provider per slot.
   - Find a slot where Veðurstofan is worse than MET/Yr: summary should show Veðurstofan as decisive.
   - Find or simulate a slot where both providers have the same severity but MET/Yr has higher wind: after v144, summary should show MET/Yr as decisive.

4. Map/details consistency:
   - When summary says Veðurstofan is decisive, verify the map does not make the MET/Yr selected point look like the decisive provider point.
   - If still unresolved, record it as the next generic provider-selection task.

5. No providers:
   - No-provider message appears.
   - Toggles remain usable.
   - No route assessment or threshold box is shown.

6. Mobile:
   - Threshold box, provider labels, summary, and destination context fit around 360/390/460 px.

## Óvissa / þarf að staðfesta

- I did not run browser checks.
- I did not run the full test suite, only the two relevant test files plus typecheck.
- The tie-break finding depends on the product expectation that "worst" within the same severity band should use actual wind speed. That matches v141 and seems safest for user trust.
