# v236 Codex review - v235 deploy/Vercel config

Created: 2026-07-15 17:38
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Reviewed handoff: `2026-07-15-1720-todo-086-v235-deploy-vercel-config.md`

## Findings

### 1. Blocker: v235 staging list is missing runtime-critical files

Do not deploy using the v235 `git add` list unchanged.

The current v235 stage list omits files that are required for the flag/access contract to work in production:

- `lib/loans/guard.ts`
  - Required because it now reads `getWeatherEnabledMode()`.
  - Required because it implements `WEATHER_AUTH_ACCESS_REQUIRED`.
  - Required because it adds `weather-provider-vedurstofan` feature access.
- `app/api/admin/feature-access/route.ts`
  - Required if production admin should be able to grant `weather-provider-vedurstofan`.
- `app/(admin)/admin/page.tsx`
  - Required so the admin UI shows/states the new Veðurstofan provider access gate correctly.
- `.env.example`
  - Not runtime-critical, but should ship with this release because it documents the new flag contract.
- `vercel.json`
  - Required if the 10-minute Veðurstofan cron schedule is part of this release.

If these are not included, production can end up with code/docs/admin behavior that does not match the Vercel flags Stebbi is about to set.

### 2. Blocker: current worktree is much dirtier than the v235 release slice

`git status --short` shows many modified/untracked app, lib, component, SQL, message and handoff files.

That does not mean all of them should be committed now, but it does mean the release cannot safely use `git add .`, and it also means v235's small 16-file manifest is not enough proof that the intended release is complete.

Before push, Claude Code should produce or verify the exact final release manifest from `git status --short` and explain why every staged file belongs in this release.

### 3. High: Vercel env values look conceptually right, but production values must be verified before push

The local `.env.local` value is correct for localhost:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3005
```

That should not be copied to production.

In Vercel production, the hidden value must be:

```env
NEXT_PUBLIC_SITE_URL=https://teskeid.is
```

If Vercel already has that value, no change is needed. If any `NEXT_PUBLIC_*` value is changed in Vercel after a build has started, trigger a fresh redeploy, because those values may be build-time inlined.

### 4. Medium: v235 handoff title says "v233 deploy handoff"

This is not a code blocker, but it is confusing in a release context. The file is named v235 but the H1 says `v233 deploy handoff`. If Claude Code touches the handoff, fix the title to avoid future archaeology pain.

## Vercel env recommendation

For the current desired rollout:

- Everyone, signed-in and signed-out, sees base MET/Yr weather.
- Only selected users see Veðurstofan provider/layer.
- Vegagerðin remains visible only as upcoming/disabled where applicable.
- AI weather stays off.

Production Vercel should have:

```env
NEXT_PUBLIC_SITE_URL=https://teskeid.is
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_AI_ENABLED=false
METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
WEATHER_MAP_PROVIDER=google
GOOGLE_MAPS_SERVER_KEY=<set in Vercel>
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=<set in Vercel>
CRON_SECRET=<set in Vercel>
```

Keep the existing Supabase/auth/email secrets set in Vercel, but do not paste secrets into handoff files or chat.

Remove or leave unset in Vercel:

```env
WEATHER_PUBLIC_ENABLED
WEATHER_FLAG
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
```

Optional:

```env
WEATHER_PUBLIC_IP_DAILY_LIMIT=<number>
```

If unset, code/default docs indicate public users use the default daily limit.

## Corrected release sequence

### Step 1 - Verify Vercel env before push

Do this before `git push`, especially for `NEXT_PUBLIC_SITE_URL`.

Confirm:

- `NEXT_PUBLIC_SITE_URL=https://teskeid.is`
- `WEATHER_ENABLED=All`
- `WEATHER_AUTH_ACCESS_REQUIRED=true`
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`
- `WEATHER_TRIP_FLAG=true`
- `WEATHER_ELTA_VEDRID_FLAG=true`
- `WEATHER_AI_ENABLED=false`
- No legacy weather vars listed above are still active.

### Step 2 - Stage exact release files, not `git add .`

At minimum, v235's existing list needs these additions:

```bash
git add -- "lib/loans/guard.ts"
git add -- "app/api/admin/feature-access/route.ts"
git add -- "app/(admin)/admin/page.tsx"
git add -- ".env.example"
git add -- "vercel.json"
```

Those are in addition to the files already listed in v235:

```bash
git add -- "lib/weather/weatherBaseAccess.server.ts"
git add -- "lib/weather/weatherEnabledMode.server.ts"
git add -- "app/api/teskeid/weather/saved-places/route.ts"
git add -- "app/api/teskeid/weather/saved-places/[id]/route.ts"
git add -- "app/hugmyndir/[slug]/page.tsx"
git add -- "app/page.tsx"
git add -- "app/vedrid/page.tsx"
git add -- "lib/__tests__/home-page.test.tsx"
git add -- "lib/__tests__/place-search-api.test.ts"
git add -- "lib/__tests__/public-landing.test.ts"
git add -- "lib/__tests__/weather-public.test.ts"
git add -- "lib/__tests__/weather-routes-api.test.ts"
git add -- "lib/__tests__/weather-saved-places-api.test.ts"
git add -- "lib/__tests__/weather-travel-api.test.ts"
git add -- "lib/__tests__/weather-vedurstofan-projector.test.ts"
git add -- "lib/__tests__/weather-vedurstofan-warmer.test.ts"
```

However, because the worktree is much dirtier than this list, Claude Code should verify whether the release also depends on other currently uncommitted files from earlier Veðurstofan/Weather phases. If yes, this manifest must be expanded deliberately.

### Step 3 - Verify staged files

Run:

```bash
git diff --cached --name-only
git status --short
```

Expected:

- Staged files are exactly the intended release.
- No required runtime files remain unstaged.
- No unrelated files are staged accidentally.
- Handoff files can remain untracked unless Stebbi explicitly wants to commit them.

### Step 4 - Commit/push only after manifest is clean

Recommended commit message if this release is only the authenticated/public weather access contract:

```bash
git commit -m "fix: make weather base access mode explicit (#86)"
```

Then push only after Stebbi explicitly approves the push/deploy step.

## Go / no-go

Current v235 as written: **No-go**.

After fixing the release manifest and confirming Vercel env: **Go**.

Codex does not see a conceptual blocker in the env model:

- `WEATHER_ENABLED=All` is the right setting for everyone to see base MET/Yr weather.
- `WEATHER_AUTH_ACCESS_REQUIRED=true` can remain because it preserves private `vedrid` feature-access semantics where code still checks that feature, but base weather access is now governed by `WEATHER_ENABLED`.
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` is right for keeping Veðurstofan per-user.

