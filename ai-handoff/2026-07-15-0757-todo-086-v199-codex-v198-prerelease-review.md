# 2026-07-15 07:57 | todo-086 | v199 | codex | v198 prerelease review

Created: 2026-07-15 07:57  
Timezone: Atlantic/Reykjavik  
Reviewed handoff: `2026-07-15-0750-todo-086-v198-claude-prerelease.md`  
Mode: Review only. No code changes, no SQL, no migration, no commit, no push, no deploy.

## Findings

### Blocker: cron says it fast-skips, but the route does not actually check run state

[app/api/cron/warm-vedurstofan/route.ts](../app/api/cron/warm-vedurstofan/route.ts) lines 4-7 say the cron "fast-skips when the current expected cycle is already fresh or another run is in progress". The implementation does not do that. It only checks auth and `WEATHER_ENABLED`, then calls:

```ts
const result = await warmVedurstofanForecastCache()
```

There is no `getExpectedVedurstofanCycleIso`, no `getVedurstofanRunState`, no running-row insert, and no `expectedAtimeIso` context passed to the warmer.

Impact:

- Changing [vercel.json](../vercel.json) to `*/10 * * * *` can make this endpoint run every 10 minutes without the claimed route-level fast-skip.
- Whether it "hits Veðurstofan" then depends on deeper cache behavior, not on the explicit run-state protection the handoff describes.
- The handoff claim that this "only hits Veðurstofan in the ~10-30 min window" is not proven by this code.

Recommended fix before release:

- In `/api/cron/warm-vedurstofan`, compute `expectedCycleIso`.
- Call `getVedurstofanRunState(expectedCycleIso)` before warming.
- Return a skipped JSON response for `alreadyFresh`, `running`, and possibly `recentlyAttempted`.
- If running is needed for cron too, insert a running row for cron with `expected_atime = expectedCycleIso` before calling the warmer, analogous to manual refresh.
- Pass context into `warmVedurstofanForecastCache({ triggeredBy: 'cron', triggerReason: ..., expectedAtimeIso: expectedCycleIso, existingRunId })`.

### Blocker: cron attempts do not currently count in cooldown/run-state because cron runs have `expected_atime = null`

Claude's handoff says cooldown now takes CRON into account. The query in [lib/weather/providers/vedurstofan.server.ts](../lib/weather/providers/vedurstofan.server.ts) lines 934-948 removed the `triggered_by = manual` filter, which is good, but it still filters:

```ts
.eq('expected_atime', expectedAtimeIso)
```

Cron calls `warmVedurstofanForecastCache()` without context in [app/api/cron/warm-vedurstofan/route.ts](../app/api/cron/warm-vedurstofan/route.ts), so `writeRunRecord()` gets `context` undefined and writes `expected_atime: null` at [lib/weather/providers/vedurstofan.server.ts](../lib/weather/providers/vedurstofan.server.ts) lines 1022-1026.

Impact:

- Cron-finished runs will not match the `recentlyAttempted` query for the expected cycle.
- Cron-running runs will not match the `running` query either, because that also filters by `expected_atime`.
- Manual refresh can still be offered too soon after a cron attempt, and manual/cron can race unless another unique DB constraint catches it.

Recommended fix before release:

- Ensure cron run records are written with `expected_atime`.
- Use the same run-state pathway for cron and manual, with different `triggered_by`.
- Update tests to prove:
  - a cron run with matching `expected_atime` hides/disables manual refresh during cooldown;
  - an active cron running row blocks manual refresh;
  - a cron run for a previous expected cycle does not block the current cycle.

### High: UI cooldown state can get stuck past the retry time

[app/auth-mvp/vedrid/FerdalagidClient.tsx](../app/auth-mvp/vedrid/FerdalagidClient.tsx) lines 533-551 initializes run state once using `serverInitDoneRef`. If the server returns `recentlyAttempted`, the UI sets:

```ts
setVedurstofanRefreshState('recentlyAttempted')
```

The refresh button is hidden while `vedurstofanRefreshState === 'recentlyAttempted'` at lines 963-966. I do not see logic that clears this state when `nextManualRefreshIso` passes.

Impact:

- At 07:19, if next retry is 07:27, hiding the button is correct.
- At 07:28, the button may still be hidden until route reload or another state reset happens.
- The polling effect fetches `/freshness`, but it only checks `atimeIso > knownAtime`; it does not update `runState` or clear cooldown.

Recommended fix:

- Derive button visibility from server-provided run-state plus current time, not from a sticky local string alone.
- Add a timer or polling update that clears `recentlyAttempted` when `Date.now() >= Date.parse(nextManualRefreshIso)`.
- Or make the existing 90-second freshness poll also update `runState` and `nextManualRefreshIso`.
- Reset `serverInitDoneRef` when a new travel result/layer is loaded, otherwise the next route calculation may not reinitialize server state.

