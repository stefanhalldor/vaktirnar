# Codex review: v199 prerelease - cron/run-state, freshness UI, history confirmation

Created: 2026-07-15 08:21
Timezone: Atlantic/Reykjavik

## Findings

### Blocker - Manual refresh can still expose the refresh button immediately after a still-stale warm

Files:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:480-506`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:983-987`

The backend cooldown work is mostly correct, but the client path after a completed manual refresh still has a hole.

When `/api/teskeid/weather/vedurstofan/refresh` returns `stillStale`, `handleRefreshVedurstofan()` re-fetches `/api/teskeid/weather/travel` and then sets:

```ts
setVedurstofanRefreshState(
  isVedurstofanCycleFresh(newAtimeIso, new Date()) ? 'fresh' : 'stillStale'
)
```

But `showVedurstofanRefreshButton` hides the button only for:

```ts
refreshing | fresh | running | recentlyAttempted
```

It does **not** hide it for `stillStale`. So after a manual warm finishes and Veðurstofan still returns the old cycle, the UI can show "Sækja ný gögn" immediately again until the 90s freshness poll eventually syncs `recentlyAttempted` from the server. This is essentially the exact UX bug Stebbi reported earlier.

Recommended fix:

- After any completed warm where the displayed layer is still stale, the UI should enter a cooldown state, not plain `stillStale`.
- Best shape: refresh endpoint returns `lastAttemptIso` or `nextManualRefreshIso` for completed `stillStale` attempts, and the client sets:
  - `vedurstofanRefreshState = 'recentlyAttempted'`
  - `nextManualRefreshIso = returned value`
- Keep a separate stale-result message if needed, e.g. "Við reyndum að sækja ný gögn en Veðurstofan skilaði enn eldri spá", but do not use `stillStale` as a state that allows immediate retry.
- Also apply this when the travel re-fetch fails after a completed warm: the warm attempt still happened, so the retry button should not be immediately available.

### Low - Unused `meta` variables left in Veðurstofan card component

File:
- `components/weather/VedurstofanPointCard.tsx:134`
- `components/weather/VedurstofanPointCard.tsx:202`

Both `VedurstofanJourneySummary` and `VedurstofanPointCard` still assign:

```ts
const meta = WIND_STATUS_META[status]
```

but `meta` is no longer used after moving display to `WindStatusBadge`. This is not a behavioral bug, and `tsconfig` does not have `noUnusedLocals`, but it is stale code and should be removed with the now-unused `WIND_STATUS_META` import if nothing else uses it in the file.

### Process - Claude handoff still omitted required `Localhost checks for Stebbi`

File:
- `ai-handoff/2026-07-15-0820-todo-086-v199-claude-prerelease.md`

Per `AGENTS.md`, all implementation handoff/review docs must include `Localhost checks for Stebbi`. The v199 handoff lists code/test status, but does not include that required section. I added checks below in this Codex review so Stebbi can still test the right flows.

## What Looks Good

- SQL77 should **not** be run again. Stebbi's screenshot confirms:

```sql
select to_regclass('public.vedurstofan_forecasts_history')
```

returns `vedurstofan_forecasts_history`.

- Cron route now checks run-state before warming:
  - `alreadyFresh`
  - `running`
  - `recentlyAttempted`
  - only warms when `available`

- Cron now inserts a `running` row before calling the warmer and passes context through to `warmVedurstofanForecastCache`.

- SQL75 has a partial unique index:
  - `weather_fetch_runs_one_running_vedurstofan_forec_idx`
  - prevents duplicate `running` rows for same `source + fetch_type + expected_atime`.

- Manual refresh endpoint uses the same run-state function as cron and requires `weather-provider-vedurstofan` feature access.

- `vercel.json` now has:

```json
"schedule": "*/10 * * * *"
```

for `/api/cron/warm-vedurstofan`.

- `providerMetnoHelperText` is now "Yr spágögnin", matching Stebbi's requested wording.

- `WindStatusBadge` chip now uses dot + icon + label, which is the right shared visual direction for met.no and Veðurstofan cards.

- History table integration is present:
  - projection writes `vedurstofan_forecasts_history`
  - product reader merges history rows for same station/current atime
  - travel route passes an ETA window so prev/used/next rows can include passed slots.

## Recommended Next Step for Claude Code

Do not release v199 as-is. Make one small targeted fix first:

1. Fix the immediate retry hole after manual `stillStale`.
2. Remove unused `meta` variables/import from `VedurstofanPointCard.tsx`.
3. Re-run only focused tests plus typecheck.
4. Return a new prerelease handoff with exact commands, exit codes, and `Localhost checks for Stebbi`.

Suggested implementation detail for item 1:

- Extend manual refresh response for completed warms with a server-owned cooldown timestamp.
- In the client, after a completed warm that still leaves the route layer stale, show stale/cooldown messaging and hide "Sækja ný gögn" until the cooldown expires.
- Do not rely on the 90s polling loop to correct the state after the user has just clicked.

## Localhost checks for Stebbi

Do **not** run SQL77 again. It is already present.

After Claude fixes the blocker above:

1. Open `/auth-mvp/vedrid` on localhost as a user with `weather-provider-vedurstofan` access.
2. Choose a route where Veðurstofan is visible.
3. Turn on Veðurstofan and turn off met.no.
4. If the banner says Veðurstofugögn are old, click `Sækja ný gögn`.
5. If Veðurstofan still returns the older cycle, expected result:
   - stale message remains honest,
   - button is hidden,
   - a cooldown/retry-after message is shown,
   - button does not reappear until at least 10 minutes after the attempt.
6. After cooldown expires, either polling or user interaction should make the retry possible again without a full page reload.
7. Verify the card labels:
   - met.no card chip and Veðurstofan card chip both use the same shared style: dot + status icon + status label.
8. Verify history behavior:
   - for a Veðurstofan station where ETA sits after a passed 3-hour slot, the card should show previous / used / next rows when history exists.
9. Verify provider filter wording:
   - met.no tile helper says `Yr spágögnin`,
   - Veðurstofan tile is under `Í prófunum` without extra helper text,
   - Vegagerðin is disabled/upcoming and links to `umferdin.is`.
10. After deploy, verify in Vercel that `/api/cron/warm-vedurstofan` schedule shows every 10 minutes, not every 6 hours.

Safety notes:

- Do not casually hammer the manual refresh button on production. It warms all Veðurstofan stations.
- Do not run migrations again unless the next handoff explicitly says a new SQL file is required.
- Any Vercel env/cron/deploy change still needs explicit Stebbi approval.

## Commands Run by Codex

Read-only inspection only:

- `Get-Content -Encoding UTF8 'app/api/cron/warm-vedurstofan/route.ts'`
- `Get-Content -Encoding UTF8 'app/api/teskeid/weather/vedurstofan/refresh/route.ts'`
- `Get-Content -Encoding UTF8 'app/api/teskeid/weather/vedurstofan/freshness/route.ts'`
- `Get-Content -Encoding UTF8 'components/weather/WindStatusBadge.tsx'`
- `Get-Content -Encoding UTF8 'components/weather/VedurstofanPointCard.tsx'`
- `Get-Content -Encoding UTF8 'lib/weather/vedurstofanFreshness.ts'`
- `Get-Content -Encoding UTF8 'vercel.json'`
- targeted `Select-String`/`rg` searches for run-state, history, cooldown, and labels
- `git diff --stat`
- `git diff --name-only`

No tests were run by Codex.
No SQL was run by Codex.
No app files were changed by Codex, except this review document.
