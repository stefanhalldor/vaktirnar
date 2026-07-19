# 2026-07-17 15:55 - TODO-086 v437 - Codex review of v436 + next big step

Created: 2026-07-17 15:55
Timezone: Atlantic/Reykjavik

Reviewed handoff:
- `2026-07-17-1542-todo-086-v436-claude-b3d-b4a-provider-shell-vegagerdin-foundation.md`

Related handoffs:
- `2026-07-17-1523-todo-086-v434-codex-v433-provider-neutral-shell-review.md`
- `2026-07-17-1527-todo-086-v435-codex-big-next-step-provider-shell-and-vegagerdin-foundation.md`

## Short Human Summary

v436 is directionally good. Claude Code kept Vegagerdin out of forecast decisions, did not call the upstream API, did not run SQL, and added a sensible server-only parser/cache foundation.

I would not release this as the final Vegagerdin foundation without a few fixes, but it is safe as a prerelease foundation if Stebbi understands that Vegagerdin still does not fetch or display real data.

The next big step should be B4B/B4C:

1. Fix the docs/test/freshness gaps below.
2. Verify the Vegagerdin response shape before wiring live fetch.
3. Build the cache-only Vegagerdin overview adapter and shared fixed-provider route matching seam.
4. Keep Vegagerdin as current measurements only. It must not affect scrubber, worst forecast, or trip risk decisions yet.

## Findings

### 1. Medium: `.env.example` contradicts the actual Veðurstofan provider flag contract

`.env.example` says:

- `default (unset or true): per-user gate`
- `set to false to graduate Veðurstofan`

But the code and tests say the opposite of the first half: only exact `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` gates the provider; unset/false/anything else opens it to weather users.

References:
- [.env.example](../.env.example:57)
- [lib/loans/guard.ts](../lib/loans/guard.ts:98)
- [lib/__tests__/guard.test.ts](../lib/__tests__/guard.test.ts:967)

Why it matters:
- This is exactly the kind of env wording that has already caused Vercel confusion.
- The new Vegagerdin docs use the correct model, so the two provider docs now disagree.

Fix:
- Update the Veðurstofan comments to match current code:
  - `=true` => per-user gate
  - unset/false/anything else => open to all weather users
  - legacy `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` is ignored.

### 2. Medium: Vegagerdin cache freshness and measurement freshness are conflated

`readVegagerdinCurrentFromCache()` returns `fresh` or `stale` based on `weather_cache.fetched_at`, not on the actual measurement time in `oldestMeasuredAtIso` or per-station `measuredAtIso`.

References:
- [lib/weather/providers/vegagerdinCurrent.server.ts](../lib/weather/providers/vegagerdinCurrent.server.ts:235)
- [lib/weather/providers/vegagerdinCurrent.server.ts](../lib/weather/providers/vegagerdinCurrent.server.ts:268)
- [lib/weather/providers/vegagerdinCurrentTypes.ts](../lib/weather/providers/vegagerdinCurrentTypes.ts:93)

Why it matters:
- For current measurements, a cache can be freshly fetched but still contain old station observations.
- If the UI later shows "fresh" based only on fetch time, users can misunderstand stale road-weather measurements as current.

Fix:
- Split the concepts:
  - `cacheStatus`: fresh/stale/unavailable by fetch time
  - `measurementStatus`: fresh/stale/unknown by `measuredAtIso`/`oldestMeasuredAtIso`
- Downstream UI should say "sótt kl." separately from "mælt kl.".
- Do not call current measurements "fresh" in product copy unless the measurement time is also acceptable.

### 3. Medium: New `weather-provider-vegagerdin` access key lacks the same regression coverage as Veðurstofan

The new key is wired in guard/admin/API/SQL, and existing suites pass, but the focused regression tests still only assert `weather-provider-vedurstofan` and `weather-pulse`.

References:
- [lib/__tests__/guard.test.ts](../lib/__tests__/guard.test.ts:933)
- [lib/__tests__/feature-access-api.test.ts](../lib/__tests__/feature-access-api.test.ts:259)
- [lib/__tests__/sql-migration.test.ts](../lib/__tests__/sql-migration.test.ts:1459)

Why it matters:
- The feature flag model is subtle and user-facing.
- Vegagerdin should get the same "only true gates, unset opens" tests before Stebbi starts using the admin UI for it.

Fix:
- Add guard tests for `weather-provider-vegagerdin` matching the Veðurstofan graduation pattern.
- Add feature-access API tests for GET/POST/DELETE with `weather-provider-vegagerdin`.
- Add static SQL migration checks for `sql/80_feature_access_weather_provider_vegagerdin.sql`.

### 4. Low: All-provider unavailable state uses a generic load-error sentence

When every provider is restricted/upcoming/unavailable, `WeatherOverviewShell` shows `t('loadError')`.

