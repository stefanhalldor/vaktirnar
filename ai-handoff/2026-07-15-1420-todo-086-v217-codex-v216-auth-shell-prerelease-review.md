# TODO 086 v217 - Codex review of v216 authenticated weather shell prerelease

Created: 2026-07-15 14:20  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Prerelease review  
Reviewed handoff: `2026-07-15-1420-todo-086-v216-claude-auth-shell-correction-prerelease.md`

## Findings

No blocking findings.

Codex considers v216 ready for Stebbi localhost testing.

The implementation now matches Stebbi's clarified product rule:

- signed-out users still use public `/vedrid`
- signed-in users with base weather access use `/auth-mvp/vedrid`
- signed-in public-tier users keep authenticated UI and saved places
- private/advanced provider access remains separate
- Veðurstofan remains gated separately and is not opened by this change

## What I Reviewed

Relevant v216 changes:

- `lib/weather/weatherBaseAccess.server.ts`
  - adds `resolveAuthenticatedWeatherShellAccess`
  - preserves old `resolveWeatherBaseAccess` API semantics for public-capable API routes
- `app/auth-mvp/heim/page.tsx`
  - weather card uses authenticated shell access
  - signed-in weather card always links `/auth-mvp/vedrid`
- `app/auth-mvp/vedrid/page.tsx`
  - no longer requires private `vedrid` if public base weather is enabled
  - still blocks if `WEATHER_ENABLED` is off or neither private nor public access applies
  - still computes `tripEnabled` separately
- `app/api/teskeid/weather/saved-places/route.ts`
  - signed-in public-tier users can load/save places when public base weather is enabled
  - unauthenticated guests still only get empty GET response in public mode
  - unauthenticated POST remains unauthorized
- `app/api/teskeid/weather/saved-places/[id]/route.ts`
  - signed-in public-tier users can delete their own saved places when public base weather is enabled
  - ownership still relies on authenticated Supabase client/RLS, not service_role
- `lib/__tests__/home-page.test.tsx`
- `lib/__tests__/weather-saved-places-api.test.ts`

## Review Notes

The new helper split is the right shape:

- `resolveWeatherBaseAccess` remains for API routes that intentionally treat public-tier access as public/anonymous (`userId: null`, actor `public`).
- `resolveAuthenticatedWeatherShellAccess` is for signed-in UI/API surfaces where the user identity must be preserved, such as `/auth-mvp/vedrid` and saved places.

That avoids the v214 problem without changing analytics/rate-limit semantics for existing weather API routes.

The saved-places change is acceptable because:

- it still requires `AUTH_MVP_ENABLED=true`
- it now requires `WEATHER_ENABLED=true`
- it requires a signed-in user for real saved-place reads/writes
- it allows signed-in no-`vedrid` users only when `WEATHER_PUBLIC_ENABLED=true`
- it does not use service_role
- RLS should still scope rows to the authenticated user

## Non-Blocking Follow-Up

I would add one direct test for **POST saved place as signed-in public-tier user**.

The code path appears to allow it because `authGuard()` now returns context when:

```ts
hasVedrid || process.env.WEATHER_PUBLIC_ENABLED === 'true'
```

and POST uses that same `authGuard()`.

But the current new public-tier test block explicitly covers GET and DELETE, while POST coverage is indirect. Since Stebbi specifically cares that saved places survive for signed-in users, a direct POST test would make the intent harder to regress.

This is not a blocker for localhost testing.

## Commands Run By Codex

Read/review:

```powershell
Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-1420-todo-086-v216-claude-auth-shell-correction-prerelease.md'
Get-Content -Encoding UTF8 'ai-handoff/README.md'
git diff -- 'app/auth-mvp/heim/page.tsx' 'app/auth-mvp/vedrid/page.tsx' 'app/api/teskeid/weather/saved-places/route.ts' 'app/api/teskeid/weather/saved-places/[id]/route.ts' 'lib/weather/weatherBaseAccess.server.ts' 'lib/__tests__/home-page.test.tsx'
Get-Content -Encoding UTF8 'lib/weather/weatherBaseAccess.server.ts'
Get-Content -Encoding UTF8 'lib/__tests__/weather-saved-places-api.test.ts'
git status --short -- relevant files
rg -n "weather-saved-places-api|saved-places" ...
Get-Date -Format 'yyyy-MM-dd HH:mm'
```

Verification:

```powershell
npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/weather-saved-places-api.test.ts
npm run type-check
npm run test:run -- lib/__tests__/weather-public.test.ts
```

Results:

- `npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/weather-saved-places-api.test.ts`
  - Exit code: 0
  - `2 passed`
  - `108 passed`
  - Vitest printed `Not implemented: navigation to another Document`, but tests passed.
- `npm run type-check`
  - Exit code: 0
  - `tsc --noEmit` clean
- `npm run test:run -- lib/__tests__/weather-public.test.ts`
  - Exit code: 0
  - `1 passed`
  - `21 passed`

## Scope / Dirty Worktree Note

The repo still has many unrelated modified/untracked files from the broader TODO 086 work. This review only covers the v216 authenticated weather shell correction and directly related tests.

Also note: `lib/weather/weatherBaseAccess.server.ts` appears as untracked in `git status` in this workspace. It is already used by existing weather routes in the broader working tree, but release/commit review should ensure it is included.

## Localhost checks for Stebbi

Use:

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

1. **Signed out public user**
   - Open `/`.
   - Click `Veðrið`.
   - Expected: opens `/vedrid`.
   - Expected: public/guest weather works.
   - Expected: no saved-place behavior.

2. **Signed in as `stebbishj` or another user without private `vedrid`**
   - Open `/auth-mvp/heim`.
   - Expected: `Veðrið` card is visible.
   - Click `Veðrið`.
   - Expected: opens `/auth-mvp/vedrid`, not `/vedrid`.
   - Search/calculates a route.
   - Expected: authenticated UI is retained.
   - Expected: saved/recent places load if the user has any.
   - Expected: after route result, new places can be saved and appear later.
   - Expected: saved place delete works for that user's own places.
   - Expected: Veðurstofan provider is not visible unless this user has `weather-provider-vedurstofan`.

3. **Signed in as Stebbi/user with private `vedrid`**
   - Open `/auth-mvp/heim`.
   - Expected: `Veðrið` opens `/auth-mvp/vedrid`.
   - Expected: no regression in private weather flow.
   - Expected: Veðurstofan still follows its own provider flag/access.

4. **Public base weather disabled**
   - Temporarily set `WEATHER_PUBLIC_ENABLED=false`.
   - Test as signed-in user without private `vedrid`.
   - Expected: no `Veðrið` card on `/auth-mvp/heim`.
   - Expected: manual `/auth-mvp/vedrid` returns 404/blocked.
   - Restore `WEATHER_PUBLIC_ENABLED=true`.

5. **Global weather disabled**
   - Temporarily set `WEATHER_ENABLED=false`.
   - Expected: weather card hidden and weather routes blocked.
   - Restore `WEATHER_ENABLED=true`.

Do not change production Vercel env vars for these localhost checks.

## Óvissa / þarf að staðfesta

No blocker found.

The main thing Stebbi should confirm in browser is that saved places actually behave as expected for the real `stebbishj` account after landing in `/auth-mvp/vedrid`.

