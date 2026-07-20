# 2026-07-19 13:00 - TODO 086 v212 - Claude done, pre-release

Created: 2026-07-19 13:00
Timezone: Atlantic/Reykjavik

## What was done (SHA e315d52)

Three fixes in one commit from this session.

---

### Fix 1: Blank map with multiple route variants (v210)

**`lib/iceland-routes/routeMemory.server.ts`**

Phase 3 added to `dedupeRouteVariants`:
- If any surviving variant has at least one station ID (vedurstofan or vegagerdin),
  drop all variants with zero total station IDs.
- This prevents selectable route pills that produce a completely blank map.
- If ALL variants have zero stations (rare degenerate case), Phase 3 is a no-op —
  all are kept so the caller can show an empty state rather than fabricating station IDs.

**`components/weather/WeatherOverviewClient.tsx`**

New route-aware auto-mode effect added after the existing global auto-fallback:
- Fires whenever the route filter changes (route pair, variant, provider data, active mode).
- If `activeMode === 'now'` and the route filter produces 0 Vegagerðin stations but
  there are forecast slots: automatically switches to the first forecast slot.
- If `activeMode` is a forecast timestamp and that slot has 0 route-visible Vedurstofan
  stations but Vegagerðin has route-visible stations: switches back to `'now'`.
- Intentionally ignores `userHasSelectedMode`: when the route changes, the valid marker
  universe changes and a blank map is wrong regardless of prior user selection.
- Only fires after both providers have finished loading (guarded by `vegagerdinLoading`
  and `data` checks) to avoid premature switching on slow loads.

---

### Fix 2: Vegagerðin always shows history (never gray)

**`lib/weather/providers/vegagerdinCurrent.server.ts`**

`readVegagerdinCurrentFromHistory` previously rejected history rows older than 24 hours
(`HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000`). If the cron was delayed or the cache
was expired, the endpoint returned `status: 'unavailable'` and the map went gray.

Fix: removed the 24-hour age cutoff. Now queries for the absolute newest history batch
regardless of age. `measurementFreshness` on the payload (fresh/aging/stale) still
communicates data age to the UI so the client can show appropriate staleness indicators.

Result: Vegagerðin can only be gray/unavailable if the history table is completely empty
(first deploy before any cron run) or if there is a database error.

---

### Tests

`lib/__tests__/weather-route-memory-migration.test.ts`

- Updated `'keeps a non-curated variant with zero stations even when curated variants exist'`
  → now asserts Phase 3 drops the empty variant (renamed to describe actual behavior).
- Added `'keeps all variants when every variant has zero stations (Phase 3 no-op)'`
- Added `'drops only the zero-station variant when mixed with non-empty sibling (Phase 3)'`
- Total: 82 tests pass (was 80).

---

## Commands run

- `npm run type-check` — exit 0, clean
- `npm run test:run -- (3 targeted files)` — exit 0, 82 tests pass
- `git push` — pushed as e315d52

---

## Localhost checks for Stebbi

### Blank map fix

1. Open `/vedrid`, select `Dalvik` as `Frá` and `Gardabaer` as `Til`.
2. Confirm route pills show. If `Vegagerðin` has no route stations, the selector
   should automatically switch to the first Vedurstofan forecast slot.
3. Click `Allar leiðir` — confirm the map shows station markers, not blank.
4. Click each route pill — confirm no pill produces a completely blank map.
5. Repeat with `Reykjavík → Egilsstaðir` (multi-variant known case).

### Vegagerðin always-show-history

1. While Vegagerðin cache is expired (e.g. just after clearing it or right before cron):
   - Confirm map still shows Vegagerðin stations with a staleness indicator.
   - Stations should never disappear purely because of cache age.
2. Confirm `measurementFreshness` indicator (fresh/aging/stale) still appears correctly
   when the data is old.

### Regression checks

- One-route pair that worked before (Reykjavík → Siglufjörður).
- Threshold save as public user (v209 fix) — confirm values persist after login.
- Safnpuls drawer remains visible above the map.
- Status filter pills filter route markers correctly.

---

## SQL gates (unchanged from v209)

| SQL | Status |
|-----|--------|
| sql/82 | Run before threshold saving works |
| sql/83 | Run (history rows pending cron) |
| sql/86 | Run |
| sql/87 | Must run before `Varasöm leið` pills appear |
| sql/85 | Do NOT run |

No new SQL required for this fix set.

Do not commit, push, or deploy additional changes without explicit approval.
