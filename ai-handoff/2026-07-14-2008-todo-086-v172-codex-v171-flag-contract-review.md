# TODO 086 v172 - Codex review of v171 and provider flag correction

Created: 2026-07-14 20:08
Timezone: Atlantic/Reykjavik

Source handoff reviewed:
- `ai-handoff/2026-07-14-2000-todo-086-v171-claude-v170-done-prerelease.md`

Latest Stebbi clarification reviewed:
- Veðurstofan should be opened globally, with a kill switch that can fall back to MET/Yr only.
- Vegagerðin should be developed so it can enter first behind per-user feature access, then later become global with its own kill switch.
- The longer-term product direction is broader trip/weather reuse, including saving trips.

Mode:
- Review / direction correction only.
- Codex did not change app code, SQL, env, commit, push, deploy, or run migrations.
- Codex added only this review file.

## Short Answer

Yes, we were slightly in the weeds with the v171 feature-flag change.

The v171 implementation is internally coherent, but it is not the right final product contract for the direction Stebbi just clarified.

v171 makes `extra-weather-providers` a single per-user gate for Veðurstofan now and Vegagerðin later. That is safe for hidden testing, but it would keep Veðurstofan behind per-user rows in `feature_access`, which conflicts with the goal of opening Veðurstofan globally while retaining an emergency kill switch.

Because SQL migration 76 has not been run, this is still easy to correct before release.

## Findings

### High - v171 gates Veðurstofan per user, but Stebbi now wants Veðurstofan globally available with its own kill switch

Current v171 code:
- `app/api/teskeid/weather/travel/route.ts:346-348` requires `checkFeatureAccess(..., 'extra-weather-providers')` before returning the Veðurstofan travel layer.
- `app/api/teskeid/weather/vedurstofan/refresh/route.ts:41-42` requires the same per-user key before manual refresh.
- `lib/loans/guard.ts:85-88` defines `extra-weather-providers` as `WEATHER_EXTRA_PROVIDERS_FLAG=true` plus a per-user `feature_access` row.
- `sql/76_feature_access_extra_weather_providers.sql:1-24` adds that per-user key to the DB constraint.

This means an ordinary logged-in user would not see Veðurstofan unless they have the new `extra-weather-providers` DB row. That is not the desired rollout if Veðurstofan is meant to become generally available.

Recommended correction:
- Do not run `sql/76_feature_access_extra_weather_providers.sql` in its current form.
- Replace the Veðurstofan travel-layer access rule with a provider-specific global kill switch, for example:
  - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true`
  - If `false` or missing, UI/API behave as MET/Yr only.
  - If `true`, all eligible `vedrid` / `ferdalagid` users can see/use Veðurstofan.
- Keep `elta-vedrid` separate for the hidden validation/explorer route if still useful.

### High - Vegagerðin should not share the same rollout gate as Veðurstofan

The v171 idea of `extra-weather-providers` puts Veðurstofan and Vegagerðin under one per-user umbrella. That makes rollout and rollback too blunt:
- Turning off the gate would disable both providers.
- Granting the gate to a user would grant all extra providers, even if one is less mature.
- It becomes awkward to graduate Veðurstofan globally while keeping Vegagerðin per-user.

Recommended provider-level contract:
- Veðurstofan:
  - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true|false`
  - No per-user feature row once globally opened.
- Vegagerðin:
  - `WEATHER_PROVIDER_VEGAGERDIN_ENABLED=true|false`
  - `WEATHER_PROVIDER_VEGAGERDIN_REQUIRE_ACCESS=true|false`
  - per-user feature key while testing, e.g. `weather-provider-vegagerdin`

During Vegagerðin testing:
- `WEATHER_PROVIDER_VEGAGERDIN_ENABLED=true`
- `WEATHER_PROVIDER_VEGAGERDIN_REQUIRE_ACCESS=true`
- only users with `weather-provider-vegagerdin` see/use it.

When Vegagerðin graduates:
- keep `WEATHER_PROVIDER_VEGAGERDIN_ENABLED=true`
- set `WEATHER_PROVIDER_VEGAGERDIN_REQUIRE_ACCESS=false`
- no per-user row required.

Emergency rollback:
- set `WEATHER_PROVIDER_VEGAGERDIN_ENABLED=false`
- app falls back to MET/Yr + whichever other providers remain enabled.

