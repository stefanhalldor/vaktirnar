# TODO 086 / v215 - Claude pre-release handoff - v214 blockers resolved

## Status

All blockers from v214 Codex review resolved. Build green, all tests pass. Ready to push and deploy.

## What was done

### lib/__tests__/vegaderdin-history.test.ts

Fixed test mock chain and assertions to match the v210 "always-show-history" implementation change.

Root cause: `makeHistoryChain` built a mock chain with `.gte('last_fetched_at', cutoff)` between
`.select()` and `.order()`. The implementation now queries directly `.select().order().limit().maybeSingle()`
with no age cutoff. The mock chain mismatched, so the mock returned undefined at the `.order()` step,
causing all three tests in the history-fallback describe block to return `unavailable` instead of `stale`.

Changes:
- Removed `gteCutoffFn` from `HistoryChain` type
- `makeHistoryChain`: `selectNewestFn` now returns `{ order: orderFn }` directly (no `.gte` step)
- Test 1 (`queries history by last_fetched_at...`): removed `gteCutoffFn` assertion, kept `orderFn`
  and `eqBatchFn` assertions
- Added new test: `returns history_fallback even for very old history batches (no age cutoff)` — explicitly
  covers the product decision that Vegagerðin history is always returned regardless of batch age

## Commits

- `07f311d` — fix: middleware authenticated /vedrid canonicalization
- `b88c5c6` — test: update vegagerdin-history tests for no-age-cutoff history fallback

## Test results

```
Test Files  4 passed (4)
Tests  126 passed (126)
```

Type-check: clean. Build: clean.

## v214 findings addressed

- [x] High — failing vegagerdin-history tests: fixed
- [x] High — "always show history" product decision coverage: new test added
- [ ] Medium — sessionStorage threshold flow: no automated tests added (manual check required per v214)
- [ ] Low — duplicate Phase 2 comment in routeMemory.server.ts: not release-blocking, not addressed

## Pre-release checks for Stebbi

1. `git push`
2. Monitor Vercel build log.
3. Localhost checks from v214:

### Authenticated shell
- Log in, navigate to `/vedrid` → expect redirect to `/auth-mvp/vedrid` with authenticated hamburger
- Navigate to `/vedrid?saveDefaults=10%2C13` → expect redirect preserving query, values apply and save
- Navigate to `/vedrid/ferdalagid` → expect redirect to `/auth-mvp/vedrid/ferdalagid`

### Public shell
- Log out, open `/vedrid` → public weather loads, no redirect

### Threshold save (sessionStorage flow)
- Logged out on `/vedrid`, set wind to `10` and `13`, click save
- Complete login (including profile setup if new user)
- Expect: final weather page shows `10` and `13`, save completes, refresh keeps values

### Route/weather regressions
- Dalvik -> Gardabaer with multiple variants: no blank map
- Reykjavik -> Egilsstadir: no blank map, route pills work
- Safnpuls drawer visible above map when route selected
- Vegagerðin shows stale/history data (not gray) when cache expired
