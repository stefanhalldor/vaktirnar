# TODO 086 v100 - Codex review of v099 cron middleware handoff

Created: 2026-07-13 18:07  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Reviewed handoff: `2026-07-13-1804-todo-086-v099-claude-cron-middleware-done.md`

## Findings

### Low - `PUBLIC_PATHS` uses prefix matching, so the new cron allowlist is not strictly exact

Files:
- `middleware.ts:33`
- `middleware.ts:140`
- `lib/__tests__/middleware.test.ts:345`

`middleware.ts` adds:

```ts
'/api/cron/warm-vedurstofan',
```

but public matching is:

```ts
const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
```

So this is not literally "exactly this one path". It also marks prefix variants as public, for example:

```text
/api/cron/warm-vedurstofan-extra
/api/cron/warm-vedurstofan/foo
```

The current new negative test checks `/api/cron/some-unknown-cron`, which is good, but it does not catch this prefix behavior.

This is low severity because there is currently only one real route handler at `/api/cron/warm-vedurstofan`, and the route handler still enforces `CRON_SECRET`. Unknown prefix paths should generally 404. But because the handoff explicitly says the opening is exact and narrow, Claude Code should either:

1. add a segment/exact public matching helper for this path, or
2. add tests for prefix variants and document why 404/public-prefix behavior is acceptable.

Codex preference: make the cron path exact rather than relying on route absence. The least surprising future-proof version is a small helper that treats selected public paths as exact while preserving prefix semantics for existing entries like `/s/`.

## What Codex verified

Codex read:

- `2026-07-13-1804-todo-086-v099-claude-cron-middleware-done.md`
- `middleware.ts`
- `app/api/cron/warm-vedurstofan/route.ts`
- `lib/__tests__/weather-vedurstofan-cron-route.test.ts`
- `lib/__tests__/middleware.test.ts`

Codex did not read `.env.local` and did not expose any secret.

Codex ran:

```powershell
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-vedurstofan-cron-route.test.ts
```

Result:

```text
2 files passed
38 tests passed
exit 0
```

Codex ran:

```powershell
npm run type-check
```

Result:

```text
exit 0
```

## Stebbi's localhost proof after v099

Negative auth check:

```powershell
$headers=@{Authorization="Bearer definitely-wrong"}; Invoke-RestMethod -Uri "http://localhost:3004/api/cron/warm-vedurstofan" -Headers $headers
```

Observed:

```text
GET /api/cron/warm-vedurstofan 401 in 1039ms
```

This is correct: wrong bearer token is rejected by route-level auth.

Positive auth check:

```powershell
cd C:\Users\Lenovo\Documents\vaktirnar; $secret=((Select-String -Path .env.local -Pattern '^CRON_SECRET=' | Select-Object -Last 1).Line -replace '^CRON_SECRET=','').Trim(); $headers=@{Authorization="Bearer $secret"}; Invoke-RestMethod -Uri "http://localhost:3004/api/cron/warm-vedurstofan" -Headers $headers
```

Observed:

```text
fresh           : 246
stale           : 0
unavailable     : 34
projected       : 246
skipped         : 0
errors          : 0
projectionRunId : 5
```

Server:

```text
GET /api/cron/warm-vedurstofan 200 in 45542ms
```

This confirms:

- middleware no longer blocks the endpoint before the route handler
- wrong bearer token fails
- correct bearer token succeeds
- warmer/projection path runs locally
- route duration is currently well under `maxDuration = 300`
- latest local projection run is `projectionRunId: 5`

## Full unavailable station list from latest pasted output

The latest terminal excerpt includes all 34 unavailable station IDs:

```text
31109
6745
4380
1487
1579
7736
4276
2693
495
6775
32363
32336
2642
1350
31372
4406
5316
3339
2691
3482
5992
7659
2640
1590
7753
1496
35545
2050
31374
7636
4019
3474
7472
6045
```

Each logged as:

```text
valid=false err="Gögn ekki aðgengileg í augnablikinu" forecasts=0
```

This still looks like provider/station data availability rather than an app error, because the run completed with `errors: 0`. It should be tracked as follow-up classification work: `forec` unsupported vs obs-only vs temporarily unavailable vs inactive.

## Release readiness

Not quite "ship it" from Codex yet, because of the prefix matching detail above.

The implementation is functionally proven locally and tests pass, but before commit/push Codex recommends one small tightening:

- make `/api/cron/warm-vedurstofan` exact in middleware public matching, or
- explicitly add prefix-variant tests and document why the current behavior is acceptable.

After that, Codex would consider the cron auth/middleware slice ready for Stebbi to explicitly approve commit/push.

Production still needs:

- fresh production `CRON_SECRET` because the local value was exposed during troubleshooting
- Vercel env vars checked
- `WEATHER_ENABLED=true` where intended
- no manual production cron invocation unless Stebbi explicitly approves it

## Suggested next instruction for Claude Code

```text
Claude Code, rýndu v100 Codex review og framkvæmdu eitt afmarkað follow-up fyrir TODO 086 cron middleware:

1. Lagaðu eða staðfestu prefix-match áhættuna í middleware public matching.
   - Nú er /api/cron/warm-vedurstofan í PUBLIC_PATHS en isPublic notar pathname.startsWith(p).
   - Það þýðir að /api/cron/warm-vedurstofan-extra og /api/cron/warm-vedurstofan/foo teljast líka public í middleware.
   - Codex mælir með exact/segment-safe matching fyrir þessa cron slóð frekar en að treysta á að óþekktar route slóðir 404-i.

2. Uppfærðu middleware tests þannig að þau nái prefix-variant edge case.

3. Keyrðu:
   - npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-vedurstofan-cron-route.test.ts
   - npm run type-check

Ekki commit-a, push-a, deploya, keyra Supabase/migration eða invoke-a production cron endpoint nema ég biðji sérstaklega um það.
```

## Localhost checks for Stebbi

After Claude Code resolves the prefix matching follow-up:

1. Restart localhost dev server manually.

2. Confirm wrong secret still fails:

```powershell
$headers=@{Authorization="Bearer definitely-wrong"}; Invoke-RestMethod -Uri "http://localhost:3004/api/cron/warm-vedurstofan" -Headers $headers
```

Expected: `401 Unauthorized`.

3. Confirm correct `.env.local` secret still succeeds without pasting the secret value:

```powershell
cd C:\Users\Lenovo\Documents\vaktirnar; $secret=((Select-String -Path .env.local -Pattern '^CRON_SECRET=' | Select-Object -Last 1).Line -replace '^CRON_SECRET=','').Trim(); $headers=@{Authorization="Bearer $secret"}; Invoke-RestMethod -Uri "http://localhost:3004/api/cron/warm-vedurstofan" -Headers $headers
```

Expected: HTTP 200 with fields like `fresh`, `unavailable`, `projected`, `errors`, `projectionRunId`.

4. Optional browser check: open `Elta veðrið` and confirm product-data freshness makes sense after the run.

5. Do not manually test production cron without explicit approval.
