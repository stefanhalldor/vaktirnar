# TODO 086 / v214 - Codex review - v211 + v213 pre-release state

## Status

Not release-ready yet.

v213 fixes the authenticated `/vedrid` hamburger/menu-shell bug cleanly, but the current branch still has failing Vegagerdin history tests from the v210/v212 "always-show-history" change. Those need to be fixed before push/deploy.

## Reviewed inputs

- `ai-handoff/2026-07-19-1252-todo-086-v211-claude-v210-session-handoff.md`
- `ai-handoff/2026-07-19-1257-todo-086-v213-claude-v212-done-prerelease.md`
- Commit `07f311d`:
  - `middleware.ts`
  - `lib/__tests__/middleware.test.ts`
- Current HEAD history:
  - `07f311d` authenticated `/vedrid` canonicalization
  - `e315d52` blank map with multi-variant routes + Vegagerdin always-show-history
  - `2eb9c75` sessionStorage backup for threshold save before login redirect
  - `6d8e9a8` profile FK guard for threshold save + sql/87 route-memory fallback

## Findings

### High - Current branch still has failing tests

Command:

```bash
npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/vegagerdin-history.test.ts lib/__tests__/warm-vegagerdin-cron.test.ts
```

Result: exit 1.

Failing tests:

- `lib/__tests__/vegagerdin-history.test.ts`
  - `queries history by last_fetched_at (not measured_at) for newest batch anchor`
  - `returns history_fallback when cache is missing and history has a recent batch`
  - `uses exact last_fetched_at match so older cron batches are not mixed in`

The first failure is expected test drift from removing the `.gte('last_fetched_at', cutoffIso)` call, but the second/third failures show the mocks no longer match the implementation chain and now produce `status: 'unavailable'` during tests.

Do not ship with this test suite red. Either:

1. Keep the no-age-cutoff product decision and update `vegagerdin-history.test.ts` to match the new query chain and add explicit "ancient history still returns stale/history_fallback" coverage, or
2. Reintroduce a bounded max age and adjust product behavior accordingly.

### High - "Always show history" needs explicit product safety decision

`lib/weather/providers/vegagerdinCurrent.server.ts` now returns the newest history batch regardless of age.

That prevents gray Vegagerdin after cron misses, but it also means `/vedrid` can display colored "Nuna" markers based on very old measurements if cron/upstream dies for hours or days. `measurementFreshness` exists, but marker color still classifies wind from old observations.

Before release, Stebbi should explicitly approve one of these product rules:

- "Show newest history forever, but make stale/oldness unmistakable in the UI", or
- "Use a longer but finite max age, e.g. 24-72 hours, then show unavailable/empty", or
- "Show stale history on station/pulse context but not as ordinary current markers after a hard limit."

Codex leans toward a finite safety cap unless the UI clearly says the data is old in the selector and map/detail context.

### Medium - v211 sessionStorage threshold flow still lacks automated coverage

v211 stores pending thresholds in `sessionStorage` before redirecting logged-out users to login.

The flow is plausible:

- public `/vedrid` stores `teskeid_pending_wind_thresholds`
- login keeps `next=/vedrid?saveDefaults=...`
- v213 redirects authenticated `/vedrid?saveDefaults=...` to `/auth-mvp/vedrid?saveDefaults=...`
- `WeatherOverviewClient` consumes `saveDefaults` or sessionStorage and saves preferences

But there are no automated tests for the sessionStorage branch. Manual localhost checks are required.

Specific edge case to verify: new user without display name goes through `/auth-mvp/minn-profill?next=...`; after profile save, `resolveSafeLoginNext(next)` should return `/vedrid?saveDefaults=...`, then middleware should canonicalize to `/auth-mvp/vedrid?saveDefaults=...`.

### Low - v213 middleware fix itself looks good

`middleware.ts` now exact-path redirects authenticated users:

- `/vedrid` -> `/auth-mvp/vedrid`
- `/vedrid/ferdalagid` -> `/auth-mvp/vedrid/ferdalagid`

