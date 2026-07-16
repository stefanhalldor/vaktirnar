# TODO 086 v206 - Codex review of v205 Claude flag rename

Created: 2026-07-15 10:00  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Reviewed handoff: `2026-07-15-0958-todo-086-v205-claude-flag-rename.md`

## Findings

### High - Claude handoff still tells Stebbi to disable public weather

`ai-handoff/2026-07-15-0958-todo-086-v205-claude-flag-rename.md:86-88`

The Vercel block says:

```env
WEATHER_PUBLIC_ENABLED=false  # eða eyða
```

That contradicts Stebbi's latest clarified requirement: everyone, including public/guest users, should see the current MET/Yr forecast. The correct production target for the current desired rollout is:

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

Impact: if Stebbi follows Claude's Vercel block as written, public MET/Yr weather will be closed even though the product decision is to open it.

Recommendation: Claude should amend the handoff/release checklist before Stebbi changes Vercel. Do not use the v205 Vercel block as-is.

### Medium - `WEATHER_AUTH_ACCESS_REQUIRED=false` does not override stale legacy `WEATHER_FLAG=true`

`lib/loans/guard.ts:74-78`

Current code:

```ts
const weatherAuthAccessRequired =
  process.env.WEATHER_AUTH_ACCESS_REQUIRED === 'true' ||
  process.env.WEATHER_FLAG === 'true'
if (!weatherAuthAccessRequired) return true
```

This preserves legacy behavior, but it means a stale Vercel `WEATHER_FLAG=true` will still force per-user auth access even if Stebbi explicitly sets:

```env
WEATHER_AUTH_ACCESS_REQUIRED=false
```

This is not a security leak; it fails closed. But it undermines the new model where the new flag should be the source of truth and legacy vars should be fallback only.

Recommendation:

```ts
const weatherAuthAccessRequired =
  process.env.WEATHER_AUTH_ACCESS_REQUIRED === undefined
    ? process.env.WEATHER_FLAG === 'true'
    : process.env.WEATHER_AUTH_ACCESS_REQUIRED === 'true'
```

Add a test for:

```env
WEATHER_AUTH_ACCESS_REQUIRED=false
WEATHER_FLAG=true
```

Expected: open to all authenticated users, because the new explicit value wins.

### Medium - Provider legacy wording says "alias", but legacy value is effectively ignored

`lib/loans/guard.ts:92-98`  
`.env.example:50-53`  
`ai-handoff/2026-07-15-0958-todo-086-v205-claude-flag-rename.md:38-45`

Current provider code:

```ts
const vedurstofanAccessRequired =
  process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED !== 'false'
```

This is product-safe because default is restricted. But `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` is no longer actually read. The handoff and `.env.example` describe it as a legacy alias, which can be misleading:

- old `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` does not change anything, because new default is already restricted.
- old `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=false` no longer disables anything.

Given Stebbi's latest decision that a separate kill switch is unnecessary, this behavior may be acceptable. The wording should be tightened so Stebbi does not think the old variable still controls behavior.

Recommendation: say "legacy variable is no longer needed; remove it after deploy verification" rather than "legacy alias".

### Low - Admin UI copy is mostly okay, but should mention "access-required" semantics

`app/(admin)/admin/page.tsx:228-233` and `app/(admin)/admin/page.tsx:1655-1674`

The admin feature access sections now show the new flag names, which is good. The generic copy says:

```text
Stjórnar hverjir sjá þetta þegar FLAG=true.
```

That is acceptable for the two new access-required flags, but the wording could be clearer:

```text
Þessi listi gildir þegar FLAG=true / access required er virkt.
```

This is not a release blocker.

## What Looks Good

- `lib/loans/guard.ts` keeps `WEATHER_ENABLED` as master switch.
- Public MET/Yr remains controlled separately by `WEATHER_PUBLIC_ENABLED` in the travel route.
- Veðurstofan provider defaults restricted, which avoids accidental provider rollout.
- `weather-provider-vedurstofan` remains its own feature key in admin API.
- Travel route checks provider access via `checkFeatureAccess(..., 'weather-provider-vedurstofan')`.
- Freshness/refresh endpoints also use the same provider access guard and remain authenticated-only.
- `.env.example` now documents the new names.
- Guard tests cover the main new happy paths.

