# TODO #67 (proposed) - Codex v007 - Review of Claude v006 mini-revision

Created: 2026-07-03 07:06  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Review handoff for Claude Code v006  
Refs:

- `ai-handoff/2026-07-03-0720-todo-067-v006-claude-mini-revision.md`
- `ai-handoff/2026-07-03-0700-todo-067-v005-codex-v004-review-handoff.md`
- `ai-handoff/2026-07-03-0024-todo-067-v004-claude-revised-plan.md`

No code, SQL, env, Supabase, dependency install, commit, push, deploy, or production changes were made.

## Findings

### 1. Major - v006 still needs explicit table grants for `service_role`

Claude v006 correctly fixes the RLS posture:

- `ENABLE ROW LEVEL SECURITY`
- no client policies
- revoke from `PUBLIC`, `anon`, and `authenticated`

But v006 says service role does not need a special grant because it is exempt from RLS:

- `ai-handoff/2026-07-03-0720-todo-067-v006-claude-mini-revision.md:34`
- `ai-handoff/2026-07-03-0720-todo-067-v006-claude-mini-revision.md:116`

That is not enough for this repo.

Existing migrations explicitly document that `BYPASSRLS` does not replace table-level privileges:

- `sql/34_loan_permissions_and_rpc_fix.sql:13`
- `sql/34_loan_permissions_and_rpc_fix.sql:15`
- `sql/34_loan_permissions_and_rpc_fix.sql:17`

Existing server-only tables also use the pattern:

- `ENABLE ROW LEVEL SECURITY`
- no client policies
- revoke client roles
- explicit grant to `service_role`

Examples:

- `sql/52_feature_access.sql:15`
- `sql/52_feature_access.sql:18`
- `sql/52_feature_access.sql:19`
- `sql/61_loan_chat_messages_in_history.sql:51`
- `sql/61_loan_chat_messages_in_history.sql:54`
- `sql/61_loan_chat_messages_in_history.sql:55`

Required correction for the future weather cache migration:

```sql
ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.weather_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_cache TO service_role;
```

The important distinction:

- RLS controls row-level policy evaluation.
- `GRANT` controls whether the role can use the table at all.
- `service_role` can bypass RLS, but it still needs table privileges.

### 2. No remaining blocker if the service_role grant correction is accepted

The other v005 findings are resolved:

- cache key is now versioned and endpoint-specific
- cleanup/expiry is more realistic
- User-Agent is updated to `teskeid@gottvibe.is`
- Phase 1A + 1B are treated as one product lot with an internal 1A checkpoint
- `Localhost checks for Stebbi` is present and covers the right categories

## Approval Position

Codex does **not** approve v006 exactly as written because of the missing `service_role` grant.

Codex would approve the plan for scoped implementation after Claude Code amends the SQL-plan wording to include:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_cache TO service_role;
```

This can be a tiny v008 correction or explicitly included in Stebbi's implementation instruction to Claude Code.

## Recommended Next Step

Ask Claude Code to make one final mini-correction:

- keep `ENABLE ROW LEVEL SECURITY`
- keep no client policies
- keep `REVOKE ALL ... FROM PUBLIC, anon, authenticated`
- add explicit `GRANT SELECT, INSERT, UPDATE, DELETE ... TO service_role`
- keep all other v006 decisions unchanged

After that, Stebbi can give scoped implementation approval for the Phase 1A + 1B product lot, with the SQL migration written but not run unless separately approved.

## Localhost checks for Stebbi

Use the v006 localhost checks after implementation, with one extra database check:

### Database/cache privilege check

Before running any production migration:

- Claude Code should show the final migration diff.
- Confirm `weather_cache` has RLS enabled.
- Confirm there are no `anon` or `authenticated` grants.
- Confirm `service_role` has `SELECT, INSERT, UPDATE, DELETE`.

Expected:

- server-side `getAdmin()` cache reads/writes work
- direct client table access is unavailable
- no user data, prompts, emails, auth/session data, or secrets are stored in cache

### Product checks from v006 still apply

- feature disabled
- per-user gate
- AI disabled
- AI enabled
- cache behavior
- mobile UI at 360/390/460 px
- safety wording
- do not casually test production migrations, production allowlists, production API keys, met.no request loops, commit, push, or deploy

## Residual Risk

Weather + AI is now a multi-surface change: env flags, Supabase migration, dependency install, server fetch/cache, AI validation, authenticated UI, messages, and tests.

Even with the grant correction, implementation should be kept as one scoped Phase 1A + 1B lot, followed by Codex review before commit, push, deploy, or running SQL in production.
