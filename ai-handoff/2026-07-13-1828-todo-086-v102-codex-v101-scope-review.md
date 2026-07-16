# TODO 086 v102 - Codex review of v101 travel route product-table scope

Created: 2026-07-13 18:28  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Reviewed handoff: `2026-07-13-1827-todo-086-v101-claude-travel-route-product-table.md`

## Findings

### High - v101 is no longer only `elta-vedrid` under feature flag

Files:
- `app/api/teskeid/weather/travel/route.ts`
- `lib/__tests__/weather-travel-api.test.ts`

Stebbi asked: "Erum við ekki enn bara að vinna í elta-vedrid undir flaggi?"

Yes, that was the intended safety boundary as Codex understands it: use `elta-vedrid` as the feature-gated validation surface while proving Veðurstofan product-table data, station completeness, freshness, and unavailable-station behavior.

v101 crosses that boundary.

The changed file is:

```text
app/api/teskeid/weather/travel/route.ts
```

That is the actual travel weather API used by the main weather flow, not only the `elta-vedrid` validation page. The diff switches this route from live/cache Veðurstofan fetching to `readVedurstofanProductForStations(...)`:

```ts
import { readVedurstofanProductForStations } from '@/lib/weather/providers/vedurstofan.server'
```

and:

```ts
vedurstofanStationIds.length > 0
  ? readVedurstofanProductForStations(vedurstofanStationIds)
  : Promise.resolve(null),
```

Codex did not see an `elta-vedrid` feature gate or separate rollout flag around this behavior in the diff. The route has existing weather flags such as `WEATHER_ENABLED` / `WEATHER_PUBLIC_ENABLED`, but those are not the same as "only the new validation view under `elta-vedrid`".

Impact:

- Normal weather/travel users may now receive Veðurstofan enrichment from product tables instead of the prior path.
- If product tables are stale, empty, partially warmed, or not deployed/migrated in an environment, main weather-route behavior changes.
- This couples the cron/product-table rollout to the user request path earlier than Stebbi's stated validation-first intent.

Recommendation:

Do not proceed with v101 as-is unless Stebbi explicitly approves moving product-table reads into the main travel route now.

Safer paths:

1. Revert/hold v101 and keep product-table reads only in `elta-vedrid` for validation.
2. Or gate travel-route product reads behind a dedicated server flag, e.g. `VEDURSTOFAN_PRODUCT_READS_ENABLED`, default false.
3. Or expose both code paths and use product-table reads only for `elta-vedrid`/internal validation requests, not regular weather users.

Codex preference for now: hold/revert v101 or put it behind a dedicated fail-closed server flag before any commit/push.

## What Codex checked

Codex read:

- `ai-handoff/README.md`
- `2026-07-13-1827-todo-086-v101-claude-travel-route-product-table.md`
- `git status --short`
- `git diff -- app/api/teskeid/weather/travel/route.ts lib/__tests__/weather-travel-api.test.ts`
- searched for `readVedurstofanProductForStations`, `fetchVedurstofanForecastsForStations`, `elta-vedrid`, and weather flags in the changed route/test

Codex did not read `.env.local`.

Codex did not run tests for v101 in this review. Claude's v101 handoff reports:

```text
npm run test:run -- lib/__tests__/weather-travel-api.test.ts
9 passed
npm run type-check
exit 0
npm run test:run
2385 passed
```

Those results may be technically green, but they do not answer the product/scope question.

## Scope interpretation

`elta-vedrid` is currently valuable as a validation and inspection surface:

- all stations
- station freshness/status
- product-table availability
- unavailable station classification
- UI proof before integrating into user route decisions

The main `/api/teskeid/weather/travel` route is product behavior. Changing it means we are no longer only validating; we are changing user-facing weather enrichment behavior.

This may be the correct future architecture, but it should be a deliberate rollout step after Stebbi explicitly says the validation phase is complete enough.

## Suggested instruction to Claude Code

```text
Claude Code, stoppaðu v101 scope og bregstu við Codex v102 review.

Stebbi staðfesti að við eigum enn að vinna Veðurstofan product-table integration undir elta-vedrid feature gate/validation surface, ekki breyta aðal /api/teskeid/weather/travel user path nema það sé sérstaklega samþykkt.

V101 breytti app/api/teskeid/weather/travel/route.ts þannig að aðal travel weather API les Veðurstofan úr product table. Það er scope-drift út fyrir elta-vedrid flaggið.

Gerðu eitt af eftirfarandi, með sem minnstu breytingascope:
1. Revert-aðu v101 breytinguna á app/api/teskeid/weather/travel/route.ts og lib/__tests__/weather-travel-api.test.ts þannig að aðal travel route fari aftur í fyrri hegðun, eða
2. Settu product-table read í aðal travel route á sér server-side feature flag sem er default false, t.d. VEDURSTOFAN_PRODUCT_READS_ENABLED, þannig að núverandi user path breytist ekki nema Stebbi kveiki sérstaklega á því.

Codex mælir með leið 1 núna nema þú hafir sterka ástæðu fyrir leið 2.

Ekki breyta Supabase, migrations, .env.local, secrets, commit, push, deploy eða production cron. Keyrðu targeted travel API test og type-check eftir breytinguna og skilaðu handoff.
```

## Localhost checks for Stebbi

After Claude Code resolves this:

1. Open the regular weather/travel flow on localhost, not only `elta-vedrid`.
2. Run a normal route search that previously worked.
3. Confirm the main weather route still behaves as before unless Stebbi explicitly enabled a new product-read flag.
4. Open `elta-vedrid` and confirm product-table validation still works there.
5. Do not test production cron or production route behavior casually; those can write/read production weather product data and require explicit approval.

## Bottom line

Stebbi's instinct is right.

If the current agreed phase is "build and validate under `elta-vedrid`", v101 should not silently switch the real travel route to product-table reads. That step should be its own approved rollout phase.
