# TODO #51 - Codex v016 - Stebbi next steps for per-user gated Facebook OAuth

Created: 2026-07-02 23:37
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Next-steps handoff for Stebbi and Claude Code

Refs:
- `ai-handoff/2026-07-02-2245-todo-051-v015-claude-phase1-prerelease.md`
- `ai-handoff/2026-07-02-2230-todo-051-v014-codex-v013-prerelease-review.md`
- `sql/66_feature_access_facebook_oauth.sql`

---

## Decision locked by Stebbi

Stebbi specifically wants **per-user gating** for Facebook OAuth.

That means the MVP must use this mode:

```txt
FACEBOOK_OAUTH_ENABLED=true
FACEBOOK_OAUTH_FLAG=true
feature_access row exists for Stebbi with feature_key = 'facebook-oauth'
```

The global-open mode is not the chosen MVP path.

---

## Codex review status of v015

Codex reviewed the v015 handoff and inspected the relevant v015 changes:

- `sql/66_feature_access_facebook_oauth.sql`
- `app/api/admin/feature-access/route.ts`
- `lib/__tests__/guard.test.ts`
- `lib/__tests__/legacy-guard.test.ts`
- `lib/__tests__/teskeid-profile-route.test.ts`

Codex also ran:

```txt
npm run test:run
```

Result:

```txt
Exit code: 0
43 test files passed
1399 passed | 22 skipped | 8 todo
```

Codex also ran:

```txt
npm run type-check
```

Result:

```txt
Exit code: 0
tsc --noEmit passed
```

No TypeScript or automated test blocker remains from the v014 findings.

---

## What v015 fixed

### Fixed: DB constraint for `facebook-oauth`

Claude Code added:

- `sql/66_feature_access_facebook_oauth.sql`

It widens `feature_access_feature_key_check` from:

```txt
('umonnun', 'tengsl')
```

to:

```txt
('umonnun', 'tengsl', 'facebook-oauth')
```

The migration has not been run.

### Fixed: admin API allow-list

Claude Code updated:

- `app/api/admin/feature-access/route.ts`

`facebook-oauth` is now accepted by the admin feature-access API.

Important: Codex did not see an admin page UI section added for
`facebook-oauth`. Current setup appears to rely on the admin API, not a visible
admin UI row, unless Claude Code adds that separately.

### Fixed: legacy callback test

Claude Code updated the legacy guard test so `/auth/callback` is not treated as
legacy UI. This matches the OAuth callback requirement.

### Improved: tests

Claude Code added tests for:

- `checkFeatureAccess('facebook-oauth')`
- per-user `FACEBOOK_OAUTH_FLAG=true`
- profile API Facebook fields
- updated callback/middleware behavior

---

## Stebbi's next steps

### Step 1 - Decide whether Claude Code should add admin UI or use API setup

Because per-user gate is required, Stebbi must have a way to add a
`feature_access` row for:

```txt
feature_key = facebook-oauth
email = Stebbi's login email
```

There are two reasonable paths:

1. **Ask Claude Code to add a Facebook section to the existing admin feature
   access UI.**
   This is more comfortable and less error-prone.

2. **Use the existing admin API directly.**
   This is smaller, but Stebbi needs an exact safe instruction from Claude Code
   for how to call:
   `POST /api/admin/feature-access?feature=facebook-oauth`

Codex recommendation:

Ask Claude Code to add the small admin UI section unless time pressure is high.
It matches the existing `umonnun` / `tengsl` pattern and makes future toggling
less fragile.

Do not run random SQL inserts manually unless Claude Code gives a reviewed,
project-specific setup instruction.

---

### Step 2 - Review and approve SQL 66 before it is run

SQL 66 is required for per-user gating. Without it, the database rejects
`feature_key = 'facebook-oauth'`.

File:

```txt
sql/66_feature_access_facebook_oauth.sql
```

What it does:

- Drops the old `feature_access_feature_key_check`.
- Adds it back with `facebook-oauth` included.
- Does not touch data, RLS, grants, policies, functions, auth users, or loan
  data.

What it does not do:

- It does not enable Facebook OAuth.
- It does not expose users publicly.
- It does not add Stebbi to the feature flag.
- It does not configure Supabase or Facebook.

Stebbi action:

- Review the SQL.
- If acceptable, give explicit approval for running this migration in the
  chosen Supabase environment.

Important:

Neither Codex nor Claude Code should run this migration unless Stebbi explicitly
asks.

---

### Step 3 - Add Stebbi to `feature_access` for `facebook-oauth`

After SQL 66 is run, add Stebbi's email to `feature_access` for:

```txt
facebook-oauth
```

Preferred path:

- Use the admin UI if Claude Code adds a Facebook section.