Query string is preserved by `request.nextUrl.clone()`.

The fix is exact-path only, so it avoids accidentally redirecting station/pulse subpaths whose authenticated equivalents may differ.

Middleware tests pass.

### Low - Cleanup still pending in route memory comments

`lib/iceland-routes/routeMemory.server.ts` has a duplicated Phase 2 comment around the dedupe logic. Not release-blocking, but easy cleanup before final polish.

## Commands run by Codex

```bash
npm run type-check
```

Result: exit 0.

```bash
npm run test:run -- lib/__tests__/middleware.test.ts
```

Result: exit 0, 54 tests passed.

```bash
npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/vegagerdin-history.test.ts lib/__tests__/warm-vegagerdin-cron.test.ts
```

Result: exit 1, 3 failing tests in `vegagerdin-history.test.ts`.

No build was run after the failing targeted tests. No code, SQL, migration, production, commit, push, or deploy action was performed by Codex.

## Recommended next step for Claude Code

1. Fix/update `lib/__tests__/vegagerdin-history.test.ts` for the current history fallback behavior.
2. Add explicit coverage for whichever product rule Stebbi chooses on max age.
3. Re-run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/vegagerdin-history.test.ts lib/__tests__/warm-vegagerdin-cron.test.ts
```

4. If green, run full build:

```bash
npm run build
```

5. Produce a new pre-release handoff.

Do not push or deploy until those are green and Stebbi explicitly approves push/deploy.

## Route intelligence check

- Route-related change affected: `/vedrid` route-memory variant filtering from `e315d52`.
- v213 itself is auth/canonical-shell only and does not change route intelligence.
- No new canonical route family, control point, route caution, or provider station matching rule is required by v213.
- The route-memory filtering behavior still needs Stebbi's localhost checks for multi-variant routes:
  - Dalvik -> Gardabaer
  - Reykjavik -> Egilsstadir
  - Reykjavik -> Siglufjordur
- The solution remains provider-neutral at the route-memory level, but active source/time switching is provider-aware in the UI, which is appropriate.

## Localhost checks for Stebbi

After Claude Code fixes the red Vegagerdin history tests and before release:

### Authenticated shell

1. Log in.
2. Manually open `/vedrid`.
3. Expected: redirect to `/auth-mvp/vedrid`.
4. Open hamburger.
5. Expected: authenticated menu, profile/sign-out visible, no public login-only state.
6. Manually open `/vedrid?saveDefaults=10%2C13`.
7. Expected: redirect to `/auth-mvp/vedrid?saveDefaults=10%2C13`, values apply and save.
8. Manually open `/vedrid/ferdalagid`.
9. Expected: redirect to `/auth-mvp/vedrid/ferdalagid`.

### Public shell

1. Log out.
2. Open `/vedrid`.
3. Expected: public weather page loads, public hamburger remains.
4. Open `/vedrid/ferdalagid` if public trip weather is still intended to be accessible.
5. Expected: no accidental authenticated redirect.

### Threshold save

1. Logged out on `/vedrid`, set wind thresholds to `10` and `13`.
2. Click `Vista sem sjálfgefin vindmörk`.
3. Complete login.
4. If profile setup appears, save profile and continue.
5. Expected: final weather page shows `10` and `13`, save completes, refresh keeps values.
6. Repeat while already logged in on `/auth-mvp/vedrid`: set different values, save, refresh, confirm persistence.

### Route/weather regressions

1. Dalvik -> Gardabaer with multiple variants: no blank map.
2. Reykjavik -> Egilsstadir with variants: no blank map; route pills work.
3. Reykjavik -> Siglufjordur one-route case still works.
4. Safnpuls drawer remains above the map and route-filtered.
5. Vegagerdin current/history behavior is visibly fresh/aging/stale as intended by Stebbi's product decision.

Do not test production SQL, migrations, cron changes, or user-data cleanup casually as part of these localhost checks.
