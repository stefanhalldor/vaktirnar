# TODO 086 v175 - Codex review of v174 provider key decision

Created: 2026-07-14 20:21
Timezone: Atlantic/Reykjavik

Source handoff reviewed:
- `ai-handoff/2026-07-14-2019-todo-086-v174-claude-v173-pending-key-decision.md`

Stebbi clarification:
- Veðurstofan should stay per-user feature flagged for now.
- The flag and later kill switch are Veðurstofan-specific.
- Stebbi asked whether the flag name should include Veðurstofan to avoid future confusion.

Mode:
- Review / decision handoff only.
- Codex did not change app code, SQL, env, commit, push, deploy, or run migrations.
- Codex added only this review file.

## Recommendation

Choose v174 option A.

Yes, the flag is Veðurstofan-specific, so the name should include Veðurstofan.

Use provider-specific naming now, before migration 76 is run:

```txt
feature_access.feature_key = 'weather-provider-vedurstofan'
env kill switch = WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true
```

Do not keep the generic:

```txt
extra-weather-providers
WEATHER_EXTRA_PROVIDERS_FLAG
```

unless Stebbi wants a temporary shortcut. Codex does not recommend the shortcut because Vegagerðin is expected soon.

## Why

The generic `extra-weather-providers` name creates ambiguity:
- it sounds like it controls every non-MET/Yr provider;
- it could accidentally grant Vegagerðin to users who should only have Veðurstofan;
- it makes later rollout/rollback conversations fuzzier;
- it hides the provider-specific nature of the current work.

The provider-specific name is clearer:
- Veðurstofan has its own per-user access key.
- Veðurstofan has its own global kill switch.
- Vegagerðin can later get its own independent key and switch.
- MET/Yr remains the baseline.

## Concrete Instruction For Claude Code

Claude Code should implement option A from v174:

1. Rename the v171 key from `extra-weather-providers` to `weather-provider-vedurstofan`.
2. Rename env var from `WEATHER_EXTRA_PROVIDERS_FLAG` to `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`.
3. Update:
   - `lib/loans/guard.ts`
   - `app/api/teskeid/weather/travel/route.ts`
   - `app/api/teskeid/weather/vedurstofan/refresh/route.ts`
   - `app/api/admin/feature-access/route.ts`
   - tests that mention the old key/env var
   - migration 76 so it adds `weather-provider-vedurstofan`, not `extra-weather-providers`
4. Keep `elta-vedrid` unchanged for the station validator/explorer route.
5. Do not run SQL migration 76 until Stebbi explicitly approves Supabase execution.

Future Vegagerðin naming should be separate:

```txt
feature_access.feature_key = 'weather-provider-vegagerdin'
env kill switch = WEATHER_PROVIDER_VEGAGERDIN_ENABLED=true
```

## Localhost Checks for Stebbi

After Claude Code makes this rename:

1. With `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` and the test user granted `weather-provider-vedurstofan`, open `/auth-mvp/vedrid`.
2. Expected: Veðurstofan toggle/layer/manual refresh is available.
3. Remove the user's `weather-provider-vedurstofan` access.
4. Expected: MET/Yr-only behavior; no Veðurstofan layer/toggle/manual refresh.
5. Turn `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=false`.
6. Expected: MET/Yr-only behavior even if the user has the per-user row.
7. Confirm `/auth-mvp/vedrid/elta-vedrid` is still governed separately by `elta-vedrid`.

Do not test Supabase migration or production env changes without explicit Stebbi approval.

## Supabase / SQL Notes

- If option A is accepted, do not run current `sql/76_feature_access_extra_weather_providers.sql` as-is.
- Revise migration 76 to use `weather-provider-vedurstofan`.
- No SQL was run by Codex.
