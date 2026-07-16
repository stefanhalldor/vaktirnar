# TODO 086 v179 - Codex review of v178 cleanup and next step

Created: 2026-07-14 20:54
Timezone: Atlantic/Reykjavik

Source handoff reviewed:
- `ai-handoff/2026-07-14-2050-todo-086-v178-claude-v177-done-prerelease.md`

Mode:
- Review / next-step recommendation only.
- Codex did not change app code, SQL, env, commit, push, deploy, or run migrations.
- Codex added only this review file.

## Findings

### Low - One stale test comment still says `extra_weather_providers`

`lib/__tests__/sql-migration.test.ts:1225` still says:

```ts
// Static SQL regression tests — sql/76 feature_access_extra_weather_providers
```

The actual file path below it is already correct:

```ts
sql/76_feature_access_weather_provider_vedurstofan.sql
```

Impact:
- No runtime impact.
- No test impact.
- Minor future confusion only.

Recommended fix:
- Update that comment to `feature_access_weather_provider_vedurstofan`.

## What Looks Good

- `.env.example` now documents `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`.
- Admin UI now includes `weather-provider-vedurstofan` and points to the correct env flag.
- The SQL file is now named `sql/76_feature_access_weather_provider_vedurstofan.sql`.
- The old generic names are gone from app/lib/sql/env code. Only the stale test comment remains.
- `elta-vedrid` remains separate for the station explorer/validator flow.
- v178 targeted tests reportedly passed: 4 files, 311 tests.

## Remaining Release Readiness

Before release, Claude Code should do one small cleanup/check pass:

1. Fix the stale comment in `lib/__tests__/sql-migration.test.ts`.
2. Run the targeted test command again.
3. Run `npm run type-check`, because `app/(admin)/admin/page.tsx` changed a TS union/render path.
4. If this is going toward production release, run the normal build/check command used for this repo.

No more feature-flag architecture discussion is needed unless Stebbi wants to change the rollout model again.

## What Now?

Recommended sequence:

1. Claude Code does the tiny v180 cleanup and verification above.
2. Codex gives a final release-readiness review.
3. Stebbi decides whether to approve Supabase migration execution.
4. If approved, run migrations in the correct order and only against the intended Supabase environment.
5. Set the env var where needed:
   - local: `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true`
   - Vercel/prod only when Stebbi wants the provider switch available there
6. Grant selected test users the feature key:
   - `weather-provider-vedurstofan`
7. Stebbi tests `/auth-mvp/vedrid` with:
   - user with access;
   - user without access;
   - env switch disabled;
   - `elta-vedrid` explorer still separate.

## Supabase / SQL Notes

- No SQL was run by Codex.
- Do not run `sql/76_feature_access_weather_provider_vedurstofan.sql` until Stebbi explicitly approves.
- Admin UI grant/revoke will not work for `weather-provider-vedurstofan` until the database CHECK constraint includes that key.
- Confirm whether `sql/75_weather_fetch_runs_metadata.sql` also needs to be run before relying on manual refresh run-state metadata in the target environment.

## Localhost Checks for Stebbi

After Claude Code's tiny cleanup and after migration 76 is approved/run in the relevant local/Supabase environment:

1. Set `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true`.
2. Grant your test user `weather-provider-vedurstofan` via `/admin`.
3. Open `/auth-mvp/vedrid` and calculate a route with Veðurstofan stations.
4. Expected: Veðurstofan provider toggle/layer/manual refresh appears for that user.
5. Revoke `weather-provider-vedurstofan` for the same user.
6. Expected: MET/Yr-only behavior.
7. Set `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=false` and restart localhost.
8. Expected: MET/Yr-only behavior even if the per-user row exists.
9. Open `/auth-mvp/vedrid/elta-vedrid` only if the user has the separate `elta-vedrid` access and `WEATHER_ELTA_VEDRID_FLAG=true`.

Do not test Supabase migrations, production env, Vercel, or production data casually. Those require explicit Stebbi approval.
