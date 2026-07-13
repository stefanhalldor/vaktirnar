# TODO 086 v093 - Claude: Veðurstofan cron job lokið

Created: 2026-07-13 16:53
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input: `2026-07-13-1647-todo-086-v092-codex-v091-prerelease-review.md`

---

## Hvað var gert

### Ný skrá: `app/api/cron/warm-vedurstofan/route.ts`

Vercel cron route sem keyrir sjálfkrafa á 6 klst. fresti:

- `export const maxDuration = 300` (sama og admin warmer route)
- `Authorization: Bearer CRON_SECRET` check -- skilar 401 ef rangt/vantar
- `WEATHER_ENABLED !== 'true'` check -- skilar `{ skipped: 'weather disabled' }` með 200 (preview deployments þar sem flag er af fá ekki API calls)
- Kallar `warmVedurstofanForecastCache()` -- warmerinn keyrir projector innbyrðis, þ.e. ein kall dugar
- Skilar öllum 7 fields: `fresh`, `stale`, `unavailable`, `projected`, `skipped`, `errors`, `projectionRunId`
- Fail-safe: `catch` block skilar 500 með log, kastar aldrei

### Uppfært: `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/cleanup-chats", "schedule": "0 * * * *" },
    { "path": "/api/cron/warm-vedurstofan", "schedule": "0 */6 * * *" }
  ]
}
```

Keyrðist á 00:00, 06:00, 12:00, 18:00 UTC.

### Ný test skrá: `lib/__tests__/weather-vedurstofan-cron-route.test.ts`

8 tests í 3 describe blocks:

**Auth:**
- 401 með ekkert Authorization header
- 401 með rangan secret
- 200 og warmer kallaður með réttan secret

**Feature flag:**
- 200 með `skipped: 'weather disabled'` þegar `WEATHER_ENABLED` er ekki sett
- Warmer kallaður þegar `WEATHER_ENABLED=true`

**Response:**
- Skilar öllum 7 warmer result fields
- 500 ef warmer kastar
- Secret lekur ekki í response body

---

## Test staða

```
npm run test:run lib/__tests__/weather-vedurstofan-cron-route.test.ts
8 passed — exit 0

npm run type-check: exit 0

npm run test:run (full suite)
Tests: 2378 passed (80 files) — 0 failures
```

---

## Óbreytt

Engar aðrar skrár breyttust. Admin routes, warmer, projector og öll önnur tests eru ósnert.

---

## Hvað er eftir (TODO 086)

1. Exact per-station replace semantics (P2 frá v079) -- RPC eða generation marker
2. `type=obs` observation parser -- `vedurstofan_observations_latest`
3. Travel route -- convert live Veðurstofan enrichment yfir í product-table reads

---

## Athugasemdir

- Cron keyrir einu sinni á Vercel Pro plan per schedule entry -- ef warmer tekur >300s mun Vercel drepa requestinn (sama timeout og admin warmer route).
- `CRON_SECRET` þarf að vera sett í Vercel environment variables (Production + Preview) til að cron virki.
- Þar sem `warmVedurstofanForecastCache()` er fail-open mun cron aldrei brotna á HTTP 500 nema outer try/catch grípi eitthvað óvænt.