## Localhost checks for Stebbi

Before release, use localhost only. Do not test production secrets, cron secrets, Supabase mutations or Vercel changes casually.

Recommended checks:

1. Signed out:
   - Open `/`.
   - Confirm Veðrið card is visible.
   - Open `/vedrid`.
   - Confirm base MET/Yr weather works.
   - Confirm no Veðurstofan provider controls/layer appear.

2. Signed in as a normal user without Veðurstofan access, e.g. `stebbishj@gmail.com`:
   - Open `/auth-mvp/heim`.
   - Confirm Veðrið card is visible.
   - Open `/auth-mvp/vedrid`.
   - Confirm saved places/user shell still work.
   - Confirm MET/Yr weather works.
   - Confirm Veðurstofan does not appear.

3. Signed in as user with `weather-provider-vedurstofan`, e.g. `stefanhalldor@gmail.com` or `teskeid@gottvibe.is` if granted:
   - Open `/auth-mvp/vedrid`.
   - Confirm MET/Yr base weather works.
   - Confirm Veðurstofan provider/layer appears.
   - Confirm provider toggle behavior still works.

4. Admin:
   - Open admin feature access.
   - Confirm the Veðurstofan provider access section exists.
   - Confirm adding/removing `weather-provider-vedurstofan` is possible.
   - Do not casually mutate production users; use localhost/dev state only unless Stebbi explicitly approves production admin changes.

5. Guest/public routing:
   - Open `/hugmyndir/vedrid`.
   - Confirm CTA routes to `/vedrid` when `WEATHER_ENABLED=All`.

## Post-deploy checks for Stebbi

After Vercel build is green:

1. Signed out on `https://teskeid.is`:
   - Home shows Veðrið.
   - `/vedrid` opens and shows base MET/Yr.
   - No Veðurstofan layer for public user.

2. Signed-in normal user without provider access:
   - `/auth-mvp/heim` shows Veðrið.
   - `/auth-mvp/vedrid` opens inside auth shell.
   - Saved places still work.
   - No Veðurstofan layer.

3. Signed-in provider user:
   - `/auth-mvp/vedrid` shows Veðurstofan provider/layer.

4. Admin:
   - Verify the Veðurstofan provider access UI can see the right users.
   - Avoid broad production changes unless intentional.

5. Vercel:
   - Confirm `/api/cron/warm-vedurstofan` schedule is now every 10 minutes if `vercel.json` was included.
   - Do not call cron manually without the correct `CRON_SECRET`.

## Supabase / RLS / data impact

No SQL is proposed in this review.

This review does not run migrations and does not change Supabase.

Risk area:

- The admin feature-access route depends on the DB constraint already allowing `weather-provider-vedurstofan` from SQL 76.
- If SQL 76 has not been run in production, adding that access row can fail.
- Stebbi has previously said SQL 76 was run successfully, but confirm production state if admin grant fails.

## Óvissa / þarf að staðfesta

- Codex cannot see the hidden value of Vercel `NEXT_PUBLIC_SITE_URL` from the screenshot. Stebbi must verify it is `https://teskeid.is`.
- Codex did not run tests in this review turn. This is a release manifest/env review only.
- The worktree is very dirty. Claude Code should confirm whether this release is only v235/auth-mode or the full accumulated Weather/Veðurstofan release. If it is the full accumulated release, v235's file list is not enough.