Fallback path:

- Use the admin API, but only with a precise instruction from Claude Code.

Do not skip this step if `FACEBOOK_OAUTH_FLAG=true`; otherwise the Facebook
section should correctly stay hidden from Stebbi.

---

### Step 4 - Configure local env for per-user gate

For local testing, use:

```txt
AUTH_MVP_ENABLED=true
FACEBOOK_OAUTH_ENABLED=true
FACEBOOK_OAUTH_FLAG=true
```

Stebbi runs the dev server. Codex and Claude Code should not start, stop, or
restart it unless Stebbi explicitly asks.

---

### Step 5 - Configure Supabase/Facebook only after code review is accepted

These are external settings and should be done deliberately:

1. Supabase Dashboard:
   - Enable linked identities / multiple OAuth credentials if required.
2. Supabase Dashboard:
   - Enable Facebook provider.
   - Add Facebook App ID and App Secret.
3. Facebook Developer App:
   - Create/configure app.
   - Add Facebook Login product.
   - Configure callback URL:
     `https://<project-ref>.supabase.co/auth/v1/callback`

Do not put App Secret or tokens in client code, Markdown handoff files, logs, or
messages.

---

## What to ask Claude Code next

Suggested instruction for Stebbi to send Claude Code:

```txt
Claude Code, út frá v015/v016: staðfestu að Phase 1 sé per-user gated, ekki global-open. Bættu annaðhvort við litlum admin UI kafla fyrir facebook-oauth í feature_access admin eða skilaðu mjög nákvæmri og öruggri API-leið fyrir Stebba til að bæta sínu netfangi við. Ekki keyra SQL, ekki breyta Supabase/Facebook stillingum, ekki commit-a, push-a eða deploya.
```

If Stebbi wants Claude Code to implement the admin UI section, make that
explicit:

```txt
Claude Code, framkvæmdu litla admin UI viðbót fyrir facebook-oauth feature_access þannig að per-user gate sé hægt að stjórna eins og umonnun/tengsl. Ekki keyra SQL, ekki breyta Supabase/Facebook stillingum, ekki commit-a, push-a eða deploya.
```

---

## Localhost checks for Stebbi

Run these only after:

1. v015 code changes are accepted.
2. SQL 66 has been run in the intended Supabase environment.
3. Stebbi has a `feature_access` row for `facebook-oauth`.
4. Local env uses:

```txt
AUTH_MVP_ENABLED=true
FACEBOOK_OAUTH_ENABLED=true
FACEBOOK_OAUTH_FLAG=true
```

Checks:

1. Log in as Stebbi.
2. Open `/auth-mvp/minn-profill`.
3. Expected: Facebook section is visible.
4. Confirm initial state says not connected.
5. Open another user who is not in `feature_access`.
6. Expected: Facebook section is hidden.
7. Try `/innskraning`.
8. Expected: no Facebook login option appears.
9. Complete normal OTP login.
10. Expected: OTP flow still works.
11. If Supabase/Facebook provider settings are ready, click `Tengja Facebook`.
12. Expected: button enters pending state and redirects to Facebook/Supabase
    OAuth.
13. Complete OAuth with a Facebook test user.
14. Expected: return to `/auth-mvp/minn-profill` and state becomes connected.
15. Refresh page.
16. Expected: connected state persists.
17. Click disconnect.
18. Expected: state returns to not connected.
19. Test OAuth cancel.
20. Expected: user returns to profile with error state, not `/login`.
21. Mobile widths 360, 390, and 460 px:
    - no horizontal scroll
    - no text overlap in Facebook row
    - no zoom after focusing profile fields
    - button width stays stable during pending text

Do not test against production users, production Facebook app live mode, or
production secrets casually. Meta App Review and production rollout are separate
steps.

---

## Remaining risks / not solved in Phase 1

- Feature flag controls Teskeið UI/API behavior, but it is not a hard Supabase
  provider block. A technically skilled user may still be able to trigger
  `linkIdentity` directly if Facebook provider is globally enabled.
- Actual Supabase/Facebook OAuth runtime behavior still needs manual testing
  with real provider settings.
- Meta App Review is still a separate production readiness task.
- Phase 2 loan-card badge is intentionally not included.
- `TODO.md` has unrelated planning changes in the dirty worktree; do not mix
  them accidentally into the same release commit unless Stebbi chooses that.

---

## Codex recommendation

Proceed with per-user gate, but do not make Stebbi manage the gate through a
manual SQL insert. Either add the small admin UI section or have Claude Code
provide one exact admin-API setup path.

After that, the next irreversible step is SQL 66. Treat it as a deliberate
Supabase migration approval, even though the migration itself is small.
