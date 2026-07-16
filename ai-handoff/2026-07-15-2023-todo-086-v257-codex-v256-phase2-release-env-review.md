# 2026-07-15 20:23 - TODO-086 v257 - Codex review of v256 Phase 2 commit-ready + release/env gate

## Findings

No blocking findings.

This is low-risk to deploy while closed, but not literally risk-free. The important distinction:

- If `TESKEID_CHAT_ENABLED` is absent or not exactly `true`, all new Veðurpúls API routes return `503 Chat disabled`.
- If `TESKEID_CHAT_ENABLED=true`, access still requires:
  - authenticated user session
  - weather base access via `WEATHER_ENABLED=All` or `WEATHER_ENABLED=Authenticated`
  - per-user `weather-provider-vedurstofan` access, unless `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false`
  - per-user `weather-pulse` access, unless `WEATHER_PULSE_ACCESS_REQUIRED=false`
- All four new API route files call `checkChatAccess()`.
- Thread/message operations also enforce Veðurpúls scope with `WEATHER_PULSE_SCOPE` and `assertThreadScope()` / `assertMessageScope()`.

So: if Vercel does **not** have `TESKEID_CHAT_ENABLED=true`, this release should be effectively closed even if the API routes are deployed. If Vercel later sets `TESKEID_CHAT_ENABLED=true`, access is still per-user gated unless someone explicitly sets `WEATHER_PULSE_ACCESS_REQUIRED=false`.

## v256 Commit Scope Review

v256's proposed staging list looks correct:

- Stage:
  - `lib/chat/repository.server.ts`
  - `lib/__tests__/chat-repository.test.ts`
  - `lib/chat/api.server.ts`
  - `app/api/auth-mvp/vedurpuls/thread/route.ts`
  - `app/api/auth-mvp/vedurpuls/messages/route.ts`
  - `app/api/auth-mvp/vedurpuls/read/route.ts`
  - `app/api/auth-mvp/vedurpuls/report/route.ts`
  - `lib/__tests__/vedurpuls-api.test.ts`
- Do not stage:
  - `TODO.md`
  - `WORKFLOW.md`
  - `.claude/`
  - `.obsidian/`
  - review/handoff files, unless Stebbi wants docs committed separately

The repo currently shows exactly the expected tracked/untracked feature files for Phase 2, plus the v256 handoff file.

## Env For Safe Deploy Closed

For a deploy where users should not see/use Veðurpúls yet:

```env
# Best: leave absent. Also safe:
TESKEID_CHAT_ENABLED=false

# Best: leave absent or keep true. Do NOT set false yet.
WEATHER_PULSE_ACCESS_REQUIRED=true
```

Keep the existing weather release settings as intended:

```env
WEATHER_ENABLED=All
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

`WEATHER_ELTA_VEDRID_FLAG=true` only controls the existing Elta/Veðurstofan validation surface; it does not by itself open Veðurpúls.

## Env For Testing Veðurpúls

For localhost or a tightly controlled Vercel test:

```env
WEATHER_ENABLED=All
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

Then grant the test user these `feature_access` rows:

- `weather-provider-vedurstofan`
- `weather-pulse`

If testing the old `/auth-mvp/vedrid/elta-vedrid` page as the entry point, that same user likely also needs:

- `elta-vedrid`

Do **not** set `WEATHER_PULSE_ACCESS_REQUIRED=false` until the decision is to open Veðurpúls to all users who have the Veðurstofan provider layer.

## SQL / Supabase Notes

This Phase 2 commit does not add new SQL. It assumes:

- `sql/78_teskeid_chat_core.sql` has been run.
- `sql/79_feature_access_weather_pulse.sql` has been run.

If `sql/79` has not been run in a target environment, admin cannot reliably grant `weather-pulse` because the `feature_access_feature_key_check` constraint will reject that key. If `sql/78` has not been run, enabled API calls will fail when they try to use the chat tables.

No RLS weakening was observed in this Phase 2 code review.

## Commands Run

```bash
npm run test:run -- lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-repository.test.ts lib/__tests__/chat-access.test.ts
```

Result: 3 test files passed, 84 tests passed.

```bash
npm run type-check
```

Result: passed.

## Localhost checks for Stebbi

Phase 2 has no visible UI yet, so the main localhost check is access behavior rather than a button on the page.

Suggested checks before Phase 3:

1. Leave `TESKEID_CHAT_ENABLED` absent or set it to `false`.
2. Open normal weather flows:
   - `/vedrid`
   - `/auth-mvp/vedrid`
3. Confirm existing weather still works as before.
4. If you manually hit any `/api/auth-mvp/vedurpuls/*` route while chat is disabled, expect `503 Chat disabled`.
5. To test API access intentionally, set:
   - `TESKEID_CHAT_ENABLED=true`
   - `WEATHER_PULSE_ACCESS_REQUIRED=true`
   - grant the user `weather-provider-vedurstofan`
   - grant the user `weather-pulse`
6. Confirm a user without `weather-pulse` cannot use the API.
7. Confirm a user without `weather-provider-vedurstofan` cannot use the API even if `weather-pulse` exists.

Do not test broad rollout by setting `WEATHER_PULSE_ACCESS_REQUIRED=false` unless the intention is to let every Veðurstofan-provider user use Veðurpúls.

## Recommendation

I am comfortable with the Phase 2 commit and deploy **if**:

1. Only the v256-listed feature files are staged.
2. Vercel does not have `TESKEID_CHAT_ENABLED=true` unless Stebbi is intentionally starting a controlled Veðurpúls test.
3. Vercel does not have `WEATHER_PULSE_ACCESS_REQUIRED=false`.
4. SQL78 and SQL79 are already present in the target database before enabling chat.

For testing after deploy, enable `TESKEID_CHAT_ENABLED=true`, keep `WEATHER_PULSE_ACCESS_REQUIRED=true`, and grant `weather-pulse` only to the selected test users.
