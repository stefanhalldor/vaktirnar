# TODO 086 v205 - Codex handoff: rename weather flags to access-required model

Created: 2026-07-15 09:42  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Intended recipient: Claude Code  
Status: Plan/handoff only. No code, SQL, migration, commit, push, deploy, or production change was performed by Codex.

## Context

Stebbi clarified the desired release model:

- Everyone, including public/guest users, should be able to see the current MET/Yr forecast.
- Only selected users should see Veðurstofan while it is still in testing.
- Vegagerðin should follow the same pattern when added.
- Stebbi does not need a separate provider kill switch right now. It is enough to be able to put a provider back behind per-user access, then remove access rows from everyone except testers.
- The current env names are confusing:
  - `WEATHER_FLAG=true` sounds like it enables weather, but it actually means "authenticated `/auth-mvp/vedrid` requires per-user `vedrid` access".
  - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` sounds like it globally enables Veðurstofan, but current code still requires per-user `weather-provider-vedurstofan` access.

Codex recommendation: change the flag model before release so the names describe the behavior.

## Proposed new flag model

Use "access required" naming instead of generic "flag" or "enabled" naming.

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true

WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true
```

Meaning:

| Env var | Meaning |
| --- | --- |
| `WEATHER_ENABLED` | Master weather feature switch. If false/missing, weather is off. |
| `WEATHER_PUBLIC_ENABLED` | Public/guest MET/Yr forecast is available. |
| `WEATHER_AUTH_ACCESS_REQUIRED` | Authenticated `/auth-mvp/vedrid` requires `feature_access = vedrid`. |
| `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` | Veðurstofan provider requires `feature_access = weather-provider-vedurstofan`. |
| `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` | Future Vegagerðin provider requires `feature_access = weather-provider-vegagerdin`. |

This gives Stebbi the future release path:

- While provider is in testing: `*_ACCESS_REQUIRED=true`.
- When provider is ready for everyone: `*_ACCESS_REQUIRED=false`.
- If provider needs rollback after wider release: set `*_ACCESS_REQUIRED=true` again and remove access rows from non-testers.

No separate `*_ENABLED` kill switch is needed for this product phase.

## Important default behavior

Avoid accidental public rollout of experimental providers.

For providers, default should be restricted unless explicitly released:

```ts
const vedurstofanAccessRequired =
  process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED !== 'false'
```

So:

- missing env var => restricted/per-user
- `true` => restricted/per-user
- `false` => open to all weather users

For the authenticated weather page, preserve existing behavior unless the new var is explicitly set:

```ts
const weatherAuthAccessRequired =
  process.env.WEATHER_AUTH_ACCESS_REQUIRED === 'true' ||
  process.env.WEATHER_FLAG === 'true'
```

This keeps backward compatibility during rollout.

## Backward compatibility requirement

Do not break existing Vercel/local setups in the same deployment that introduces the new names.

For one transition period:

- `WEATHER_AUTH_ACCESS_REQUIRED=true` and legacy `WEATHER_FLAG=true` should both require `vedrid`.
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` and legacy `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` should both require `weather-provider-vedurstofan`.
- If `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false`, that should intentionally graduate Veðurstofan to all weather users even if the old `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` exists.

Recommended helper semantics:

```ts
function isExplicitFalse(value: string | undefined) {
  return value === 'false'
}

function isTrue(value: string | undefined) {
  return value === 'true'
}
```

For Veðurstofan:

```ts
const newValue = process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
const legacyValue = process.env.WEATHER_PROVIDER_VEDURSTOFAN_ENABLED

const accessRequired =
  newValue === undefined
    ? legacyValue === 'true'
    : newValue !== 'false'
