# 2026-07-15 23:47 - TODO-086 v286 - Codex review of v285 navigation state

Created: 2026-07-15 23:47
Timezone: Atlantic/Reykjavik

Review target: `2026-07-15-2325-todo-086-v285-claude-v284-done`

## Findings

### Medium - `returnTo` can still lose or mismatch the selected station in a fast-click/stale-URL render

Files:
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:49`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:60-66`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:417`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:22-23`

`selectedId` is updated immediately, but `currentUrl` is derived from `useSearchParams()`:

```tsx
const currentUrl = pathname + (searchParams.toString() ? '?' + searchParams.toString() : '')
```

When the user selects a station, `selectStationRef.current()` does both `setSelectedId(newId)` and `router.replace(...)`. There can be a render where the station detail card is already visible for the new `selectedId`, but `useSearchParams()` has not yet reflected the replaced URL.

In that moment, the full pulse link can be built with:

```tsx
returnTo=/auth-mvp/vedrid/elta-vedrid
```

or with the previous station's `stationId`. Because `resolveBackHref()` accepts any decoded value that starts with `/auth-mvp/vedrid`, it will use that stale `returnTo` instead of falling back to:

```tsx
/auth-mvp/vedrid/elta-vedrid?stationId=${stationId}
```

That means the original bug can still happen if the user clicks quickly after selecting a station: "Til baka" may return to the explorer without the selected station open, or with the wrong station open.

Recommended fix:

- Build the pulse `returnTo` from the station being rendered, not only from ambient `searchParams`.
- The `returnTo` passed from `WeatherPulseSummary` should always force `stationId` to the same `stationId` as the pulse link.
- Example contract:
  - selected station card for `2655`
  - full pulse href must include `returnTo=/auth-mvp/vedrid/elta-vedrid?stationId=2655`
  - even if the current URL has no `stationId` yet or has a stale one.

Suggested helper shape:

```ts
function buildStationReturnTo(currentUrl: string, stationId: string): string {
  const [path, query = ''] = currentUrl.split('?')
  const params = new URLSearchParams(query)
  params.set('stationId', stationId)
  return `${path}?${params.toString()}`
}
```

The helper does not have to be exactly this, but the invariant should be: full pulse link for station X always returns to station X.

### Low - `returnTo` validation is useful, but should have explicit unit coverage before it grows

File:
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:17-25`

The current validation rejects obvious external URLs, which is good. I would still add small tests or extract the helper into a testable module before this pattern is reused from `/auth-mvp/vedrid` travel result cards.

Minimum cases to lock down:

- `null` -> `/auth-mvp/vedrid/elta-vedrid?stationId=2655`
- `/auth-mvp/vedrid/elta-vedrid?stationId=2655` -> accepted
- `https://evil.example` -> fallback
- `//evil.example` or encoded equivalent -> fallback
- malformed encoding -> fallback
- `/auth-mvp/vedrid/elta-vedrid` without stationId -> either accepted only if intentionally allowed, or normalized to include the route stationId.

This is especially important because `returnTo` will likely become generic for preserving `/auth-mvp/vedrid` result context later.

## What looks good

- v285 correctly moved the selected station into the URL as `stationId`.
- The full pulse route now has a deterministic back-link instead of a hardcoded explorer URL.
- Fallback includes the current station ID, which is the right default behavior.
- The solution remains product-scoped; it does not pull weather-specific behavior into the generic chat core.
- Type-check and the existing chat/pulse tests pass.

## Commands run

```powershell
npm run type-check
```

Result: exit 0.

```powershell
npm run test:run -- lib/__tests__/chat-repository.test.ts lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/vedurpuls-preview.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-access.test.ts
```

Result: exit 0. 5 test files passed, 115 tests passed.

## Files inspected

- `ai-handoff/2026-07-15-2325-todo-086-v285-claude-v284-done.md`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `messages/is.json`
- `messages/en.json`
- relevant chat/pulse tests under `lib/__tests__/`

## SQL / Supabase

No SQL was written or run in this review.

No RLS, grants, policies, functions, auth tables, or production data were changed by this review.

## Recommended next step for Claude Code

Please make one narrow follow-up:

1. Ensure the full pulse link's `returnTo` always includes the same `stationId` as the station card being rendered.
2. Add unit coverage for the return-to helper/contract if practical.
3. Keep this scoped to navigation state. Do not change chat core behavior, database schema, auth, or pulse UI copy in the same pass.

## Localhost checks for Stebbi

After Claude Code fixes the above:

1. Open `/auth-mvp/vedrid/elta-vedrid`.
2. Select a station, for example Æðey.
3. Immediately click `Opna púlsinn` as fast as possible after the station detail card appears.
4. Click `Til baka`.
5. Expected: you return to `/auth-mvp/vedrid/elta-vedrid?stationId=...` and the same station is still open.
6. Repeat by selecting station A, then quickly selecting station B and opening the pulse.
7. Expected: `Til baka` returns to station B, not station A.
8. Open the full pulse URL manually with `?returnTo=https%3A%2F%2Fevil.example`.
9. Expected: `Til baka` falls back to `/auth-mvp/vedrid/elta-vedrid?stationId=...`.

Do not run SQL or change Vercel env vars for this check. This is a localhost navigation-state test only.