References:
- [components/weather/WeatherOverviewShell.tsx](../components/weather/WeatherOverviewShell.tsx:187)
- [components/weather/WeatherOverviewShell.tsx](../components/weather/WeatherOverviewShell.tsx:277)
- [messages/is.json](../messages/is.json:1001)

Why it matters:
- "Náði ekki að sækja gögn. Reyndu aftur." is wrong if nothing failed and the real state is "provider restricted" or "Vegagerdin in preparation".

Fix:
- Add a generic `noActiveProviders`/`allProvidersUnavailable` string.
- Prefer provider-specific statuses in the strip and a quiet neutral state below.

### 5. Low/Future: URL restoration is still one-shot per component mount

The B3D restore fix is a good improvement for async provider load. It still uses `restoredFromUrl.current` and does not reset if `stationId` changes while the shell stays mounted.

Reference:
- [components/weather/WeatherOverviewShell.tsx](../components/weather/WeatherOverviewShell.tsx:115)

Why it matters:
- Browser back/forward between two station IDs, or future provider links that update only query params, may not update the selected marker.

Fix:
- Track the last processed `stationId` string and reset restoration when it changes.
- Include `searchParams`/`urlMarkerId` safely in dependencies rather than suppressing the hook entirely.

## What Looks Good

- `fetchVegagerdinCurrent()` is not imported or called by UI/routes yet. Confirmed by `rg`.
- `import 'server-only'` is present in the Vegagerdin provider module.
- Null numeric fields are preserved as null, not coerced to zero.
- `Vindhradi` and `Vindhvida` are named clearly as mean wind and recent gust.
- Vegagerdin is not wired into scrubber, worst point, `selectDecisiveProvider`, or travel status logic.
- `sql/80` does not weaken RLS or grants. It only extends the `feature_access_feature_key_check` constraint.
- The provider shell direction is correct: shell owns provider strip/map layers, adapters own domain content.

## Verification Run By Codex

Commands:

```bash
npm run type-check
```

Result:

```text
exit 0
```

Commands:

```bash
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/pulseBack.test.ts lib/__tests__/weather-vegagerdin-current.test.ts
```

Result:

```text
4 files, 113 tests passed, exit 0
```

Commands:

```bash
npm run test:run -- lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/sql-migration.test.ts
```

Result:

```text
3 files, 355 tests passed, exit 0
```

Not run:
- Full test suite.
- Browser/localhost UI.
- Live Vegagerdin fetch.
- SQL migration.

## SQL / RLS / Auth Review

`sql/80_feature_access_weather_provider_vegagerdin.sql`:

- Adds only `weather-provider-vegagerdin` to the existing `feature_access_feature_key_check`.
- Does not create a table.
- Does not add grants.
- Does not change RLS.
- Is idempotent by dropping/recreating the constraint.
- Was not run.

Risk:
- If `sql/80` is not run, the admin UI/API may accept the key in code but production DB will reject actual insert rows for `weather-provider-vegagerdin`.
- That is expected until Stebbi explicitly runs SQL.

## Next Big Step: B4B + B4C

Claude Code should take a bigger step than tiny polish, but keep hard safety boundaries.

### B4B: Harden the Vegagerdin foundation

In one implementation pass:

1. Fix `.env.example` provider docs for Veðurstofan.
2. Split Vegagerdin cache freshness from measurement freshness.
3. Add targeted tests for:
   - `weather-provider-vegagerdin` in `checkFeatureAccess`
   - admin feature-access GET/POST/DELETE for `weather-provider-vegagerdin`
   - static SQL 80 checks
   - measurement freshness vs cache freshness
4. Replace all-provider-unavailable copy with a neutral state.
5. Make URL station restore respond correctly when `stationId` changes on the same mounted shell.

### B4C: Add cache-only Vegagerdin overview adapter

Only after B4B is clean:

1. Add a server/client adapter seam for Vegagerdin current measurements that reads cache only.
2. Do not call the live endpoint.
3. If no cache data exists, keep Vegagerdin as "in preparation"/empty without breaking the overview.
4. If cache data exists, show Vegagerdin as a separate map layer in the same `WeatherOverviewShell`.
5. Marker/card copy must say current measurement, not forecast:
   - "Núverandi mæling frá Vegagerðinni"
   - "Mælt kl. HH:mm"
   - "Sótt kl. HH:mm" if useful
   - wind, recent gust, direction, air temp, road temp if present
6. Reuse `ProviderStationPreviewCard` or extract a provider-neutral current-measurement preview if needed.
7. Reuse the provider shell and map layer contract. Do not create a Vegagerdin-only overview shell.

### B4D Planning Hook: route matching for fixed/current providers

If B4C becomes stable, prepare but do not overbuild:

1. Route-match Vegagerdin points using the same fixed-provider route geometry model as Veðurstofan.
2. Compute:
   - distance from route
   - distance along route
   - route-order sorting