### Medium - Future saved-trip product should be a separate product flag, not a weather-provider flag

The future direction Stebbi described is not just "more providers"; it is a broader product layer:
- reuse current route/weather flow;
- let users save trips;
- likely persist preferences, routes, selected thresholds, destinations, and later notifications or monitoring.

That should not live under `extra-weather-providers`.

Recommended product split:
- Provider flags decide which weather sources can participate in calculations.
- Product flags decide which workflows are available.

Possible future product flag:
- `WEATHER_SAVED_TRIPS_FLAG`
- feature key: `weather-saved-trips` or reuse/extend `ferdalagid` if this is simply the next stage of that feature.

## Recommended New Flag Model

Use two layers:

1. Product access
   - `WEATHER_ENABLED`
   - `WEATHER_TRIP_FLAG`
   - existing per-user `ferdalagid` while the route/trip product remains gated

2. Provider access
   - MET/Yr: baseline, always available when weather product is enabled
   - Veðurstofan: global provider switch
   - Vegagerðin: provider switch plus optional per-user rollout requirement

Concrete recommendation:

```txt
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true

WEATHER_PROVIDER_VEGAGERDIN_ENABLED=false
WEATHER_PROVIDER_VEGAGERDIN_REQUIRE_ACCESS=true
```

Later, when Vegagerðin is ready for everyone:

```txt
WEATHER_PROVIDER_VEGAGERDIN_ENABLED=true
WEATHER_PROVIDER_VEGAGERDIN_REQUIRE_ACCESS=false
```

If anything goes wrong:

```txt
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=false
WEATHER_PROVIDER_VEGAGERDIN_ENABLED=false
```

This gives Stebbi the exact operational lever he described: open globally, but be able to flip back to MET/Yr-only without code changes.

## What To Ask Claude Code To Do Next

Claude Code should revise v171 before release:

1. Remove or replace the `extra-weather-providers` concept from the Veðurstofan travel-layer path.
2. Do not run migration 76 as currently written.
3. Gate Veðurstofan travel-layer reads and manual refresh with a global env kill switch, not per-user feature access.
4. Keep `elta-vedrid` for the validation/explorer route only, if Stebbi still wants that hidden page.
5. Add Vegagerðin-ready provider helper logic now, but do not wire a fake provider into UI/calculation yet:
   - `isWeatherProviderEnabled('vedurstofan', user)`
   - `isWeatherProviderEnabled('vegagerdin', user)`
   - support `requireAccess` only for providers that need staged per-user rollout.
6. Update tests so they prove:
   - Veðurstofan enabled globally returns layer for regular eligible users.
   - Veðurstofan disabled returns MET/Yr-only.
   - Vegagerðin can be per-user gated later without changing the provider architecture.
   - MET/Yr baseline remains unaffected.

## Localhost Checks for Stebbi

After Claude Code revises the flag model:

1. Set local env so Veðurstofan is enabled globally.
2. Log in as a normal user who does not have an `extra-weather-providers` row.
3. Open `/auth-mvp/vedrid`, choose a route with Veðurstofan stations.
4. Expected: Veðurstofan provider toggle/layer is available because the global provider switch is on.
5. Set the Veðurstofan provider switch off and restart localhost.
6. Expected: route works as MET/Yr-only; no Veðurstofan provider layer, no manual Veðurstofan refresh affordance, and no broken UI.
7. Keep the hidden `/auth-mvp/vedrid/elta-vedrid` explorer behind its existing `elta-vedrid` access and `WEATHER_ELTA_VEDRID_FLAG`, if that route remains useful.
8. Do not test Supabase migration or production env changes without explicit approval.

## Supabase / SQL Notes

- SQL migration 76 should not be run in current form if the global Veðurstofan rollout model is accepted.
- A future Vegagerðin per-user key may need a smaller provider-specific migration, for example `weather-provider-vegagerdin`.
- If Veðurstofan no longer needs a per-user provider key, no new DB constraint key is needed for global Veðurstofan access.

## Óvissa / þarf að staðfesta

- Exact env var names are recommendations. The important part is the contract:
  - Veðurstofan: own global kill switch.
  - Vegagerðin: own kill switch and optional per-user rollout gate.
  - Future saved trips: separate product feature, not provider access.