### Medium: running state is rendered as "recently attempted" and may show no status text

Both manual refresh and initial freshness sync map `runState === 'running'` to `vedurstofanRefreshState = 'recentlyAttempted'`:

- [app/auth-mvp/vedrid/FerdalagidClient.tsx](../app/auth-mvp/vedrid/FerdalagidClient.tsx) lines 513-516
- [app/auth-mvp/vedrid/FerdalagidClient.tsx](../app/auth-mvp/vedrid/FerdalagidClient.tsx) lines 542-545

But the UI only shows the recently-attempted text if `nextManualRefreshIso` exists at lines 1049-1050. For `running`, `nextManualRefreshIso` is probably null.

Impact:

- The refresh button can disappear without any visible explanation.
- The existing message key `vedurstofanRefreshRunning` appears to exist but is not used here.

Recommended fix:

- Add a distinct client state for `running`, or keep `runState` as its own state.
- Show `vedurstofanRefreshRunning` when server says `running`.
- Keep `recentlyAttemptedUntil` for cooldown only.

### Medium: freshness banner can say "var væntanleg" during the grace window

[app/auth-mvp/vedrid/FerdalagidClient.tsx](../app/auth-mvp/vedrid/FerdalagidClient.tsx) lines 960-961 computes:

```ts
const nextExpectedIsPast = nextExpectedAfterDataIso ? Date.parse(nextExpectedAfterDataIso) < Date.now() : false
```

That ignores the 10-minute Veðurstofan grace window in [lib/weather/vedurstofanFreshness.ts](../lib/weather/vedurstofanFreshness.ts). Example: at 06:05, data from 03:00 is still considered fresh by `isVedurstofanCycleFresh`, but the banner can say "ný spá var væntanleg kl. 06:00".

Impact:

- It is not a data correctness bug, but it can make fresh/grace-window state sound stale.

Recommended fix:

- Use the past wording only when `!isVedurstofanDataFresh`.
- During grace, use future/neutral wording, or suppress the "var væntanleg" phrasing.

### Medium: status labels are now shared, but still use the wrong visual source of truth

Stebbi confirmed after v198 that met.no and Veðurstofan now use the same label component, but not the label style he asked for.

Desired source of truth:

- the status pills under the map in [components/weather/TravelAuditMap.tsx](../components/weather/TravelAuditMap.tsx) lines 625-648;
- same status language as the summary line;
- visually: rounded pill, status dot, status icon/emoji, text label, and in filter context a count.

Current `WindStatusBadge`:

- [components/weather/WindStatusBadge.tsx](../components/weather/WindStatusBadge.tsx) lines 45-50 renders `chip` as dot + text only;
- it omits `meta.icon`;
- therefore card chips show e.g. `● Óþægilegt`, while the desired met.no/map pill language is closer to `● 🫣 Óþægilegt`.

Impact:

- The code moved in the right direction by sharing one component, but it standardized on the wrong variant.
- The card chip for Veðurstofan in Stebbi's screenshot still does not match the met.no pill under the map.
- This is a UI consistency issue, not a provider-specific issue. Both met.no and Veðurstofan should use the same status-label primitive.

Recommended fix:

- Make `WindStatusBadge`'s card/status variant match the map pill semantics: dot + icon + text.
- Or add a new explicit variant, e.g. `statusPill`, and use it for:
  - worst point cards,
  - selected point cards,
  - all-points cards,
  - Veðurstofan point cards,
  - met.no point cards.
- Keep the map filter count as a separate optional prop, not as a separate hand-rolled button label.
- Avoid maintaining two different implementations of the same status pill.

### Medium: handoff instruction to run SQL77 is stale and should be corrected

Claude's v198 handoff says:

> Keyra `sql/77_vedurstofan_forecasts_history.sql` í Supabase

Stebbi already ran SQL77 on 2026-07-14. Do not ask him to run it again unless a read-only verification shows it is missing.

Recommended correction:

- Replace "run SQL77" with "verify SQL77 exists if uncertain".
- Suggested read-only checks:

```sql
select to_regclass('public.vedurstofan_forecasts_history') as history_table;

select count(*) as rows
from public.vedurstofan_forecasts_history;
```

SQL77 itself is mostly idempotent, but rerunning production schema SQL without need is still bad workflow and makes Stebbi uncertain.

### Low: comments/docs still say manual-only in a few places

[app/api/teskeid/weather/vedurstofan/refresh/route.ts](../app/api/teskeid/weather/vedurstofan/refresh/route.ts) still documents `recentlyAttempted` as "manual run finished < 10 min ago", even though v198 intends any run, cron or manual, to count.

This will confuse the next review. Update comments after the run-state behavior is fixed.

## What looks good

