# TODO 086 v158 - Codex review of v157 prerelease

Created: 2026-07-14 17:32
Timezone: Atlantic/Reykjavik

## Findings

### High - Grace window marks arbitrarily old Veðurstofan data as fresh

File: `lib/weather/vedurstofanFreshness.ts:51-60`

`isVedurstofanCycleFresh()` returns `true` for any valid `atimeIso` during the first 10 minutes after a 3-hour cycle boundary:

```ts
if (now.getTime() - expectedCycleMs < VEDURSTOFAN_GRACE_MS) return true
```

That means if the current time is `12:05`, an `atimeIso` from yesterday, last week, or any old cycle is considered fresh as long as it parses as a date.

This directly violates Stebbi's core requirement: users must not end up with old Veðurstofan data presented as normal. It also means the stale warning and refresh CTA can disappear exactly during every 10-minute grace window.

Expected behavior:

- During grace, allow only the immediately previous cycle, not arbitrary old data.
- After grace, require the current expected cycle.
- A safe rule:
  - current cycle: fresh
  - previous cycle: fresh only while inside grace
  - older than previous cycle: stale always
  - future cycle: probably fresh only within a narrow tolerance, not arbitrary future timestamps

Add tests for:

- `now=12:05`, `atime=09:00` => fresh
- `now=12:05`, `atime=06:00` => stale
- `now=12:05`, `atime=yesterday 21:00` => stale
- `now=12:11`, `atime=09:00` => stale

### High - Manual refresh is not anti-stampede safe while a refresh is in progress

Files:

- `app/api/teskeid/weather/vedurstofan/refresh/route.ts:48-57`
- `lib/weather/providers/vedurstofan.server.ts:755-775`

The manual refresh endpoint only checks the most recent **finished** run:

```ts
const lastAttemptIso = await getLastVedurstofanWarmAttemptIso()
if (lastAttemptIso && now.getTime() - Date.parse(lastAttemptIso) < COOLDOWN_MS) ...
```

But `weather_fetch_runs` is only written at the end of projection, with `finished_at` already populated. There is no row inserted when the refresh starts, and no in-progress lock/state.

Consequence:

- User A clicks `Sækja ný gögn`.
- Before the run finishes, User B clicks the same button.
- Both requests see the same old `lastAttemptIso`.
- Both can call `warmVedurstofanForecastCache()`.

This breaks the explicit requirement from v156: only one user should be able to trigger the all-stations refresh for a stale cycle, and later users should see that it is already in progress or already attempted.

This needs a real in-progress guard. Options:

- Insert a `weather_fetch_runs` row at start with `finished_at = null`, then update it on completion.
- Add metadata columns for trigger/source and expected cycle, then use a partial unique index or transaction-safe lock pattern.
- Or use a separate small lock table if that is cleaner.

This likely needs a migration, or at least a conscious schema decision. Do not paper over this with only a finished-run cooldown.

### High - Manual refresh is not recorded as manual/user-triggered

Files:

- `app/api/teskeid/weather/vedurstofan/refresh/route.ts:56-58`
- `lib/weather/providers/vedurstofan.server.ts:755-775`

Stebbi explicitly asked that user-triggered refreshes be saved with a marker showing they were not caused by the cron job.

Current implementation calls `warmVedurstofanForecastCache()` with no trigger metadata, and `writeRunRecord()` always inserts the same generic row:

```ts
source: 'vedurstofan',
fetch_type: 'forec',
started_at: startedAt,
finished_at: new Date().toISOString(),
...
```

There is no `triggered_by`, no `triggered_by_user_id`, no `trigger_reason`, no expected cycle, and no result cycle. Cron and manual refreshes are indistinguishable.

This is not just bookkeeping. The UI/product requirement depends on being able to tell the user:

- cron last ran
- manual refresh was already requested
- manual refresh is in progress
- manual refresh tried but Veðurstofan still returned old data

Recommendation:

- Stop and propose a small migration before finalizing this feature.
- Add enough metadata to `weather_fetch_runs` to distinguish cron/manual and current/in-progress/done.
- Then wire `warmVedurstofanForecastCache()` or the projector to accept run context.

### Medium - Refresh endpoint contract says `alreadyFresh`, but implementation never checks current data before warming

File: `app/api/teskeid/weather/vedurstofan/refresh/route.ts:17-29` and `45-68`

The route comment advertises:

```ts
{ status: 'alreadyFresh' } — data is already from the current cycle
```

But the handler never reads the current product/cache state to check whether data is already fresh before calling:

```ts
const warmResult = await warmVedurstofanForecastCache()
```

The UI currently only shows the button when it believes data is stale, so this may not be hit often from the normal UI. But the endpoint itself is authenticated and callable, and it can still perform unnecessary cache/projection work when data is already current.

Also, this line is effectively just `warmResult.fresh > 0`:

```ts
const dataIsFresh = warmResult.fresh > 0 || isVedurstofanCycleFresh(null, nowAfter) === false
  ? warmResult.fresh > 0
  : true
```

`isVedurstofanCycleFresh(null, nowAfter)` is always `false`, so the ternary condition is always true. This is confusing and should be replaced with an explicit check of expected cycle freshness after the run.

Recommendation:

- Before warming, read provider health for the current expected cycle.
- Return `alreadyFresh` without warming if already current.
- After warming, compute freshness from actual product/cache `atimeIso`, not only `warmResult.fresh > 0`.

### Medium - UI reports refresh as done even when the request fails

File: `app/auth-mvp/vedrid/FerdalagidClient.tsx:463-470`

