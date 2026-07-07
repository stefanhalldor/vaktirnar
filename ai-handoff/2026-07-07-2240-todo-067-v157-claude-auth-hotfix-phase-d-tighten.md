# TODO #67 + Auth hotfix - v157 - auth IP limit raised + Phase D tightened (prerelease)

Created: 2026-07-07 22:40
From: Claude Code
To: Stebbi and Codex
Status: Prerelease. Type-check clean. 58/58 test files pass (1855 tests). Not committed. Awaiting Stebbi permission to commit and push.

## What was done

All findings from v156 (Codex review of v155) addressed. Two work areas:

### A. Auth hotfix — IP rate-limit raised from 10 to env-configurable 250

**Files changed:**

- **`lib/auth/ip-rate-limit.ts`**
  - Removed `const MAX_REQUESTS = 10`
  - Added `DEFAULT_IP_DAILY_LIMIT = 250`, `MAX_IP_DAILY_LIMIT = 5000`
  - Exported `getIpDailyLimit()`: reads `AUTH_CODE_IP_DAILY_LIMIT` env var; defaults to 250; floors decimals; caps at 5000; falls back to default on invalid/missing/zero/negative values
  - `checkIpRateLimit` now passes `getIpDailyLimit()` as `p_max_requests` to the RPC

- **`lib/__tests__/ip-rate-limit.test.ts`**
  - Added save/restore of `AUTH_CODE_IP_DAILY_LIMIT` in beforeEach/afterEach
  - Added `getIpDailyLimit` import and 7 dedicated unit tests (default 250, valid override, decimal floor, cap at 5000, NaN, zero, negative)
  - Updated "passes p_max_requests" test from 10 → 250 (default)
  - Added "passes p_max_requests from env when set" test (400)

**No SQL changes required.** Existing RPC `check_and_increment_ip_rate_limit` already accepts `p_max_requests` as a parameter. Existing IP buckets with count 11-249 become allowed again after deploy.

### B. Phase D tightening — all v156 Medium/Low findings addressed

- **`app/api/teskeid/weather/saved-places/route.ts`**
  - POST now destructures `error` from update and insert; returns `500 { error: 'save_failed' }` on failure (previously returned 200 with `place: null`)
  - Cap count query now has `.eq('user_id', user.id)`
  - Oldest-row select now has `.eq('user_id', user.id)`
  - Cap delete now has `.eq('user_id', user.id)` before `.in()`

- **`app/auth-mvp/vedrid/FerdalagidClient.tsx`**
  - `handleDeleteSavedPlace` now captures `previous = savedPlaces` before optimistic remove; restores previous state on non-ok response or catch

- **`components/weather/PlaceSearch.tsx`**
  - Saved-place list now renders name as primary line (bold) and formattedAddress as secondary smaller line, instead of `formattedAddress ?? name`

- **`lib/__tests__/sql-saved-places.test.ts`**
  - Update policy test now extracts the update block between update_own and delete_own markers and asserts both `USING (user_id = auth.uid())` and `WITH CHECK (user_id = auth.uid())`
  - Delete policy test now extracts the delete block from delete_own to end and asserts `USING (user_id = auth.uid())`

- **`lib/__tests__/weather-saved-places-api.test.ts`**
  - Added "returns 500 when insert fails" test
  - Added "returns 500 when update fails" test
  - Updated "inserts new place" mock to handle new `.eq('user_id', ...)` chains on cap count/oldest/delete queries

## Deploy note for auth hotfix

After commit + push + Vercel deploy, the production IP rate limit rises from 10 to 250 immediately for new requests. Existing buckets in `otp_ip_rate_limit` that are already over 10 become allowed again once the code is live — no DB changes needed.

To set a custom limit, add `AUTH_CODE_IP_DAILY_LIMIT=500` (or any value) to Vercel environment variables. Omit to use the default 250.

## Test results

```
Test Files  58 passed (58)
Tests       1855 passed | 27 skipped | 8 todo (1890)
```

Type-check: clean.

## Uncommitted changes

```
M  TODO.md
M  app/api/teskeid/weather/saved-places/route.ts
M  app/auth-mvp/vedrid/FerdalagidClient.tsx
M  components/weather/PlaceSearch.tsx
M  components/weather/RouteSelectionStep.tsx
M  lib/__tests__/ip-rate-limit.test.ts
M  lib/__tests__/sql-saved-places.test.ts
M  lib/__tests__/weather-saved-places-api.test.ts
M  lib/auth/ip-rate-limit.ts
M  messages/en.json
M  messages/is.json
?? app/api/teskeid/weather/saved-places/
?? lib/__tests__/sql-saved-places.test.ts        (new)
?? lib/__tests__/weather-saved-places-api.test.ts (new)
?? lib/weather/savedPlaces.ts
?? sql/69_weather_saved_places.sql
```

## Codex prerelease checklist

- [ ] Type-check passes
- [ ] All tests pass
- [ ] `getIpDailyLimit()` exported and unit-tested (7 tests)
- [ ] `checkIpRateLimit` passes `getIpDailyLimit()` to RPC, not hardcoded 10
- [ ] No SQL migration required for auth hotfix
- [ ] POST returns 500 on insert or update failure
- [ ] Cap queries all scoped with `.eq('user_id', user.id)` (count, oldest-row select, delete)
- [ ] Delete rollback restores previous state on failure
- [ ] SQL tests verify `USING` and `WITH CHECK` clauses in scoped policy blocks
- [ ] Saved-place label shows name primary, formattedAddress secondary
