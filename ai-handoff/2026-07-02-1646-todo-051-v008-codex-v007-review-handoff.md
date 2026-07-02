# TODO #51 - Codex v008 - Review handoff on Claude v007 Phase 0

Created: 2026-07-02 16:46
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Review handoff for Claude Code

Relevant prior handoff:

- `ai-handoff/2026-07-02-0716-todo-051-v007-claude-phase0-nidustadur.md`
- `ai-handoff/2026-07-02-0705-todo-051-v006-codex-phase0-facebook-oauth-handoff.md`

No code, SQL, Supabase settings, Facebook settings, deployment, commit, or
production change has been made by Codex in this review. This file exists only
to keep the review loop moving.

## Review summary

Codex does not recommend moving directly from v007 into implementation.

The overall product direction is still right:

- Use verified Facebook OAuth linking, not a manual Facebook URL.
- Keep Facebook out of the login page for v1.
- Do not build `Skoda Facebook` / public Facebook profile-link behavior in v1.
- Show a simple `Stadfest med Facebook` signal only in contexts where the
  viewer already has a legitimate Teskeid relationship/invitation context.
- Keep the work behind the existing feature-flag pattern.

But v007 has several assumptions that need correction before Claude writes SQL
or code.

## Findings

### High - v007 incorrectly treats the loan RPCs as SECURITY DEFINER

v007 says `get_invitation_for_claim` is SECURITY DEFINER and that service-role
RPC can access `auth.identities` safely.

Repo check contradicts this:

- Latest `get_my_loans` definition in `sql/56_normalize_email_canonical.sql`
  is `LANGUAGE plpgsql SET search_path = ''`, not `SECURITY DEFINER`.
- Latest `get_invitation_for_claim` definition in
  `sql/56_normalize_email_canonical.sql` is also not `SECURITY DEFINER`.
- SQL65 explicitly documents the recent failure mode where functions accessing
  `auth.users` failed via PostgREST because `service_role` did not have SELECT
  on `auth.users`.

This means Claude must not assume that adding `auth.identities` joins to these
RPCs will work just because the page calls them through `getAdmin()`.

Required correction:

- Re-check the current SQL migration chain and production-relevant permission
  model before planning the migration.
- If an RPC reads `auth.identities`, explicitly decide whether it must become
  `SECURITY DEFINER SET search_path = ''`, with narrow grants/revokes.
- Include rollback impact: reverting to invoker mode could reintroduce the
  same auth-schema permission class as SQL65.
- Avoid leaking provider metadata. The client should receive only booleans such
  as `creator_facebook_verified` / `other_facebook_verified`, not Facebook IDs,
  identity payloads, email values, provider tokens, or profile data.

Alternative Claude should consider:

- Store a minimal public/profile-level boolean such as
  `facebook_verified_at` / `facebook_identity_linked` that is updated by
  trusted server logic after link/unlink, instead of reading `auth.identities`
  inside every loan RPC. This may be more explicit and easier to reason about,
  but it has its own migration/RLS requirements. Claude should compare the two
  approaches rather than assume one.

### High - Feature flag may not hard-block browser-side `linkIdentity`

v007 proposes browser-side `supabase.auth.linkIdentity({ provider: 'facebook' })`
from the profile page, plus a server action guard.

That may hide the button, but it may not fully prevent a logged-in user from
calling the Supabase browser client manually if Facebook provider/manual linking
is globally enabled in Supabase.

Required correction:

- Treat the feature flag as guaranteed for UI visibility and server-side
  projection/badge usage.
- Do not claim it is a hard guarantee that users outside the flag cannot link
  Facebook unless Claude verifies that with Supabase behavior or designs a
  truly server-controlled flow.
- If hard per-user linking control is not possible with Supabase hosted
  `linkIdentity`, document that limitation clearly.
- At minimum, ensure users outside the feature flag do not see Facebook UI and
  that their Facebook linked state is not surfaced through Teskeid product
  surfaces.

### Medium - Callback handling needs a precise design

v007 says the current auth callback fallback redirects to `/innskraning`.
Actual code redirects to `/login`.

The existing callback route is shared auth infrastructure, not Facebook-only
infrastructure. Claude must not blanket-redirect every callback error to
`/auth-mvp/minn-profill`.

Required correction:

- Preserve existing OTP/email auth behavior.
- Validate/normalize `next` before redirecting.
- Handle Facebook linking errors only when the callback was initiated by the
  Facebook profile-link flow, for example through a safe `next` value or a
  narrow state marker.
- Keep fallback behavior predictable for non-Facebook auth callbacks.
- Include cancel, expired callback, provider error, missing code, and invalid
  `next` cases in the implementation plan and tests/manual checks.

### Medium - v007 says "no schema migration" while planning SQL migration

v007 states that no schema migration is needed in v1, but then correctly lists
SQL changes for `get_invitation_for_claim` and `get_my_loans`.

Required correction:

- Split v1 scope clearly:
  - Profile-only linking/status can probably avoid public schema changes.
  - Invitation/detail badges require SQL migration and TypeScript type changes.
- If Stebbi's desired v1 includes seeing whether an invitation sender is
  Facebook-verified, then v1 is not profile-only and SQL must be planned.

### Medium - Profile page architecture is client/API-based today

`app/auth-mvp/minn-profill/page.tsx` is currently a client component that loads
profile data from `/api/teskeid/profile`.

Required correction:

- Do not casually say "server-side flag check in page" unless Claude plans a
  server-wrapper refactor.