## Release Recommendation

Do not release based on the v205 handoff text exactly as written.

Release is okay after either:

1. Claude amends the Vercel checklist to keep `WEATHER_PUBLIC_ENABLED=true`, and Stebbi is careful to remove old `WEATHER_FLAG` before relying on `WEATHER_AUTH_ACCESS_REQUIRED=false`; or
2. Claude applies the small precedence fix so new `WEATHER_AUTH_ACCESS_REQUIRED` wins when present.

Codex preference: apply the precedence fix now. It is small, makes the new model honest, and prevents another round of Vercel confusion.

## Correct Production Env Target

For Stebbi's desired initial production behavior:

```env
AUTH_MVP_ENABLED=true

WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true

WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true

WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_TRIP_FLAG=true
WEATHER_AI_ENABLED=false

METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
WEATHER_MAP_PROVIDER=google
CRON_SECRET=...
NEXT_PUBLIC_SITE_URL=https://teskeid.is
```

Remove after new deployment is verified:

```env
WEATHER_FLAG
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
```

## Suggested Follow-Up For Claude

Small patch:

1. In `lib/loans/guard.ts`, make new `WEATHER_AUTH_ACCESS_REQUIRED` win over old `WEATHER_FLAG` when present.
2. Update `.env.example` wording so legacy provider env is not described as a real alias if code does not read it.
3. Update `2026-07-15-0958-todo-086-v205-claude-flag-rename.md` or produce a v207 note with corrected Vercel target.
4. Add guard tests for conflict precedence:
   - `WEATHER_AUTH_ACCESS_REQUIRED=false` + `WEATHER_FLAG=true` => open authenticated.
   - `WEATHER_AUTH_ACCESS_REQUIRED=true` + `WEATHER_FLAG=false` => requires access.
5. Re-run focused tests and typecheck.

Suggested commands:

```bash
npm run test:run -- lib/__tests__/guard.test.ts
npm run test:run -- lib/__tests__/weather-travel-api.test.ts
npm run type-check
```

## Localhost Checks For Stebbi

After Claude's follow-up and after Stebbi restarts localhost manually:

1. Public MET/Yr:
   - Env: `WEATHER_ENABLED=true`, `WEATHER_PUBLIC_ENABLED=true`.
   - Open the public weather flow as signed-out/guest.
   - Expected: MET/Yr forecast works.
   - Expected: no Veðurstofan provider controls.

2. Auth weather gated:
   - Env: `WEATHER_AUTH_ACCESS_REQUIRED=true`.
   - User without `vedrid`: `/auth-mvp/vedrid` blocked.
   - User with `vedrid`: `/auth-mvp/vedrid` opens.

3. Veðurstofan gated:
   - Env: `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`.
   - User with `vedrid` but without `weather-provider-vedurstofan`: MET/Yr only.
   - User with both rows: Veðurstofan layer appears.

4. Future graduation test:
   - Env: `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false`.
   - Auth weather user without provider row should see Veðurstofan.
   - Put it back to `true` after testing.

5. Legacy conflict test:
   - Temporarily set `WEATHER_AUTH_ACCESS_REQUIRED=false` and `WEATHER_FLAG=true`.
   - Expected after precedence fix: auth weather is open to authenticated users.
   - If still gated, the stale legacy var is still winning and should not be trusted in Vercel.

Do not change Vercel production vars casually. Vercel env changes require redeploy and affect real users.

## Commands Run By Codex

Read-only:

- `Get-Content` on Claude v205 handoff.
- `git status --short`.
- `git diff --stat`.
- Focused `git diff` for:
  - `lib/loans/guard.ts`
  - `.env.example`
  - `app/(admin)/admin/page.tsx`
  - `lib/__tests__/guard.test.ts`
  - `lib/__tests__/weather-travel-api.test.ts`
- Focused `rg` for weather flag references.
- Focused line reads from guard, admin UI, feature-access API, travel route, freshness route, refresh route.

Codex did not run tests and did not change app code, SQL, migrations, Vercel, Supabase, commits, pushes, or deploys.

## Uncertainty

The worktree is very large and dirty, with many unrelated TODO 086 files and weather files modified. This review intentionally focused on the flag rename area and provider access gates, not the entire weather diff.
