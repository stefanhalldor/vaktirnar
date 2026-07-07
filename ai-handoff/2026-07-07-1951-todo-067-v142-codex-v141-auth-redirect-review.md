# TODO 067 - v142 Codex review: v141 auth redirect fix

Created: 2026-07-07 19:51  
Timezone: Atlantic/Reykjavik  
From: Codex  
To: Stebbi / Claude Code  
Reviewed: `2026-07-07-1950-todo-067-v141-claude-v140-auth-redirect-fix-handoff.md`

## Findings first

### No blocking findings

Claude v141 fixes the core v140 issue correctly:

- unauthenticated API requests now return JSON `401` instead of UI `307` redirects
- `FerdalagidClient` no longer blindly calls `res.json()` before checking response shape
- the travel result flow now has a specific session-expired message instead of collapsing everything into `errorGeneral`
- tests cover the middleware behavior for `/api/teskeid/weather/travel` and `/api/place/search`

This is the right narrow fix for the localhost symptom Stebbi saw.

### Low - Non-JSON server errors are currently shown as expired login

`app/auth-mvp/vedrid/FerdalagidClient.tsx` now treats any non-JSON response as `errorAuthExpired`.

That is acceptable for this beta resilience fix because the real bug was a login redirect/HTML response being treated as a weather failure. Still, a future CDN/500 HTML error would also say "Innskráningin rann út" even if auth was fine.

Not blocking. If this message shows up for users who are clearly logged in, next refinement should distinguish:

- `res.status === 401` or `res.redirected` -> auth/session message
- non-JSON 5xx/other -> generic server/unexpected response message

## Verification by Codex

```text
npm run type-check
# exit 0

npm run test:run
# exit 0
# 54 files passed
# 1772 passed / 27 skipped / 8 todo

git diff --check
# exit 0
# warning only: messages/is.json LF will be replaced by CRLF next time Git touches it
```

Codex also reviewed the targeted diff:

```text
middleware.ts
app/auth-mvp/vedrid/FerdalagidClient.tsx
messages/is.json
messages/en.json
lib/__tests__/middleware.test.ts
lib/__tests__/legacy-guard.test.ts
```

## Auth / security review

No auth weakening found.

Important details:

- `middleware.ts` only changes the fallback unauthenticated behavior for `/api/*` from redirect to JSON `401`.
- Public API prefixes already in `PUBLIC_PATHS` remain public as before.
- Legacy disabled API prefixes are still handled earlier in middleware and still return not found.
- Weather/place route handlers still perform their own auth and feature access checks.

This is safer for API clients because fetch callers get machine-readable auth failure instead of an HTML login page.

## Localhost checks for Stebbi

1. Restart localhost so middleware changes are definitely active.
2. Open `/auth-mvp/vedrid` as a logged-in user with weather access.
3. Calculate `Reykjavík -> Selfoss`.
4. Expected in DevTools Network:
   - `/api/teskeid/weather/travel` is `200`
   - response content-type is JSON
   - no `307` on the `travel` request
5. Expected UI: weather result appears, not `Eitthvað fór úrskeiðis`.
6. In a private/incognito window or after clearing only localhost auth cookies, try the same API flow.
7. Expected: API returns JSON `401`, not redirect. UI should show the new session-expired copy if the flow reaches the result request.
8. Confirm normal page auth still works:
   - logged-out `/auth-mvp/heim` redirects to `/innskraning`
   - logged-out private app pages still require login
9. Confirm place search still works:
   - known place returns suggestions
   - unknown place shows mild no-results copy
   - no scary generic provider error unless both Google and server fallback fail

Do not test this by changing production auth, Supabase policies, or Vercel secrets. Localhost is enough for this fix.

## Status

v141 is good to send back to Stebbi for localhost verification.

No SQL was run. No migrations were created. No app code was changed by Codex. No commit, push, deploy, or production action was performed.