```

Then:

```ts
if (process.env.WEATHER_ENABLED !== 'true') return false
if (!accessRequired) return true
return checkPerUserAccess(email, 'weather-provider-vedurstofan')
```

This preserves today's behavior when only `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` is set, but gives Stebbi the new explicit graduation path with `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false`.

## Files Claude Code should inspect/change

Likely code/docs/test updates:

- `lib/loans/guard.ts`
  - Replace `WEATHER_FLAG` logic for `vedrid` with `WEATHER_AUTH_ACCESS_REQUIRED`, with legacy fallback.
  - Replace `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` logic with `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`, with legacy fallback.
  - Keep `WEATHER_ENABLED` as master switch.
  - Keep `WEATHER_PUBLIC_ENABLED` separate.
  - Keep `WEATHER_ELTA_VEDRID_FLAG` and `WEATHER_TRIP_FLAG` for now unless Claude has a very small and safe rename plan. Do not rename everything in one risky sweep.

- `lib/__tests__/guard.test.ts`
  - Update tests for `vedrid` to cover:
    - `WEATHER_AUTH_ACCESS_REQUIRED=true` requires feature_access row.
    - `WEATHER_AUTH_ACCESS_REQUIRED=false` opens authenticated weather.
    - legacy `WEATHER_FLAG=true` still works during transition.
  - Update tests for `weather-provider-vedurstofan` to cover:
    - missing new env + legacy enabled true => per-user required, same as today.
    - new env `true` => per-user required.
    - new env `false` => open to weather users, no per-user row required.
    - `WEATHER_ENABLED=false` still fails closed.

- `app/(admin)/admin/page.tsx`
  - Current admin UI shows:
    - `flagName="WEATHER_FLAG"`
    - `flagName="WEATHER_PROVIDER_VEDURSTOFAN_ENABLED"`
  - Update displayed flag names/copy to:
    - `WEATHER_AUTH_ACCESS_REQUIRED`
    - `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`
  - Make copy clear that these flags mean "requires per-user access", not "turn feature on".

- `.env.example`
  - Replace/comment old names with new names.
  - Keep a short migration note:
    - `WEATHER_FLAG` is legacy alias for `WEATHER_AUTH_ACCESS_REQUIRED`.
    - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` is legacy alias for `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` during transition.
  - Remove `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` if it still appears. Current repo search indicates it is not runtime code anymore but historical handoffs mention it heavily.

- `app/api/teskeid/weather/travel/route.ts`
  - Confirm it does not directly read the old provider env var. It should rely on `checkFeatureAccess(..., 'weather-provider-vedurstofan')`.

- `app/api/teskeid/weather/vedurstofan/freshness/route.ts`
- `app/api/teskeid/weather/vedurstofan/refresh/route.ts`
  - Confirm both still rely on `weather-provider-vedurstofan` access via guard/check helper.
  - They should not become public just because `WEATHER_PUBLIC_ENABLED=true`.

- Search whole repo:
  - `WEATHER_FLAG`
  - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`
  - `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`
  - `weather-provider-vedurstofan`

Do not edit old historical handoff files except if Claude is explicitly asked to clean documentation history. Old handoff references are archive records and can remain stale.

## Vercel production target after this rename

To match Stebbi's intended initial production behavior:

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
```

Required production URL/secrets:

```env
NEXT_PUBLIC_SITE_URL=https://teskeid.is
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_MAPS_SERVER_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
```

Remove from Vercel after code supports the new names and deploy is verified:

```env
WEATHER_FLAG
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
```

During the transition deployment, it is okay to keep legacy vars briefly, but the new vars should be the source of truth once verified.

## Feature access rows after rename

For selected testers:

```text
vedrid
weather-provider-vedurstofan
elta-vedrid
ferdalagid
```

Future:

```text
weather-provider-vegagerdin
```

No SQL migration should be needed for this rename if no new feature key is introduced now. A future Vegagerðin feature key may require a feature_access CHECK migration if the table still restricts feature keys.

## Expected product behavior after rename

With the production target above:

