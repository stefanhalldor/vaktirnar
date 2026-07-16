# v233 Claude handoff: WEATHER_ENABLED=Authenticated full session summary

Created: 2026-07-15 17:15
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Session span: v226–v233

## Status

All work done. 84 test files, 2561 tests pass. TypeCheck clean.
Nothing staged, committed, pushed, or deployed.

## What triggered this session

Stebbi's localhost test found that `WEATHER_ENABLED=Authenticated` blocked ALL signed-in users without a private `vedrid` feature row. The intended contract is: `Authenticated` means "all signed-in users get base MET/Yr weather" — `vedrid` is not required for base access.

A second localhost bug was found during review: unauthenticated users seeing the Veðrið card and clicking it were bounced back to `/` instead of sent to `/innskraning`.

---

## Changes: implementation

### `lib/weather/weatherBaseAccess.server.ts` (new file, untracked)

`resolveWeatherBaseAccess`:
- Added `|| mode === 'authenticated'` to allow signed-in users in `Authenticated` mode:
  ```ts
  if (hasVedrid || mode === 'authenticated') {
    return { mode: 'authenticated', userId: user.id, actor: 'authenticated' }
  }
  ```

`resolveAuthenticatedWeatherShellAccess`:
- Added `authenticated` to the allow condition:
  ```ts
  if (mode === 'all' || mode === 'authenticated')
    return { mode: 'authenticated-public', userId: user.id, hasPrivateVedrid: false }
  ```

JSDoc comments updated to reflect the correct contract for both functions.

### `lib/weather/weatherEnabledMode.server.ts` (new file, untracked)

Standalone helper to avoid circular import between `guard.ts` and `weatherBaseAccess.server.ts`:
- `WEATHER_ENABLED=All` → `'all'`
- `WEATHER_ENABLED=Authenticated` → `'authenticated'`
- `WEATHER_ENABLED=true` + `WEATHER_PUBLIC_ENABLED=true` → `'all'` (legacy fallback)
- `WEATHER_ENABLED=true` alone → `'authenticated'` (legacy fallback)
- anything else → `'off'`

### `app/api/teskeid/weather/saved-places/route.ts`

`authGuard` updated:
```ts
if (hasVedrid || weatherMode === 'all' || weatherMode === 'authenticated') return { supabase, user }
```

### `app/api/teskeid/weather/saved-places/[id]/route.ts`

DELETE guard updated:
```ts
if (!hasVedrid && weatherMode !== 'all' && weatherMode !== 'authenticated') { return 404 }
```

### `app/page.tsx` (bug fix)

`publicReadyCardHref` now routes vedrid to `/innskraning` unless mode is `All`:
```ts
if (slug === 'vedrid') {
  return getWeatherEnabledMode() === 'all' ? '/vedrid' : '/innskraning'
}
```

### `app/vedrid/page.tsx` (bug fix)

Now redirects to `/innskraning` (not `/`) when mode is `Authenticated`:
```ts
if (mode === 'off') redirect('/')
if (mode === 'authenticated') redirect('/innskraning')
// mode === 'all' → show public weather
```

### `app/hugmyndir/[slug]/page.tsx` (bug fix)

`launchedCtaHref` updated to match the same mode-aware logic:
```ts
const launchedCtaHref = idea.slug === 'vedrid'
  ? (getWeatherEnabledMode() === 'all' ? '/vedrid' : '/innskraning')
  : ...
```

---

## Changes: tests

### `lib/__tests__/weather-public.test.ts`

- File comment updated (sections D/E/F added)
- Static `const true/false` contract tests replaced with real unit tests:
  - **Section D** — `getWeatherEnabledMode` (6 tests): All, Authenticated, off, unknown, legacy `true`+PUBLIC, legacy `true` alone
  - **Section E** — `resolveWeatherBaseAccess` (6 tests): signed-out+All→public, signed-out+Auth→blocked, signed-in-no-vedrid+Auth→authenticated, signed-in-no-vedrid+All→public, vedrid+All→authenticated, off→blocked
  - **Section F** — rate limit (static documentation, 3 tests)
- Added `mockCheckFeatureAccess` hoisted mock and `vi.mock('@/lib/loans/guard', ...)`

### `lib/__tests__/home-page.test.tsx`

