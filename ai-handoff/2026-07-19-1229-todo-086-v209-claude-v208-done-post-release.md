# 2026-07-19 12:29 - TODO 086 v209 - Claude done, post-release hotfixes

Created: 2026-07-19 12:29
Timezone: Atlantic/Reykjavik

## What was done

Two production hotfixes from v208 Codex report. Pushed as SHA 6d8e9a8.

---

### Fix A: Threshold save 500 — profile FK guard

**File:** `app/api/teskeid/weather/preferences/thresholds/route.ts`

Root cause: `weather_user_preferences.user_id` has a FK to `public.profiles(id)`.
Auth-MVP users created via `createUserSession()` may have an `auth.users` row but
no corresponding `public.profiles` row (the trigger did not fire, or profile was
never explicitly saved). The upsert into `weather_user_preferences` then fails with
a FK violation → 500.

Fix: Before upserting preferences, upsert a minimal `profiles` row:
```ts
admin.from('profiles').upsert({ id: user.id, display_name: '' }, { onConflict: 'id', ignoreDuplicates: true })
```
`ignoreDuplicates: true` means this is a no-op for users who already have a profile.
If the profile upsert itself fails, the endpoint returns 500 with the profile error
logged, rather than proceeding to a guaranteed FK-failure downstream.

---

### Fix B: Route-memory lookup fails silently when sql/87 not applied

**File:** `lib/iceland-routes/routeMemory.server.ts`

Root cause: `lookupRouteMemory()` SELECT includes `route_caution_ids`. If sql/87
has not been applied, Postgres returns error code `42703` (undefined_column). The
outer try/catch caught this and returned `status: 'miss'`, so the route picker showed
`Frá`/`Til` labels (from a separate endpoint) but the map never filtered.

Fix: After the primary SELECT, check `routeErr?.code === '42703'`. If so, log a
warning and retry the SELECT without `route_caution_ids`, then continue normally
with `routeCautionIds: []` for all variants (the downstream mapping already handles
missing `route_caution_ids` gracefully via `Array.isArray` guard).

This is a temporary fallback. Once sql/87 is applied in production, the primary
SELECT succeeds and the fallback branch is never reached.

---

## Commands run

- `npm run type-check` — exit 0, clean
- `npm run test:run -- (3 targeted files)` — exit 0, 80 tests pass
- `git push` — pushed successfully as 6d8e9a8

---

## Localhost checks for Stebbi

### Threshold save (Fix A)

1. Logged-out `/vedrid`: set thresholds to `10` / `13`, click save, complete login.
2. After login, confirm `/auth-mvp/vedrid` shows `10` and `13`.
3. Refresh — confirm values persist.
4. Network tab: `/api/teskeid/weather/preferences/thresholds` PUT returns 200, not 500.

### Route filter (Fix B — before sql/87 is applied)

1. Select `Reykjavík` → `Siglufjörður` in route picker.
2. Network tab: `/api/teskeid/weather/route-memory/lookup` returns HTTP 200 with
   `status: "resolved"` and non-empty `vedurstofanStationIds` or `vegagerdinStationIds`.
3. Map station count drops from all-Iceland to route station subset.
4. Server logs show `[route-memory] route_caution_ids column missing, falling back`
   if sql/87 has not been run yet — this confirms the fallback is working, not silently failing.

### After sql/87 is applied

- The fallback log message disappears.
- Route pills may show `Varasöm leið` after a new `/ferdalagid` calculation writes
  caution IDs for that route.

---

## Remaining items

- sql/82: must be applied for threshold saving to work at all (table must exist).
- sql/87: should be applied soon to enable caution IDs and remove fallback code path.
- sql/83 history rows: still pending one non-skipped Vegagerðin cron run.
- Public-login threshold persistence (sessionStorage approach): not implemented in
  this hotfix. The fix here only covers the server-side 500. If the `saveDefaults`
  URL param is lost during auth redirect, the values still won't persist for public users.
  This is a separate follow-up item if needed.
