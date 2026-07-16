# 2026-07-15 20:11 - TODO-086 v253 - Codex review of v252 scope checks

Created: 2026-07-15 20:11
Timezone: Atlantic/Reykjavik

Reviewed:

- `ai-handoff/2026-07-15-2010-todo-086-v252-claude-v251-scope-checks-done.md`
- `WORKFLOW.md`
- `ai-handoff/README.md`
- `lib/chat/api.server.ts`
- `lib/chat/repository.server.ts`
- `app/api/auth-mvp/vedurpuls/messages/route.ts`
- `app/api/auth-mvp/vedurpuls/read/route.ts`
- `app/api/auth-mvp/vedurpuls/report/route.ts`
- `lib/__tests__/vedurpuls-api.test.ts`
- `lib/__tests__/chat-repository.test.ts`

## Findings

### MEDIUM - Scope helpers turn Supabase query errors into 404 `not found`

The v251 scope issue is substantially fixed, but the new helpers do not inspect Supabase `error` from `maybeSingle()`:

- `lib/chat/repository.server.ts:185-192`
- `lib/chat/repository.server.ts:204-217`

That means a real DB/query/service-role failure during the scope check can be treated exactly like a missing or out-of-scope thread/message, and the route returns 404.

This is not a data-leak issue. It is an operational correctness issue:

- A real Supabase failure would look to the client like "thread/message not found".
- Debugging becomes harder.
- Users could see pulse content disappear instead of a controlled "unavailable" state.
- It undercuts the Phase 2 hardening goal that repository failures become controlled 500s.

Recommended tiny patch before Phase 2 commit:

- In `assertThreadScope`, destructure `{ data, error }`.
- If `error`, throw a distinct error such as `chat: scope check failed`.
- In `assertMessageScope`, do the same for both the message lookup and thread lookup.
- Keep `chat: not found` only for no row / out-of-scope.
- Existing route catches already map unknown repository errors to 500, so no route change is strictly required.
- Add tests:
  - `assertThreadScope` throws `chat: scope check failed` on Supabase error.
  - `assertMessageScope` throws `chat: scope check failed` on message lookup error.
  - `assertMessageScope` throws `chat: scope check failed` on thread lookup error.
  - Optional API route test that a scope helper non-`not found` error maps to 500.

This is small enough that I would fix it now before commit, rather than leave it as a follow-up.

## Resolved From v251

The actual v251 authorization concern is addressed:

- `messages GET` checks `assertThreadScope(threadId, WEATHER_PULSE_SCOPE)` before `listMessages`.
- `messages POST` checks `assertThreadScope(threadId, WEATHER_PULSE_SCOPE)` before `postMessage`.
- `read POST` checks `assertThreadScope(threadId, WEATHER_PULSE_SCOPE)` before `markThreadRead`.
- `report POST` checks `assertMessageScope(messageId, WEATHER_PULSE_SCOPE)` before `reportMessage`.
- Missing and out-of-scope are intentionally collapsed to `chat: not found`, then 404, which avoids revealing whether a foreign thread/message exists.
- `WEATHER_PULSE_SCOPE` is centralized in `lib/chat/api.server.ts`.
- `markThreadRead` now has direct repository tests.

This is the right architecture for a reusable chat core: shared generic storage, but product-specific API routes enforce product-specific scope before they use raw IDs.

## Verification

Codex ran:

```powershell
npm run test:run -- lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-repository.test.ts
```

Result:

- Exit code: 0
- Test files: 2 passed
- Tests: 69 passed

Claude reports `npm run type-check` passed. Codex did not rerun typecheck in this review turn.

## SQL / RLS / Auth

No SQL changes in v252.

RLS posture from SQL78 remains good:

- RLS enabled on all chat tables.
- No anon/authenticated grants.
- Only `service_role` has table grants.
- Client reads/writes go through server APIs.

The important service-role API scope check is now present. The only remaining fix is error classification inside those scope helpers.

## Recommendation

Ask Claude Code for a very small v254 patch:

1. Preserve 404 for missing/out-of-scope.
2. Return 500 for actual Supabase scope-check errors.
3. Add the few repository/API tests above.

After that patch passes targeted tests and typecheck, I would be comfortable with Phase 2 commit and then moving to Phase 3 UI.

If Stebbi wants to be pragmatic, v252 is not a security blocker anymore. But because this is a tiny hardening cleanup and the project rule is no unnecessary shortcuts, my recommendation is to do it before commit.

## Localhost Checks For Stebbi

No user-visible UI changed in v252. There is no meaningful browser check yet for Stebbi.

Once Phase 3 UI exists, Stebbi should test:

1. Log in as a user with both `weather-provider-vedurstofan` and `weather-pulse`.
2. Open the Veðurpúls / Elta veðrið surface.
3. Open a Veðurstofan station and confirm a thread can be created or loaded.
4. Post a short pulse message.
5. Refresh and confirm the message remains on the same station.
6. Open/mark the thread read and confirm unread state clears.
7. Report the message once; report again and confirm duplicate report is handled gracefully.
8. Log in as a user without `weather-pulse` and confirm no Veðurpúls access is exposed.

Do not manually change chat rows in Supabase while testing UI unless explicitly doing an admin/security test. Manual row edits can create confusing unread/report state.

## Óvissa / þarf að staðfesta

I did not inspect any Phase 3 UI because v252 is API/repository/test hardening only.

`git status` shows unrelated modified/untracked files in the repo (`TODO.md`, `WORKFLOW.md`, many `ai-handoff` files, and local tool folders). I ignored unrelated worktree state and reviewed only the Veðurpúls API/repository/test changes relevant to v252.
