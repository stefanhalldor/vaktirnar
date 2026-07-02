# TODO #51 - Codex v010 - Option A MVP handoff

Created: 2026-07-02 21:51
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Scope decision handoff for Claude Code

Relevant prior handoff:

- `ai-handoff/2026-07-02-1655-todo-051-v009-claude-revised-facebook-oauth-plan.md`
- `ai-handoff/2026-07-02-1646-todo-051-v008-codex-v007-review-handoff.md`

No code, SQL, Supabase settings, Facebook settings, deployment, commit, or
production change has been made by Codex in this handoff. This file is only to
continue the review/planning loop.

## Stebbi decision

Stebbi prefers the MVP to be **Option A - profile-only Facebook OAuth linking**
while the Facebook/Meta App Review path is being clarified or processed.

That means:

- Build Facebook linking on `Minn profill`.
- Let the logged-in user see their own connected/disconnected Facebook status.
- Keep Facebook out of the login page.
- Do not add the loan invitation / loan detail badge in the first
  implementation pass.
- Do not write SQL 66 in the first implementation pass.
- Do not change loan RPCs or loan types in the first implementation pass.

Phase 2 can add the `Stadfest med Facebook` badge in loan/invitation context
after review implications are verified.

## Change requested to v009

v009 recommends Option B as the full v1 scope while sequencing A before B.
Codex now recommends that Claude revise the implementation plan so the actual
MVP is only Option A.

The Phase 2 badge should remain documented as a planned follow-up, but it
should not be bundled into the first implementation approval.

## App Review / Meta scope note

Codex attempted to verify the current Meta documentation through the available
web tooling, but the search/open results did not return usable official docs in
this session. Therefore, do not treat any App Review conclusion here as a
current official Meta rule.

Before Stebbi submits to Meta App Review, Claude/Stebbi should verify the
current official Meta/Facebook Login requirements directly in Meta for
Developers.

Working assumption for planning:

- Adding a later Teskeid badge that uses the same already-approved Facebook
  connection boolean should be lower risk than requesting new Facebook
  permissions or exposing new Facebook metadata.
- However, if the original review submission describes the use too narrowly
  as "only visible to the profile owner", then a later badge visible to loan
  counterparties may create a disclosure/review ambiguity.

Safer wording direction for review/privacy copy:

- Describe the current MVP accurately: the user connects Facebook on their own
  profile and sees their own verified connection state.
- Avoid wording that promises the Facebook connection will never be shown in
  Teskeid relationship/loan contexts.
- If Meta review permits, privacy/user-facing disclosure can be broad enough
  to allow a future simple verified badge in loan/invitation context, without
  claiming Phase 2 exists before it is implemented.

Claude should not submit anything to Meta or change app settings. Stebbi owns
those external actions.

## Revised Phase 1 scope - implement only Option A

Phase 1 files likely touched:

- `.env.example`
- `lib/loans/guard.ts`
- `app/api/teskeid/profile/route.ts`
- `app/auth-mvp/minn-profill/page.tsx`
- `app/auth/callback/route.ts`
- `messages/is.json`
- `messages/en.json`
- tests if local patterns exist and are practical

Phase 1 files that should **not** be touched:

- No SQL migration.
- No `sql/66_*`.
- No `lib/loans/types.ts` badge fields.
- No `get_my_loans` changes.
- No `get_invitation_for_claim` changes.
- No `app/auth-mvp/lanad-og-skilad/claim/[id]/page.tsx` badge changes.
- No `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` badge changes.

## Phase 1 behavior

Feature flag:

- Add `facebook-oauth` using the existing feature-flag pattern.
- Disabled by default.
- Flag controls UI visibility and Teskeid server-side profile responses.
- Continue to document that it is not a hard Supabase-level block if Facebook
  provider/manual linking is globally enabled.

Profile API:

- Extend the current profile API pattern rather than refactoring the whole page
  to a server component.
- GET should return:
  - existing `display_name`
  - existing `email`
  - `facebook_oauth_allowed`
  - `facebook_connected`
- `facebook_connected` can be derived from the logged-in user's
  `user.identities` when the feature is allowed.
- For users outside the feature flag, return
  `facebook_oauth_allowed: false` and `facebook_connected: false`.

Profile UI:

- Show a compact Facebook section only when `facebook_oauth_allowed` is true.
- Show connected/disconnected status.
- Provide `Tengja Facebook` and `Aftengja Facebook` flows.
- Include pending/error states.
- Keep all user-facing copy in `messages/is.json` and `messages/en.json`.
- Follow `Design.md`: mobile-first, no overlap, no horizontal overflow, no
  nested card feeling, and no marketing-style hero/promo block.

