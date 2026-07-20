# TODO 086 / v213 - Claude pre-release handoff - v212 done

## Status

Implemented, committed. Ready to push and deploy.

## What was done

Implemented the v212 Codex recommendation: canonicalize authenticated users from
public `/vedrid` into `/auth-mvp/vedrid` via middleware redirect.

### middleware.ts

Added redirect block placed before the existing `if (user && isPublic && !isRoot)` block:

```ts
// Canonicalize authenticated users from public weather routes to the authenticated shell.
if (user && (pathname === '/vedrid' || pathname === '/vedrid/ferdalagid')) {
  const url = request.nextUrl.clone()
  url.pathname = '/auth-mvp' + pathname
  return NextResponse.redirect(url)
}
```

Query string is preserved by `request.nextUrl.clone()` (Next.js copies search params on clone).

### lib/__tests__/middleware.test.ts

Added describe block `'middleware — authenticated /vedrid canonicalization'` with 5 tests:

1. `authenticated /vedrid → /auth-mvp/vedrid` — status 307, correct pathname
2. `authenticated /vedrid?saveDefaults=10%2C13 → /auth-mvp/vedrid preserving query string` — verifies `?saveDefaults=10%2C13` survives
3. `unauthenticated /vedrid passes through (200)` — guests stay on public route
4. `authenticated /vedrid/ferdalagid → /auth-mvp/vedrid/ferdalagid` — trip wizard canonicalization
5. `authenticated /auth-mvp/vedrid does not redirect (no loop)` — verified 200 for the canonical target

All 54 middleware tests pass. Type-check clean.

## Commit

`07f311d` — fix: canonicalize authenticated users from /vedrid to /auth-mvp/vedrid in middleware (#86)

Files changed:
- `middleware.ts`
- `lib/__tests__/middleware.test.ts`

## Pre-release checks for Stebbi

1. Push: `git push`
2. Monitor Vercel build log.
3. While logged in, navigate to `/vedrid` — expect immediate redirect to `/auth-mvp/vedrid` with authenticated hamburger.
4. While logged in, navigate to `/vedrid/ferdalagid` — expect redirect to `/auth-mvp/vedrid/ferdalagid`.
5. Log out, navigate to `/vedrid` — expect public page with no redirect.
6. Confirm `/auth-mvp/vedrid` does not redirect loop when authenticated.
7. Confirm `?saveDefaults=...` is preserved through the redirect.

## Regression checks

- Logged-out `/vedrid` must still load (public weather).
- `/auth-mvp/vedrid` must not redirect back to `/vedrid`.
- Ferðalagið CTA from authenticated weather must use `/auth-mvp/vedrid/ferdalagid`.
- Existing route-memory filters and safnpuls must be unchanged.

## What is NOT in this fix

- No SQL, migration, or production data changes.
- No changes to RLS, preference storage, or auth tables.
- No changes to the underlying WeatherOverviewClient or page components.
