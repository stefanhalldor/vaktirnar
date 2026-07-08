# TODO-069 v004 - Claude handoff - Codex v003 review findings addressed

Created: 2026-07-08 16:10
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: All Codex v003 findings addressed. SQL migration NOT run. Awaiting Stebbi localhost review and explicit commit/push approval.

## Findings addressed

### Medium 1 — Route-pair hash not stored when secret is missing

`lib/teskeid/usage.server.ts`: `routePairFingerprint` now returns `string | null`.
- Returns `null` when `USAGE_EVENT_SECRET` is absent or empty.
- Returns HMAC-SHA256 hex string when secret is set.

Both weather endpoints now compute the hash once:
```ts
const routePairHash = routePairFingerprint(origin, destination)
const hashMeta = routePairHash !== null ? { routePairHash } : {}
```
And spread `...hashMeta` into every usage event metadata object. When secret is missing, `routePairHash` is never written to the database. Total event counts still record normally; distinct route pair counts will always be 0 until the secret is configured (expected and acceptable).

User-facing Veðrið behaviour is unchanged — weather requests never fail because the usage secret is absent.

### Medium 2 — Migration-missing state now shows correctly

`app/api/admin/teskeid-usage/route.ts`: detects `error.code === '42P01'` or message containing "does not exist" and returns HTTP 200 with:
```json
{ "migration_missing": true, "summary": {...zeros...}, "features": [], "weather": {...}, "events_over_time": [] }
```
This passes the admin page's `'summary' in data` check, so `usage` state is populated.

`app/(admin)/admin/page.tsx`:
- `TeskeidUsageData` type now includes `migration_missing?: boolean`.
- `TeskeidUsageSection` checks `usage.migration_missing` first and shows:
  `Migration 71 hefur ekki verið keyrð. Keyra þarf sql/71_teskeid_usage_events.sql í Supabase.`
- Empty state copy (migration run but no events yet) changed to: `Engin virknigögn á þessu tímabili.`

True unexpected DB errors (e.g. network failure) still return 500 and remain distinguishable in logs.

### Medium 3 — SQL migration wrapped in transaction

`sql/71_teskeid_usage_events.sql` now begins with `BEGIN;` and ends with `COMMIT;`. If any statement fails, the entire migration rolls back cleanly.

### Low 1 — Static SQL test added

New file: `lib/__tests__/sql-71-teskeid-usage-events.test.ts`

Checks (no SQL execution, pure string):
- Table created
- RLS enabled
- REVOKE ALL from anon/authenticated
- No GRANT to anon or authenticated
- GRANT SELECT, INSERT to service_role only
- `jsonb_typeof(metadata) = 'object'` constraint present
- Transaction wrapper (`BEGIN;` / `COMMIT;`) present

### Low 2 — Copy fixes

`app/(admin)/admin/page.tsx`:
- "Distinct leiðapör" → "Ólík leiðapör" (2 occurrences: summary card label and Veðrið detail card)

## Files changed

- `lib/teskeid/usage.server.ts` — `routePairFingerprint` returns `string | null`
- `app/api/teskeid/weather/travel/routes/route.ts` — hash computed once, spread conditionally
- `app/api/teskeid/weather/travel/route.ts` — hash computed once, spread conditionally
- `app/api/admin/teskeid-usage/route.ts` — migration_missing detection
- `app/(admin)/admin/page.tsx` — type, migration_missing branch, copy fixes
- `sql/71_teskeid_usage_events.sql` — BEGIN/COMMIT transaction wrapper

## Test files changed / added

- `lib/__tests__/teskeid-usage.test.ts` — `routePairFingerprint` tests now set `process.env.USAGE_EVENT_SECRET`; added `afterEach` to clean up; added test "returns null when secret not set"
- `lib/__tests__/teskeid-usage-api.test.ts` — added 2 tests for migration_missing (42P01 code, message-based detection); renamed existing 500 test to be clear it's for non-missing-table errors
- `lib/__tests__/weather-routes-api.test.ts` — added test "omits routePairHash from metadata when routePairFingerprint returns null"
- `lib/__tests__/sql-71-teskeid-usage-events.test.ts` — new file, 8 static SQL checks

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 62 files, 1952 passed, 27 skipped, 8 todo — all green
```

## What is still NOT done (by design)

- `sql/71_teskeid_usage_events.sql` not run — Stebbi must run explicitly.
- `USAGE_EVENT_SECRET` env var not set in Vercel — Stebbi must add it; until then `routePairHash` is never written.
- No commit or push — requires explicit approval.

## Open items for Stebbi

1. Run `sql/71_teskeid_usage_events.sql` in Supabase when ready (now wrapped in BEGIN/COMMIT).
2. Add `USAGE_EVENT_SECRET` to Vercel env vars (any random 32+ char string). Until set, distinct route pair counts will always be 0 — everything else works normally.
3. After deploy, check `/admin` → Tölfræði tab.

## Localhost checks for Stebbi

1. Open `/admin` → Tölfræði with migration 71 NOT run in local Supabase.
2. Expected: `Virkni per Teskeið` section shows calm migration note:
   "Migration 71 hefur ekki verið keyrð. Keyra þarf sql/71_teskeid_usage_events.sql í Supabase."
   (Not a silent disappearance.)
3. Run migration 71 in local Supabase.
4. With `USAGE_EVENT_SECRET` unset: calculate a Veðrið route.
5. Expected: route calculation count increases; distinct route pairs stays 0.
6. Expected: Veðrið works normally regardless of secret absence.
7. Set `USAGE_EVENT_SECRET` locally (any string), calculate the same route pair twice.
8. Expected: route calculations = 2; distinct route pairs = 1 (same pair).
9. Calculate a different route pair.
10. Expected: distinct route pairs = 2.
11. Complete a final Ferðaveður result.
12. Expected: Niðurstöður count increases, Route → niðurstaða % updates.
13. Admin UI: verify "Ólík leiðapör" label (was "Distinct leiðapör").
14. Admin UI: with migration run but no events (e.g. period=5min with no recent activity): Expected "Engin virknigögn á þessu tímabili."
15. Non-admin / signed-out: Expected 401/403.

No Supabase migration, production data, auth config, billing, secrets, commit, push or deploy without separate explicit approval from Stebbi.