- Added explicit tests:
  - `WEATHER_ENABLED=All` → signed-in without vedrid sees Veðrið card
  - `WEATHER_ENABLED=Authenticated` → signed-in without vedrid sees Veðrið card
- Renamed legacy test to "legacy fallback for All mode: ..."

### `lib/__tests__/weather-routes-api.test.ts`

- 2 tests: changed from "PUBLIC off → 401" to "WEATHER_ENABLED off → 404" (using `delete process.env.WEATHER_ENABLED`)

### `lib/__tests__/weather-saved-places-api.test.ts`

- 4 tests: same approach — off-mode blocked scenarios instead of legacy "PUBLIC off"

### `lib/__tests__/place-search-api.test.ts`

- 1 test: changed from 401 to 404 via off mode

### `lib/__tests__/weather-travel-api.test.ts`

- 2 legacy tests renamed with "legacy fallback for All mode:" prefix
- Veðurstofan provider test now uses `WEATHER_ENABLED=All` explicitly (was `WEATHER_PUBLIC_ENABLED=true`)

### `lib/__tests__/weather-vedurstofan-projector.test.ts`

- Added `vedurstofan_forecasts_history` no-op stub to table-aware admin mock (was missing, caused 7 failures)

### `lib/__tests__/weather-vedurstofan-warmer.test.ts`

- Same history stub fix (1 failure)

### `lib/__tests__/public-landing.test.ts`

- Updated mirrored routing logic to reflect mode-aware `publicReadyCardHref` and `launchedCtaHref`
- Added tests: `All` → `/vedrid`, `Authenticated` → `/innskraning`, off → `/innskraning`

---

## Access contract summary

| Mode | Signed-out | Signed-in (no vedrid) | Signed-in (with vedrid) |
|------|------------|----------------------|------------------------|
| `All` | public (rate-limited) | public (rate-limited on /routes) | authenticated |
| `Authenticated` | blocked → /innskraning | authenticated | authenticated |
| `off` | blocked | blocked | blocked |

Veðurstofan provider is separately gated via `weather-provider-vedurstofan` feature row regardless of base mode.

---

## Full release slice — files to stage for commit

```
?? lib/weather/weatherBaseAccess.server.ts      (new — git add)
?? lib/weather/weatherEnabledMode.server.ts     (new — git add)
 M app/api/teskeid/weather/saved-places/[id]/route.ts
 M app/api/teskeid/weather/saved-places/route.ts
 M app/hugmyndir/[slug]/page.tsx
 M app/page.tsx
 M app/vedrid/page.tsx
 M lib/__tests__/home-page.test.tsx
 M lib/__tests__/place-search-api.test.ts
 M lib/__tests__/public-landing.test.ts
 M lib/__tests__/weather-public.test.ts
 M lib/__tests__/weather-routes-api.test.ts
 M lib/__tests__/weather-saved-places-api.test.ts
 M lib/__tests__/weather-travel-api.test.ts
 M lib/__tests__/weather-vedurstofan-projector.test.ts
 M lib/__tests__/weather-vedurstofan-warmer.test.ts
```

Do NOT stage other files — the worktree has many unrelated changes.

---

## Localhost checks before commit

```env
WEATHER_ENABLED=Authenticated
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

1. **Signed out on `/`**: Veðrið card is visible. Clicking it → `/innskraning` (not `/`).
2. **Signed out on `/hugmyndir/vedrid`**: CTA button → `/innskraning`.
3. **Direct `/vedrid`**: redirects to `/innskraning`.
4. **Signed in as `stebbishj@gmail.com`** (no private vedrid): `/auth-mvp/heim` shows Veðrið. `/auth-mvp/vedrid` opens. Base MET/Yr works. Veðurstofan hidden.
5. **Signed in as `teskeid@gottvibe.is`** (has `weather-provider-vedurstofan`): Veðurstofan shows.

Then switch to `WEATHER_ENABLED=All`:

6. **Signed out on `/`**: Veðrið card → `/vedrid`. Public weather shows.
7. **Signed in without vedrid**: `/auth-mvp/heim` shows Veðrið. Saved places work.
8. **Veðurstofan**: still hidden unless provider flag.

---

## What was NOT changed

- `lib/loans/guard.ts` (already updated in v222, not touched here)
- Veðurstofan provider gate (intact)
- SQL migrations (none)
- Saved-places guards were NOT refactored to use shared helpers (deferred per Codex recommendation)
