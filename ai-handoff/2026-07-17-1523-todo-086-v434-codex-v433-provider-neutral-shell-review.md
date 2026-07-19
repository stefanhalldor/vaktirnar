# 2026-07-17 15:23 — TODO-086 v434 — Codex review of v433 provider-neutral shell

Created: 2026-07-17 15:23
Reviewed handoff: `2026-07-17-1500-todo-086-v433-claude-b3c-provider-neutral-shell-prerelease.md`
Related handoff: `2026-07-17-1448-todo-086-v432-codex-b3c-provider-neutral-overview-shell.md`

## Findings

1. **Medium: Provider-neutral shell still has no provider-control contract**

   `WeatherOverviewProviderConfig` exposes `providerId`, loading/error flags, one `mapLayer`, and `renderPreMap`/`renderPostMap` hooks, but no provider label, provider availability label, selected/enabled state, show/hide callback, ordering metadata, or generic provider-toggle surface in the shell. See `components/weather/WeatherOverviewShell.tsx:27`.

   The shell then renders every provider's pre-map and post-map content unconditionally in provider order (`components/weather/WeatherOverviewShell.tsx:183` and `components/weather/WeatherOverviewShell.tsx:201`). That works with one provider, but the first Vegagerðin implementation will either stack multiple provider-specific panels without a shared control model or force another shell change.

   Recommendation: before B4/Vegagerðin, add a minimal provider-control field set to the contract, for example `label`, `summaryLabel?`, `isVisible`, `canToggle`, `onToggle?`, `emptyLabel?`, and let the shell own a compact provider strip. Provider adapters can still own their domain filters below the map.

2. **Medium/Low: URL restoration is one-shot and can miss future provider layers**

   `WeatherOverviewShell` restores `?stationId=` only once when `hasMapData` first becomes true, then permanently sets `restoredFromUrl.current = true` (`components/weather/WeatherOverviewShell.tsx:87`). With one provider this is probably fine. With multiple providers, if provider A loads first and the URL marker belongs to provider B, the shell marks restoration as done before B appears.

   Recommendation: make restoration provider-aware before adding the second provider. Either:
   - only mark restored when a matching marker is found, or
   - track the restored `stationId` value and retry when `mapLayers` changes until it resolves.

3. **Low: Generic shell still depends on the `eltaVedrid` translation namespace**

   `WeatherOverviewShell` imports `useTranslations('teskeid.vedrid.eltaVedrid')` and uses that namespace for generic shell copy such as back fallback, trip CTA, loading, load error, and map unavailable (`components/weather/WeatherOverviewShell.tsx:73`, `components/weather/WeatherOverviewShell.tsx:157`, `components/weather/WeatherOverviewShell.tsx:175`, `components/weather/WeatherOverviewShell.tsx:179`).

   This is not a runtime bug, but it weakens the new abstraction. If `/vedrid` is now the default overview and `elta-vedrid` is becoming compatibility/legacy, generic shell copy should either be passed as labels or moved to a generic `teskeid.vedrid.overview` namespace.

4. **Low: Provider-restricted/disabled state is silent even though v432 asked for a degraded state**

   `WeatherOverviewClient` treats 401/403/404 as `providerRestricted` and then renders no provider content (`components/weather/WeatherOverviewClient.tsx:73`). The shell only shows title/header/CTA when every provider is restricted/off.

   This may be acceptable if the goal is to hide Veðurstofan completely from users without access. But if a provider is globally disabled or temporarily unavailable, the overview can look oddly empty. Consider a very small neutral empty/degraded line in the shell when all providers are unavailable but weather itself is open.

## What Looks Good

- The dependency direction is much better than before: `WeatherOverviewShell` does not import Veðurstofan station types, and `WeatherOverviewClient` is now clearly a Veðurstofan adapter.
- `IcelandOverviewMap` is provider-layer based and does not know about Veðurstofan.
- v431 middleware behavior appears preserved.
- Public/auth routes keep the intended split between overview and `ferdalagid`.
- No SQL, RLS, grants, migration, env, Vercel, commit, push, or deployment was involved.

## Verification Run By Codex

```bash
npm run type-check
```

Result: exit 0.

```bash
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/pulseBack.test.ts
```

Result: exit 0, 3 files passed, 82 tests passed.

## Design / UX Notes

This is aligned with the larger Design.md direction: reusable components, mobile-first overview, and no new landing-page/hero behavior.

Before Vegagerðin is added, the provider controls should become part of the reusable shell so we do not end up with provider toggles duplicated in each adapter. That is the important UX/architecture line to hold.

## Recommended Next Step

I would not block localhost testing of v433. It is a good structural improvement.

Before starting real Vegagerðin data work, do one compact B3C.1 hardening pass:

1. Add provider-control metadata to `WeatherOverviewProviderConfig`.
2. Render a generic provider strip/toggle area in `WeatherOverviewShell`.
3. Make URL restoration retry until the requested marker is found or all providers are done loading.
4. Move generic shell labels out of the `eltaVedrid` namespace or pass them as props.
5. Add one small unit/component-level test if there is an existing pattern; otherwise rely on type-check plus localhost checks.

After B3C.1, proceed to the next bigger phase: Vegagerðin provider adapter/data discovery.

## Localhost Checks For Stebbi

1. Open public `http://localhost:3004/vedrid`.
   - Expected: overview opens, map appears, Veðurstofan stations appear if globally open, CTA goes to `/vedrid/ferdalagid`.

2. Open auth `http://localhost:3004/auth-mvp/vedrid`.
   - Expected: same overview with authenticated menu, CTA goes to `/auth-mvp/vedrid/ferdalagid`.

3. Click a station marker and then open its pulse; return back.
   - Expected: `?stationId=` restores the same selected station.

4. Temporarily test restricted provider behavior locally if convenient.
   - With `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` and a user without access, expected: overview does not crash and does not show Veðurstofan station data.

5. Mobile width check at roughly 390px and 546px.
   - Expected: no horizontal overflow, no weird map/header overlap, station detail remains readable.

Do not test SQL/RLS/production/Vercel as part of this validation.