Callback:

- Preserve existing email-code auth behavior.
- Add Facebook-specific error handling only when the callback was clearly
  initiated by the profile-link flow.
- Validate `next` as a relative path and reject unsafe external-style values.
- Do not add Facebook to `/innskraning`.

Scopes:

- Request the minimal Facebook scopes needed for linking.
- Since Teskeid already has the user's email through email-code auth, Claude
  should verify whether Facebook `email` scope is actually needed before
  recommending it.
- Do not use Facebook profile URL, avatar, friend data, or provider metadata in
  Phase 1.

## Phase 2 parking lot - badge after review clarification

Phase 2 remains desirable product-wise:

- A loan/invitation recipient could see a simple boolean badge that the sender
  has a verified Facebook connection.
- The badge should not expose Facebook ID, Facebook email, avatar URL, tokens,
  raw identity metadata, or a Facebook profile link.

But Phase 2 should wait until:

1. Phase 1 linking is proven locally/staging.
2. Stebbi verifies the Meta App Review/disclosure implications.
3. Codex reviews a dedicated Phase 2 SQL/RLS plan.
4. Stebbi gives separate implementation permission.

When Phase 2 reopens, Claude can revisit the v009 idea of a
`profiles.facebook_verified_at` projection, but that is intentionally out of
Phase 1.

## Risks to keep visible

- `linkIdentity` behavior is still Supabase-dependent and must be manually
  tested.
- `unlinkIdentity` must be tested with the existing email OTP identity plus
  Facebook identity.
- Feature flag cannot necessarily prevent a determined logged-in user from
  invoking Supabase auth linking directly if the provider is globally enabled.
- Meta review requirements may change and must be verified from official docs
  before submission.
- User-facing disclosure should not imply "only you can ever see this" if
  Teskeid plans to later show a simple verified badge to loan counterparties.

## Suggested next Claude handoff

Claude should produce a v011 revised implementation plan for **Phase 1 only**.

Suggested filename:

`YYYY-MM-DD-HHMM-todo-051-v011-claude-option-a-phase1-plan.md`

That plan should:

1. Remove SQL 66 from Phase 1.
2. Remove loan badge files from Phase 1.
3. Keep feature flag + profile API + profile UI + callback hardening.
4. Include a minimal-scope Facebook permissions note.
5. Include exact copy keys needed in `messages/is.json` and `messages/en.json`.
6. Include tests/manual checks for link, unlink, cancel, callback failure, and
   login regression.
7. Include a clear note that Supabase/Facebook dashboard changes are Stebbi-only
   and require separate approval.

## Localhost checks for Stebbi

This v010 file is planning-only, so there is no new localhost behavior to test
from Codex's work.

When Claude implements Phase 1, Stebbi should test:

1. With the Facebook feature flag off, open `/auth-mvp/minn-profill` and confirm
   no Facebook UI appears.
2. With the feature flag on for Stebbi's test user, open `/auth-mvp/minn-profill`
   and confirm a compact Facebook status section appears.
3. Confirm the section says the account is not connected before linking.
4. Click `Tengja Facebook` and confirm the OAuth flow starts from the profile
   page only.
5. Complete OAuth as an allowed Facebook test user and confirm the return lands
   back on `/auth-mvp/minn-profill`.
6. Confirm the profile page shows connected status after return and after
   refresh.
7. Test OAuth cancel and confirm a clear non-blocking error/status appears on
   the profile page.
8. Click `Aftengja Facebook` and confirm the status changes back to disconnected.
9. Open `/innskraning` and confirm no Facebook login option exists.
10. Confirm normal email-code login still works after callback changes.
11. Log in as a user outside the feature flag and confirm they see no Facebook
    profile section.
12. Test mobile widths around 360, 390, and 460 px: no zoom, no horizontal
    overflow, no overlapping text/buttons, and stable button width during
    pending states.

Do not test against production Supabase secrets, production Facebook app
settings, real user accounts, live Meta review settings, or production redirect
URLs without explicit Stebbi approval.

## Bottom line

Proceed toward Option A as the MVP. Treat the loan/invitation badge as Phase 2,
not as part of the first implementation. Keep the App Review/disclosure text
future-aware enough that Phase 2 is not boxed out, but verify the current Meta
rules before any real submission.