- Public users can use the public MET/Yr weather flow.
- Public users do not see Veðurstofan.
- Public users do not see Vegagerðin as an available provider, except possibly neutral marketing/copy if intentionally public.
- Authenticated users without `vedrid` do not access `/auth-mvp/vedrid`.
- Authenticated users with `vedrid` but without `weather-provider-vedurstofan` see MET/Yr only.
- Authenticated users with both `vedrid` and `weather-provider-vedurstofan` see the Veðurstofan testing layer.
- Elta veðrið remains behind `elta-vedrid`.

## Security and release risks

### Risk 1 - accidentally opening Veðurstofan to public

If Claude implements `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false` as default, then missing env could open Veðurstofan. Do not do that.

Provider access should default to restricted unless explicitly set to `false`.

### Risk 2 - public MET/Yr path and auth path are different

`WEATHER_PUBLIC_ENABLED=true` opens public MET/Yr. It should not imply access to auth-only controls, manual refresh, Veðurstofan freshness, or station validation.

### Risk 3 - old admin copy may mislead Stebbi

Admin page currently says which feature rows matter when old flags are true. Update the displayed flag names and copy so Stebbi can reason about Vercel without rereading code.

### Risk 4 - stale old env vars in Vercel

If both old and new variables exist, code precedence must be explicit. Recommendation:

1. New `*_ACCESS_REQUIRED` vars win when present.
2. Legacy vars are fallback only when new vars are missing.

This makes the migration controllable.

## Suggested implementation steps for Claude Code

1. Search and read all current references to:
   - `WEATHER_FLAG`
   - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`
   - `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`
2. Update `lib/loans/guard.ts` with small helper logic and backward compatibility.
3. Update guard tests first or alongside code.
4. Update admin UI flag names/copy.
5. Update `.env.example`.
6. Confirm travel/freshness/refresh routes still get provider access through `checkFeatureAccess`.
7. Run focused tests and typecheck.
8. Hand back to Codex before Stebbi changes Vercel production vars.

## Suggested tests/commands

Run at minimum:

```bash
npm run test:run -- lib/__tests__/guard.test.ts
npm run test:run -- lib/__tests__/weather-travel-api.test.ts
npm run type-check
```

If the test runner does not accept file arguments in this repo, run:

```bash
npm run test:run
npm run type-check
```

No migration should be run for this rename.

## Localhost checks for Stebbi

After Claude implements this and Stebbi restarts localhost manually:

1. Set local env to:

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_TRIP_FLAG=true
```

2. Open the public weather flow.
   - Expected: public/guest user can see MET/Yr forecast.
   - Expected: public/guest user does not see Veðurstofan provider or manual Veðurstofan refresh controls.

3. Log in as a user without `vedrid`.
   - Expected: public MET/Yr still works.
   - Expected: `/auth-mvp/vedrid` is blocked or redirects.

4. Log in as a user with `vedrid` but without `weather-provider-vedurstofan`.
   - Expected: authenticated weather flow works with MET/Yr.
   - Expected: no Veðurstofan provider layer.

5. Log in as a user with `vedrid` and `weather-provider-vedurstofan`.
   - Expected: Veðurstofan provider layer is visible.
   - Expected: manual refresh/freshness UI works only for this allowed user.

6. Temporarily set:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false
```

Restart localhost manually.

   - Expected: Veðurstofan becomes available to weather users without requiring the provider access row.
   - This is the future "graduate provider to everyone" path. Do not use this production setting yet.

7. Set it back:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

Restart localhost manually.

   - Expected: Veðurstofan goes back to per-user restricted mode.

Do not test production Vercel env changes casually. Vercel env changes require redeploy and can affect real users.

## Óvissa / þarf að staðfesta

- Codex did not inspect every route in full in this handoff, only the known guard/admin/test snippets plus repo search. Claude should still do a full `rg` before editing.
- The exact `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` implementation can wait until Vegagerðin provider code exists. For this step it may be enough to document it in `.env.example` and handoff, unless Claude sees a small safe place to add the future key.
- If Stebbi wants `WEATHER_AUTH_ACCESS_REQUIRED=false` later, that should be a deliberate release decision for authenticated `/auth-mvp/vedrid`, not part of this rename.