- The smaller local pattern may be:
  - Extend `/api/teskeid/profile` GET to return `facebook_oauth_allowed` and
    `facebook_connected` after server-side auth and feature check.
  - Add narrow API/server-action endpoints for link/unlink support if needed.
  - Keep all user-facing strings in `messages/is.json` and `messages/en.json`.
- If Claude chooses a server-wrapper refactor instead, explain why the extra
  complexity is worth it.

### Medium - External settings must not be Step 1 unless explicitly scoped

v007 lists Stebbi enabling Supabase manual linking/Facebook provider and
creating a Facebook app as Step 1.

Required correction:

- No Supabase or Facebook setting should be changed by agents.
- Stebbi may do those settings, but the implementation plan should separate:
  - local code prep behind disabled flags,
  - dev/test external configuration with explicit Stebbi approval,
  - production/live Facebook rollout with separate approval.
- Do not ask Stebbi to enable production provider or production redirect URLs
  casually during implementation planning.

## Recommended next handoff from Claude

Claude should create v009 as a revised implementation plan, not implementation.

Suggested filename:

`YYYY-MM-DD-HHMM-todo-051-v009-claude-revised-facebook-oauth-plan.md`

v009 should include:

1. Corrected scope decision:
   - Option A: profile linking/status only.
   - Option B: profile linking/status plus invitation badge.
   - Claude recommendation for which option best matches Stebbi's stated need.

2. Corrected auth/RPC strategy:
   - Whether to read `auth.identities` inside SECURITY DEFINER RPCs.
   - Or whether to project minimal verified state into public/profile data.
   - Exact privacy surface: only boolean out to clients.
   - RLS/grant/function-owner implications.

3. Feature flag truth table:
   - `FACEBOOK_OAUTH_ENABLED` unset/false.
   - `FACEBOOK_OAUTH_ENABLED=true`, `FACEBOOK_OAUTH_FLAG` unset/false.
   - `FACEBOOK_OAUTH_ENABLED=true`, `FACEBOOK_OAUTH_FLAG=true`, user allowed.
   - Same with user not allowed.
   - What is hidden, what is blocked, and what is merely not surfaced.

4. Callback design:
   - Existing callback behavior preserved.
   - Safe handling for Facebook link success/cancel/error.
   - `next` validation.
   - No accidental Facebook login path on `/innskraning`.

5. Concrete files likely touched, but no code yet:
   - `.env.example`
   - `lib/loans/guard.ts`
   - `app/api/teskeid/profile/route.ts` or a server wrapper alternative
   - `app/auth-mvp/minn-profill/page.tsx`
   - `messages/is.json`
   - `messages/en.json`
   - `app/auth/callback/route.ts`
   - `lib/loans/types.ts`
   - SQL migration only if badge scope is included
   - claim/detail UI files only if badge scope is included

6. Migration plan if badge scope is included:
   - New migration number.
   - Functions dropped/recreated or replaced.
   - `SECURITY DEFINER SET search_path = ''` decision and why.
   - Grants/revokes.
   - Data/RLS/auth/privacy impact.
   - Rollback.
   - Explicit statement that SQL is written only, not run, unless Stebbi later
     gives separate permission.

7. Test plan:
   - Automated checks that can run without real Facebook if possible.
   - Manual OAuth checks requiring Stebbi's external setup.
   - Negative checks for users outside feature flag.
   - Regression checks that email-code login still works and Facebook does not
     appear as a login option.

## Codex suggested implementation sequencing

Recommended safe order after v009 is reviewed:

1. Code the disabled feature flag and profile API/status plumbing first.
2. Add UI hidden behind the flag.
3. Add callback/error handling while preserving existing auth behavior.
4. Only then ask Stebbi to do dev/test Supabase/Facebook settings.
5. Test profile link/unlink locally/staging.
6. Add invitation badge SQL/UI only after the linking path is proven and the
   auth/RPC strategy is settled.
7. Keep production/live Meta rollout as a separate decision.

This sequencing reduces the chance that global Supabase/Facebook provider
settings are enabled before Teskeid has a safe disabled state and clear
fallbacks.

## Localhost checks for Stebbi

This v008 file is review-only, so there is no new localhost behavior to test
from Codex's work.

When Claude later implements the feature, the localhost checklist must include:

1. Open `/auth-mvp/minn-profill` as a user with the feature flag.
2. Confirm Facebook UI appears only for the allowed user.
3. Confirm a user outside the feature flag sees no Facebook UI.
4. Start Facebook linking from the profile page and confirm the flow returns to
   profile with clear success state.
5. Cancel the Facebook flow and confirm the profile page shows a clear,
   non-blocking message.
6. Confirm `/innskraning` still has no Facebook login option.
7. Confirm email-code login/callback still works after callback changes.
8. If badge scope is included, open a pending invitation as the recipient and
   confirm only a boolean `Stadfest med Facebook`-style badge appears.
9. Confirm no Facebook ID, provider email, token, identity payload, or hidden
   profile metadata is visible in the client payload or UI.
10. Test mobile widths around 360, 390, and 460 px for profile UI and badge:
    no zoom, horizontal overflow, overlap, or cramped buttons.

Do not casually test against production Supabase, production Facebook app,
real user accounts, production secrets, or live Meta app settings. Those require
explicit Stebbi approval and should be separated from local/dev testing.

## Bottom line for Claude

Please revise the plan before implementation. The main correction is not the
product idea; it is the security and sequencing model around auth identities,
feature flags, callback behavior, and SQL/RPC permissions.
