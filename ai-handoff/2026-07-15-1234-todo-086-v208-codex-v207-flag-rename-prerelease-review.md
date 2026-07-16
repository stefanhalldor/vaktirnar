# Codex review: v207 flag rename prerelease

Created: 2026-07-15 12:34
Timezone: Atlantic/Reykjavik
TODO: todo-086
Reviewed handoff: `2026-07-15-1231-todo-086-v207-claude-flag-rename-prerelease.md`

## Findings

### Low: `.env.local` instruction still names one old value too narrowly

`ai-handoff/2026-07-15-1231-todo-086-v207-claude-flag-rename-prerelease.md:63` says:

```env
WEATHER_FLAG=false -> WEATHER_AUTH_ACCESS_REQUIRED=true
```

The target value is now correct. The only issue is that Stebbi has had local states with `WEATHER_FLAG=true` too, so the instruction should be interpreted as:

```env
Remove WEATHER_FLAG entirely, regardless of whether it is true or false.
Add WEATHER_AUTH_ACCESS_REQUIRED=true.
```

This is not a code blocker, but it matters for avoiding confusion before release.

### Low: one test name still implies legacy provider compatibility that no longer exists

`lib/__tests__/guard.test.ts:955` says:

```ts
it('requires per-user access when legacy WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true (backward compat)', ...)
```

The behavior is safe because `lib/loans/guard.ts:96` correctly says `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` is no longer read, and the test passes because the new provider flag is unset and default-restricted. The test name should eventually be renamed to avoid implying that the old provider flag still has semantic effect.

Not a release blocker.

## What Looks Correct

- `lib/loans/guard.ts:75-80` now gives `WEATHER_AUTH_ACCESS_REQUIRED` precedence over legacy `WEATHER_FLAG`.
- If `WEATHER_AUTH_ACCESS_REQUIRED=true`, `/auth-mvp/vedrid` requires the `vedrid` row.
- If `WEATHER_AUTH_ACCESS_REQUIRED=false`, stale `WEATHER_FLAG=true` does not accidentally re-close auth weather.
- `lib/loans/guard.ts:92-100` keeps Veðurstofan provider access per-user by default.
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false` is the future graduation path, not the current production target.
- `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` is no longer read by code.
- v207 Vercel target correctly keeps `WEATHER_PUBLIC_ENABLED=true`, so public/guest MET/Yr remains open.
- v207 now includes `Localhost checks fyrir Stebbi`, fixing the missing workflow section from v206.

## Release Recommendation

Codex sees no blocking issue in v207.

It is OK to continue toward release under this flag model, assuming Vercel variables are set as below and Stebbi verifies the localhost checks first.

Recommended production target:

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

Remove from Vercel after the code with the new flags is deployed and verified:

```env
WEATHER_FLAG
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
```

I would not leave `WEATHER_FLAG` in Vercel “just in case”; the new flag is clearer and should be the single source of truth.

## Provider Graduation Note

Before ever setting `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false` in production, decide whether manual refresh/freshness endpoints should also graduate to all authenticated weather users.

Current model means those endpoints follow `checkFeatureAccess(..., 'weather-provider-vedurstofan')`. That is fine while the flag is `true`, but when it is `false`, provider UI and provider refresh become available together.

## Commands Run By Codex

Read-only review commands only:

```powershell
Get-Content -Encoding UTF8 ai-handoff/2026-07-15-1231-todo-086-v207-claude-flag-rename-prerelease.md
Get-Content -Encoding UTF8 ai-handoff/README.md
Get-Date -Format 'yyyy-MM-dd HH:mm'
Get-Content -Encoding UTF8 lib/loans/guard.ts
Get-Content -Encoding UTF8 .env.example
Get-Content -Encoding UTF8 app/(admin)/admin/page.tsx
Get-Content -Encoding UTF8 lib/__tests__/guard.test.ts
rg WEATHER_FLAG/WEATHER_AUTH_ACCESS_REQUIRED/provider flag references
git status --short
git diff --stat
```

Codex did not run app tests in this review. Claude v207 reports:

```text
npx tsc --noEmit -> hreinn
npx vitest run [guard, weather-travel-api] -> 105 passed
```

## Localhost Checks For Stebbi

Before release, with dev server manually restarted after `.env.local` changes:

1. Remove old local vars:
   - `WEATHER_FLAG`
   - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`
   - `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`

2. Set local target:
   ```env
   WEATHER_ENABLED=true
   WEATHER_PUBLIC_ENABLED=true
   WEATHER_AUTH_ACCESS_REQUIRED=true
   WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
   WEATHER_ELTA_VEDRID_FLAG=true
   WEATHER_TRIP_FLAG=true
   WEATHER_AI_ENABLED=false
   ```

3. Open public weather as signed-out user.
   - Expected: MET/Yr route/weather flow works.
   - Expected: no Veðurstofan provider controls.

4. Sign in as a user without `vedrid`.
   - Open `/auth-mvp/vedrid`.
   - Expected: blocked/redirected.

5. Sign in as Stebbi or another user with `feature_access.feature_key = 'vedrid'`.
   - Open `/auth-mvp/vedrid`.
   - Expected: page opens with MET/Yr.

6. Remove or test without `feature_access.feature_key = 'weather-provider-vedurstofan'`.
   - Expected: no Veðurstofan layer/provider controls.

7. Add/verify `weather-provider-vedurstofan` row for that user.
   - Expected: Veðurstofan provider becomes visible and selectable.

8. Optional conflict sanity test:
   ```env
   WEATHER_AUTH_ACCESS_REQUIRED=false
   WEATHER_FLAG=true
   ```
   Restart manually.
   - Expected: `/auth-mvp/vedrid` opens to authenticated users because the new flag wins.
   - Put `WEATHER_AUTH_ACCESS_REQUIRED=true` back immediately after the test.

Do not casually test Vercel/Supabase production feature rows with broad users until the release environment variables have been verified. This touches auth gating and provider visibility.

## Final Answer To "Allt rétt?"

Já, virkni og flagg-módelið eru nú efnislega rétt fyrir markmiðið:

- Allir, líka public/óinnskráðir, sjá MET/Yr þegar weather er opið.
- Aðeins ákveðnir innskráðir notendur sjá `/auth-mvp/vedrid`.
- Aðeins ákveðnir innskráðir notendur sjá Veðurstofuna.
- Vegagerðin getur fylgt sama provider-access mynstri síðar.

Ég myndi bara hreinsa orðalagið um gamla `WEATHER_FLAG` í næsta handoff eða release checklist: ekki “false -> true”, heldur “remove old var and add new explicit var”.
