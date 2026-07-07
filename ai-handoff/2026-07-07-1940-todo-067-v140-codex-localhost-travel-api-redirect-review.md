# TODO 067 - v140 Codex review: localhost travel API redirects

Created: 2026-07-07 19:40  
Timezone: Atlantic/Reykjavik  
From: Codex  
To: Stebbi / Claude Code  
Context: Stebbi is localhost-testing the weather flow and got a generic result error while creating a travel-weather result.

## Findings first

### High - `/api/teskeid/weather/travel` can be turned into a UI redirect before the API handler returns JSON

Stebbi's screenshot shows the `travel` request as `307` redirects, followed by login/root redirects. That means the request is not failing inside the deterministic weather calculation first. It is likely being intercepted by middleware before the route handler can return its intended JSON response.

Relevant code:

- `middleware.ts:168-171` redirects any unauthenticated non-public path to `/login`.
- `/api/teskeid/weather/travel` is not in `PUBLIC_PATHS`.
- `app/api/teskeid/weather/travel/route.ts:68-77` already has proper API-level auth + `vedrid` feature-gate checks and returns JSON `401`/`404`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:119-132` posts to `/api/teskeid/weather/travel`, then immediately does `await res.json()`.

Failure chain:

1. User reaches the result flow with a missing/expired/unreadable session cookie, or a browser state where the API call is not seen as authenticated.
2. Middleware redirects the API call to `/login`.
3. Because legacy routes are disabled, `/login` can then redirect again.
4. The client expects JSON but receives a redirect/HTML response.
5. `await res.json()` throws and the UI falls into generic `errorGeneral`: `Eitthvað fór úrskeiðis. Reyndu aftur.`

This is not good enough for localhost testing or production beta. It makes auth/config failures look like weather-calculation failures.

### Medium - Client error handling assumes every response is JSON

`FerdalagidClient.tsx:130` calls `await res.json()` before checking whether the response is JSON, whether `res.redirected` is true, or whether the status is `401`.

Even if middleware is fixed, this is still brittle. Any CDN/proxy/auth redirect, Vercel edge error, HTML error page, or unexpected provider response can collapse into the same generic message.

### Low - Design.md implication

`Design.md` requires clear loading/error states and practical microcopy. A generic result error after a long route calculation does not meet that bar because it gives Stebbi and beta users no clue whether the problem is login, route calculation, weather forecast, map provider, or server config.

## Recommended fix for Claude Code

Keep this narrow. Do not mix it with route alternatives, saved places, or ferry fallback.

### 1. Make API auth failures return JSON, not UI redirects

Preferred middleware pattern:

```ts
if (!user && !isPublic && !isAuthCallback) {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}
```

Keep the existing legacy API `404` behavior earlier in the middleware. Do not weaken route handler auth checks or feature gates.

Alternative acceptable approach:

- Add specific weather/place API prefixes to the pass-through allowlist so their route handlers can return their own JSON auth errors:
  - `/api/teskeid/weather/`
  - `/api/place/search`
  - `/api/place/reverse-geocode`

If using this approach, be explicit in comments that these are not public data endpoints; they pass through because the route handlers enforce auth and `vedrid` access themselves.

### 2. Harden the travel result fetch

In `FerdalagidClient.tsx`, handle redirects and non-JSON before parsing:

- Send `credentials: 'same-origin'` explicitly.
- If `res.redirected` or `res.status === 401`, show a specific session/auth message.
- Check `content-type` includes `application/json` before `res.json()`.
- Map known API errors to specific copy.
- Keep generic copy only as the final fallback.

Suggested new message keys under `teskeid.vedrid.ferdalagid`:

- `errorAuthExpired`: `Innskráningin rann út. Skráðu þig inn aftur og prófaðu svo ferðina.`
- Optional CTA label: `Skrá inn`

Do not hardcode this text in the component; add Icelandic and English messages.

### 3. Harden place-search fallback the same way if touched

`components/weather/PlaceSearch.tsx:76` uses `/api/place/search`. That route also has auth + feature access in its handler, but middleware can currently redirect it before JSON is returned.

At minimum, after middleware is fixed, verify that place search still shows the intended mild no-results/provider messages and does not regress into scary red errors.

### 4. Add targeted tests where practical

Good tests:

- Middleware unauthenticated API request returns `401` JSON, not `307`.
- Middleware unauthenticated page request still redirects to login.
- Travel result client error mapping handles:
  - `401`
  - `route_unavailable`
  - `forecast_unavailable`
  - non-JSON response

Do not overbuild test harnesses if middleware testing is awkward, but at least cover any extracted response-parsing helper.

## What not to do

- Do not remove auth or `checkFeatureAccess`.
- Do not make weather/place APIs truly public.
- Do not hide this by only changing the generic copy.
- Do not mix this fix with route alternatives or saved places; this is a production-beta resilience bug.

## Files reviewed by Codex

```text
WORKFLOW.md
Design.md
middleware.ts
app/api/teskeid/weather/travel/route.ts
app/api/teskeid/weather/ask/route.ts
app/api/place/search/route.ts
app/api/place/reverse-geocode/route.ts
app/auth-mvp/vedrid/FerdalagidClient.tsx
components/weather/PlaceSearch.tsx
messages/is.json
ai-handoff/2026-07-07-1841-todo-067-v133-codex-v132-review-route-auth-usability.md
```

## Commands run by Codex

```text
Get-Content -Encoding UTF8 'WORKFLOW.md'
Get-Content -Encoding UTF8 'Design.md'
Get-Content / rg read-only inspections of middleware, weather API routes, place API routes, FerdalagidClient, PlaceSearch, messages
Get-Date -Format 'yyyy-MM-dd HH:mm'
# 2026-07-07 19:40
```

No app code was changed. No SQL was run. No migrations were created. No commit, push, deploy, or production action was performed.

## Localhost checks for Stebbi

After Claude Code implements the fix:

1. Open `/auth-mvp/vedrid` as a logged-in user with `vedrid` access.
2. Select a normal route, for example `Reykjavík -> Selfoss`, and calculate a result.
3. Expected Network result: `/api/teskeid/weather/travel` returns `200` JSON. It should not show `307`.
4. Expected UI: weather result appears, not generic `Eitthvað fór úrskeiðis`.
5. Simulate expired auth in a safe localhost way, for example by using a private/incognito window or clearing only localhost auth cookies, then try to calculate.
6. Expected: page or API failure explains that login is needed/expired. It must not look like weather calculation failed.
7. Test place search after the same change:
   - known place like `Garðabær` returns suggestions
   - unknown place shows mild no-results copy
   - blocked Google client APIs should still fall back to server search when logged in
8. Regression check: logged-out normal pages should still redirect to login where appropriate; legacy APIs should still return not found when legacy is disabled.

Do not test production auth/cookies destructively. This can be validated on localhost first.

## Óvissa / þarf að staðfesta

The screenshot strongly suggests the middleware redirect chain, but Claude Code should confirm by opening the `travel` request in DevTools and checking `Response Headers -> location` or the redirect chain. If the response is instead a server JSON error, then the next focus should be the exact JSON payload and why the client maps it to generic.