3. Do not attach Vegagerdin to met.no sample points.
4. Do not use Vegagerdin current measurements in forecast status decisions yet.
5. The route card should frame them as "núverandi mælingar nálægt leið", not "spá á leiðinni".

## Hard Boundaries For Claude Code

Do not:

- run SQL
- call the live Vegagerdin endpoint without explicit Stebbi approval
- commit
- push
- deploy
- edit Vercel/env
- add cron
- add DATEX/road-conditions/cameras yet
- let Vegagerdin influence trip status/worst point/scrubber
- create one-off Vegagerdin UI that bypasses `WeatherOverviewShell`
- duplicate geometry helpers if an existing fixed-provider projection helper can be reused

If live response verification is needed:

- Stop and ask Stebbi.
- Explain the exact external URL, that it is read-only, and whether the response will be stored as a sanitized fixture.

## Suggested Prompt For Claude Code

```text
Workflow.

Please continue from:
- 2026-07-17-1542-todo-086-v436-claude-b3d-b4a-provider-shell-vegagerdin-foundation.md
- 2026-07-17-1555-todo-086-v437-codex-v436-review-and-next-big-step.md

Goal:
Take the next large but safe step: B4B + B4C.

First review the Codex findings critically. If you see a blocker, stop and hand off. If not, implement.

B4B:
1. Fix `.env.example` so Veðurstofan provider access docs match code: only exact `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` gates; unset/false/anything else opens to weather users.
2. Split Vegagerdin cache freshness from measurement freshness.
3. Add targeted tests for:
   - `weather-provider-vegagerdin` guard behavior
   - admin feature-access GET/POST/DELETE for `weather-provider-vegagerdin`
   - static SQL 80 checks
   - cache freshness vs measurement freshness
4. Replace all-provider unavailable copy with neutral copy, not generic fetch error.
5. Make `WeatherOverviewShell` URL restoration react safely when `stationId` changes while the shell remains mounted.

B4C:
1. Add a cache-only Vegagerdin overview adapter if B4B is clean.
2. It must read cached current measurements only. Do not call live upstream.
3. If no cache exists, keep Vegagerdin quiet/upcoming.
4. If cached data exists, show Vegagerdin as its own provider map layer in the same reusable shell.
5. Selected marker preview must clearly say current measurement, not forecast.
6. Reuse `WeatherOverviewShell`, `IcelandOverviewMap`, `ProviderStationPreviewCard`, and existing Teskeið design patterns. Extract reusable provider-current-card helpers if needed.

Hard boundaries:
- Do not run SQL.
- Do not call `https://gagnaveita.vegagerdin.is/api/vedur2014_1` unless you ask Stebbi and he explicitly approves.
- Do not commit, push, deploy, edit Vercel/env, or touch production.
- Do not add cron.
- Do not let Vegagerdin affect scrubber, worst point, selected forecast provider, or trip risk status.
- Do not create a provider-specific shell if the reusable shell can support it.

Verification:
- Run `npm run type-check`.
- Run the relevant targeted tests, including the new tests you add.
- If a UI shell/adapter changes, include precise localhost checks for public and auth `/vedrid`.

After implementation, stop and create a full handoff in `ai-handoff/` with files changed, commands, exit codes, risks, SQL/RLS/auth notes, and Localhost checks for Stebbi.
```

## Localhost Checks For Stebbi

After Claude Code implements the next step, Stebbi should test:

1. Public overview:
   - Open `http://localhost:3004/vedrid`.
   - Expected: overview loads, no blank state, provider strip remains compact.

2. Auth overview:
   - Open `http://localhost:3004/auth-mvp/vedrid`.
   - Expected: same shell, auth menu works, no regression in Veðurstofan station selection.

3. Restricted provider state:
   - Temporarily use `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` with a user without provider access.
   - Expected: UI does not say generic "failed to fetch" unless an actual fetch failed.

4. URL restore:
   - Open `/vedrid?stationId=<known-station>`.
   - Select another station.
   - Use browser back/forward.
   - Expected: selected marker/card follows the URL state.

5. Vegagerdin empty state:
   - With no cached Vegagerdin data, expected: no broken UI, no false "current measurements" shown.

6. If a local cached fixture is added:
   - Expected: Vegagerdin appears as a separate provider layer.
   - Marker preview says current measurement and shows measured/fetched times distinctly.

Do not test:
- production
- SQL 80 execution
- live Vegagerdin fetch
- Vercel/env changes
- cron

## Uncertainty / Needs Confirmation

- I did not inspect a live Vegagerdin response. The raw field names remain unverified.
- I did not run full test suite.
- I did not run browser/localhost checks.
- I assume Stebbi still wants the next user-visible step to move toward provider-neutral overview + cache-only Vegagerdin layer, not route-risk integration yet.