`handleRefreshVedurstofan()` ignores the HTTP response and always sets state to `'done'`:

```ts
try {
  await fetch('/api/teskeid/weather/vedurstofan/refresh', { method: 'POST' })
} finally {
  setVedurstofanRefreshState('done')
}
```

So a 401, 403, 500, network failure, or `{ status: 'failed' }` will still show the success-ish label:

`Gögn voru sótt nýlega`

This can mislead Stebbi/users into thinking Teskeið actually refreshed data when it did not.

Recommendation:

- Parse the JSON response.
- Track distinct states:
  - `idle`
  - `refreshing`
  - `alreadyFresh`
  - `recentlyAttempted`
  - `fresh`
  - `stillStale`
  - `failed`
- Show failed/still-stale copy clearly.
- Ideally update `lastWarmAttemptIso` / banner state from the response or re-run the route query after success.

### Medium - Stale Veðurstofan rows are still treated as normal layer points

File: `app/api/teskeid/weather/travel/route.ts:411-446`

The travel API includes both `ok` and `stale` station results in `layerPoints`, and the UI continues to use those points for assessments when Veðurstofan is selected.

This matches Stebbi's latest preference more than Codex's earlier exclusion recommendation, but it increases the need for explicit degraded-state warnings everywhere that stale data can drive a result.

Right now the warning is a banner, but individual worst/selected/scrubber calculations do not appear to carry a strong "this result uses old Veðurstofan data" state. If stale values affect the decisive point, the result can still look like an ordinary weather assessment apart from the banner.

Recommendation:

- Add a provider/data-freshness flag to the computed selected-provider result.
- If stale Veðurstofan contributes to:
  - scrubber status
  - map colors
  - worst point
  - selected point
  - route summary

  then that surface should show a stale/degraded marker or copy.

This can be small, but it should not rely only on one top banner that users may miss after scrolling.

## Non-Blocking Notes

- `lib/weather/providers/vedurstofan.server.ts:1-12` still contains old comments about a 90-minute TTL and old phase language. The implementation has moved to cadence-based freshness, so comments should be cleaned up to avoid future confusion.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1111-1113` says the provider filter is only visible when `vedurstofanLayer` exists. That is probably fine while this is feature-gated, but if the selector is meant to become public and always show `Sannreynt | Í prófunum | Væntanlegt`, consider rendering it even when Veðurstofan is unavailable, with the Veðurstofan row disabled/statused.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:445-446` resets Veðurstofan off and met.no on after each query. That may be intentional for safety, but once this filter is public-ready, Stebbi may expect provider choices to persist during a session.
- v157 explicitly deferred the Veðurstofan station card layout. That is okay only if Stebbi agrees this prerelease is a freshness/filter step, not the final card UX requested in v156.

## What Looks Good

- Freshness helper extraction is the right direction.
- Moving away from `fetchedAt + 4h` is correct.
- User-facing travel API still reads product/cache data rather than live Veðurstofan, which protects normal route queries.
- Auth and feature access are present on the manual refresh endpoint.
- The provider selector structure is moving toward the right public model: verified/testing/upcoming.
- The map/provider work from earlier still appears to keep MET/Yr and Veðurstofan separate.

## Tests / Verification

Codex did not run tests in this review.

Claude's handoff reports:

- `npx tsc --noEmit` clean.
- `npm test` for 16 freshness tests and 98 weather-travel tests passed.

Review limitation:

- The reported tests did not catch the "ancient atime during grace" bug.
- I did not see refresh endpoint tests in the grep output. The endpoint needs tests for auth, already-fresh, in-progress/recently-attempted dedupe, still-stale, failed response, and no CRON_SECRET exposure.

## Recommended Next Step

Do not release v157 yet.

Ask Claude Code to do a focused v159 patch:

1. Fix `isVedurstofanCycleFresh()` so grace only accepts the immediately previous cycle, not arbitrary old data.
2. Add freshness tests for old data inside grace.
3. Decide and implement real manual refresh run tracking:
   - likely a small migration for `weather_fetch_runs` metadata and in-progress detection
   - if Claude Code wants to avoid migration, it must explain exactly how it will satisfy Stebbi's manual-vs-cron and anti-stampede requirements without schema support.
4. Make the refresh endpoint return `alreadyFresh` before warming when data is current.
5. Make refresh UI parse endpoint status and show failed/still-stale/recently-attempted accurately.
6. Add refresh endpoint tests.
7. Re-run targeted tests and type-check.

## Localhost Checks For Stebbi

After the v159 fixes, Stebbi should test:

1. Open the route weather flow with met.no + Veðurstofan enabled.
2. Confirm the provider selector still shows:
   - `Sannreynt`: met.no
   - `Í prófunum`: Veðurstofan
   - `Væntanlegt`: Vegagerðin disabled
3. Confirm old Veðurstofan data shows a clear old/stale state and does not look normal.
4. During the first 10 minutes after a 3-hour cycle boundary, confirm only the immediately previous Veðurstofan cycle is tolerated, not older cycles.
5. Click `Sækja ný gögn` once when stale.
6. Confirm the button shows a real in-progress state.
7. Confirm a second browser/session sees that refresh is already running or recently attempted, not a second full refresh.
8. Confirm failure/still-stale states are honest:
   - if Veðurstofan still returns old data, the UI says that
   - if the endpoint fails, the UI does not say "Gögn voru sótt nýlega"
9. Confirm met.no-only still works exactly as before.
10. Do not run production cron, Supabase migrations, deploy, commit, or push without explicit Stebbi approval.
