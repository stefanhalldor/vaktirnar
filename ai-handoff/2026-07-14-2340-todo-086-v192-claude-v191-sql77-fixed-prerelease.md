# 2026-07-14-2350 | todo-086 | v192 | claude | v191 sql77 fixed — prerelease

## Status
Codex v191 finding fixed. SQL77 is now ready for Stebbi to run.
Tests: 199/199 passing. TypeScript: clean.

---

## What changed

### sql/77_vedurstofan_forecasts_history.sql
Fixed per Codex v191 finding:
- Removed `CREATE OR REPLACE FUNCTION public.set_updated_at()` (generic name, risk of clobbering production)
- Replaced with `EXECUTE FUNCTION public.teskeid_set_updated_at()` (established repo pattern)
- Added dependency comments in header: sql/04 and sql/74

No structural changes to table, indexes, RLS, or grants.

### lib/__tests__/sql-migration.test.ts
No changes needed. The sql77 test block asserts on the trigger name (`vedurstofan_forecasts_history_set_updated_at`), not the function name, so it still passes cleanly.

---

## What Stebbi needs to do

1. Confirm sql/74 (vedurstofan_stations) and sql/75, sql/76 are already run in Supabase
2. Run `sql/77_vedurstofan_forecasts_history.sql` in Supabase SQL editor
3. Do localhost testing per `2026-07-14-2215-todo-086-v184-claude-localhost-todo-vedrid.md`
4. After the next Veðurstofan cron cycle fires (~1h), verify history rows accumulate and prev row appears in the detail card
5. Test a route with both providers active and verify travel-order sorting

---

## Full scope of this session (v190 + v192)

All changes from the v189 implementation + this fix:

| File | Change |
|---|---|
| `sql/77_vedurstofan_forecasts_history.sql` | New migration (trigger function fixed in v192) |
| `lib/__tests__/sql-migration.test.ts` | +11 tests for sql77 |
| `lib/weather/providers/vedurstofan.server.ts` | Projector writes to history; reader merges history within ETA window |
| `app/api/teskeid/weather/travel/route.ts` | Computes ETA window, passes to reader |
| `app/auth-mvp/vedrid/FerdalagidClient.tsx` | Mixed provider sorted combined list; TypeScript fixed |
| `messages/is.json` | +`allProviderPointsSectionLabel` |
| `messages/en.json` | +`allProviderPointsSectionLabel` |