- The banner no longer uses `getNextVedurstofanCycleIso(new Date())`; it now uses `getNextCycleAfterAtimeIso(layerAtimeIso)`, which fixes the core 03:00 -> 09:00 wording bug.
- The new IS copy `ný spá var væntanleg` / `ný spá væntanleg` is much closer to Stebbi's requested wording.
- `freshness` endpoint is still auth-gated and checks `weather-provider-vedurstofan` access before using service role.
- Switching route point status chips from `badge` to a shared component is the right direction, but the selected visual variant still needs to match Stebbi's desired map/status pill. See the status-label finding above.
- The Vercel cron expression in `vercel.json` is now `*/10 * * * *`, which is the right cadence after the fast-skip/run-state bug is fixed.

## Answer to Stebbi's operational questions

### Should Stebbi run SQL77 again?

No. If SQL77 was run successfully yesterday, do not run it again now. If there is uncertainty, do read-only verification only.

### Does Stebbi need to set CRON manually in Vercel?

No, not as the first move. `vercel.json` should be source of truth, and Vercel should update cron schedule after deploy. The dashboard screenshot showing `0 */6 * * *` simply means production has not yet picked up this local `vercel.json` change.

But do not deploy the `*/10` cron change until the route-level fast-skip/run-state issue above is fixed. Otherwise production may run the warmer every 10 minutes without the protection the handoff claims.

## Required next step for Claude Code

Do not release v198 as-is.

Claude Code should do a narrow v199 fix:

1. Implement actual fast-skip/run-state in `/api/cron/warm-vedurstofan`.
2. Ensure cron run records include `expected_atime`.
3. Ensure running/recent cron runs block manual refresh and initialize UI state correctly.
4. Make UI cooldown expire without full reload.
5. Render `running` distinctly from `recentlyAttempted`.
6. Fix `WindStatusBadge`/status pill styling so cards use the same dot + icon + label language as the map pills and summary.
7. Update stale comments and handoff text about SQL77.
8. Add or update tests for cron run-state and manual cooldown behavior.

## Commands run by Codex

Read-only inspection only:

- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-0750-todo-086-v198-claude-prerelease.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Content -Encoding UTF8 'Design.md' | Select-Object -First 240`
- `git diff --stat`
- `git diff -- ...`
- `rg -n ...`
- `Get-Content` snippets from:
  - `app/api/cron/warm-vedurstofan/route.ts`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `components/weather/TravelAuditMap.tsx`
  - `app/api/teskeid/weather/vedurstofan/freshness/route.ts`
  - `app/api/teskeid/weather/vedurstofan/refresh/route.ts`
  - `lib/weather/providers/vedurstofan.server.ts`
  - `lib/weather/vedurstofanFreshness.ts`
  - `vercel.json`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

No tests were run. No code, SQL, commit, push, deploy, or migration was performed.

## Localhost checks for Stebbi

After Claude Code fixes the blockers, test:

1. **Stale wording**
   - Use/open a result where Veðurstofan data is from `03:00` and current expected cycle is `06:00`.
   - Expected: banner says `ný spá var væntanleg kl. 06:00`, not `09:00`.

2. **Grace-window wording**
   - Test shortly after a 3-hour boundary, within the 10-minute grace window.
   - Expected: UI should not sound alarming/stale if the previous cycle is still accepted as fresh.

3. **Manual cooldown**
   - Trigger manual refresh.
   - Within 10 minutes, reload or reopen the result.
   - Expected: no `Sækja ný gögn` button; show cooldown/retry time.
   - After retry time passes, without full page reload if possible, expected: button becomes available again if data is still stale.

4. **Running state**
   - If a warm run is in progress, open result.
   - Expected: UI says data is being fetched, not only hides the button silently.

5. **Cron behavior after deploy**
   - Only after explicit deploy approval, verify Vercel dashboard shows `*/10 * * * *`.
   - Watch logs around cycle boundary.
   - Expected: cron skips when fresh/running and does not warm all stations unnecessarily every 10 minutes.

6. **Status chips**
   - Test met.no-only, Veðurstofan-only, and both providers.
   - Worst point, selected point, and all-points cards should show the same status-pill language as the map pills under the map.
   - Expected: dot + status icon/emoji + label, e.g. the same visual language as `● 🫣 Óþægilegt` / `● 😬 Nálgast óþægindi`, not just dot + text.
   - Counts should remain only where they make sense, e.g. filter pills.

7. **SQL77**
   - Do not rerun migration casually.
   - If needed, verify with read-only SQL that `public.vedurstofan_forecasts_history` exists and is receiving rows after warm runs.

## Risk summary

The UI copy and chip work is close. The production risk is the cron/run-state mismatch: the dashboard cadence can safely become 10 minutes only after the route actually fast-skips and writes expected-cycle metadata for cron runs.
