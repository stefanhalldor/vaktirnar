# TODO 086 v173 - Codex correction to v172: keep Veðurstofan per-user for now

Created: 2026-07-14 20:10
Timezone: Atlantic/Reykjavik

Supersedes / corrects:
- `ai-handoff/2026-07-14-2008-todo-086-v172-codex-v171-flag-contract-review.md`

Latest Stebbi clarification:

> Ég vil halda veðurstofunni áfram undir per user feature flaggi... það er ekki alveg tilbúið í að vera gefið út á alla (þó að kill switch möguleiki sé til staðar)

Mode:
- Direction correction / handoff only.
- Codex did not change app code, SQL, env, commit, push, deploy, or run migrations.
- Codex added only this handoff file.

## Corrected Decision

Veðurstofan should remain behind per-user feature access for now.

The corrected desired behavior is:
- MET/Yr remains the baseline weather provider.
- Veðurstofan is available only to selected users while still in testing.
- Veðurstofan must also have an environment kill switch, so Stebbi can turn it off globally and fall back to MET/Yr-only behavior.
- Vegagerðin should later follow the same staged pattern: per-user first, then global when ready, with its own kill switch.

So v172's recommendation to open Veðurstofan globally now is wrong for the current rollout stage.

## What This Means For v171

v171 is directionally closer than v172 because it keeps Veðurstofan behind per-user access.

However, Codex still recommends one refinement before locking the contract:

### Prefer provider-specific flags over one generic `extra-weather-providers` flag

The current v171 key `extra-weather-providers` can work as a short-term gate, but it may become awkward when Vegagerðin enters:
- A user granted `extra-weather-providers` might automatically get both Veðurstofan and Vegagerðin.
- Turning one provider on/off separately becomes less clear.
- It mixes "all experimental providers" with "this specific provider is ready for this user".

Recommended provider-specific contract:

```txt
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true
feature_access.feature_key = 'weather-provider-vedurstofan'

WEATHER_PROVIDER_VEGAGERDIN_ENABLED=false
feature_access.feature_key = 'weather-provider-vegagerdin'
```

Provider is available only when both are true:
1. global provider kill switch is enabled;
2. user has that provider's per-user feature access.

When a provider is later ready for everyone, we can add a separate graduation switch, for example:

```txt
WEATHER_PROVIDER_VEDURSTOFAN_REQUIRE_ACCESS=false
```

But for now, keep `REQUIRE_ACCESS=true` semantics.

## Concrete Recommendation For Claude Code

Claude Code should not follow v172's "global Veðurstofan now" recommendation.

Instead, choose one of these two paths:

### Preferred path

Replace v171's generic `extra-weather-providers` with provider-specific access:
- `weather-provider-vedurstofan`
- `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`

Then later add:
- `weather-provider-vegagerdin`
- `WEATHER_PROVIDER_VEGAGERDIN_ENABLED`

This is more future-proof and gives Stebbi independent control over each provider.

### Acceptable short-term path

Keep v171's `extra-weather-providers` temporarily, but document that it currently means "Veðurstofan travel layer access", not all future providers.

If choosing this path, do not add Vegagerðin behind the same key later without revisiting the contract.

## SQL Implication

If using provider-specific access, do not run `sql/76_feature_access_extra_weather_providers.sql` as currently written.

Instead, revise the migration to add:

```sql
'weather-provider-vedurstofan'
```

and later add Vegagerðin with a separate migration/key when needed.

If keeping v171's generic key temporarily, migration 76 can remain, but Claude Code should clearly document that the name is temporary/ambiguous and may need migration cleanup before Vegagerðin lands.

No migration should be run until Stebbi explicitly approves Supabase execution.

## Localhost Checks for Stebbi

After Claude Code revises or confirms the contract:

1. With the provider env switch on and the test user granted the Veðurstofan provider feature key, open `/auth-mvp/vedrid`.
2. Expected: Veðurstofan toggle/layer/manual refresh is available.
3. Remove the per-user provider feature access for the same user.
4. Expected: MET/Yr-only behavior; no Veðurstofan provider UI or layer.
5. Turn off the Veðurstofan provider env switch.
6. Expected: MET/Yr-only behavior for everyone, even if the user has the per-user access row.
7. Keep `/auth-mvp/vedrid/elta-vedrid` station explorer separate if still useful, under its existing validation feature access.

Do not test Supabase migration or production env changes without explicit Stebbi approval.

## Óvissa / þarf að staðfesta

- Stebbi should choose whether to keep the current generic `extra-weather-providers` key briefly or rename now to `weather-provider-vedurstofan`.
- Codex recommends renaming now before SQL is run, because it is cheaper before the key exists in production data.
