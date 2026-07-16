# TODO 086 v091 - Claude: prerelease handoff

Created: 2026-07-13 16:44
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input: `2026-07-13-1635-todo-086-v090-claude-pagination-hotfix-done.md`

---

## Commits í þessari lotu (allt pushed)

| Commit | Hvað |
|---|---|
| `194b02a` | fix: log-safety, maxDuration, fresh/stale counts, warmer tests + admin UX (#86) |
| `dff8393` | feat: switch Elta veðrið to read from vedurstofan_forecasts_latest (#86) |
| `076d2b4` | fix: paginate readVedurstofanProductForStations to prevent row truncation (#86) |

---

## Staða

```
npm run test:run
Tests: 2369 passed (79 files) — 0 failures

npm run type-check: exit 0

npm run build: exit 0 (production build clean)
```

---

## Hvað er á origin/main

### 194b02a — log-safety, maxDuration, fresh/stale, warmer tests, admin UX

- `app/api/admin/weather/warm-vedurstofan/route.ts`: `export const maxDuration = 300`, removed dynamic `err` from logs
- `app/api/admin/weather/project-vedurstofan/route.ts`: removed dynamic `err` from logs
- `lib/weather/providers/vedurstofan.server.ts`: `VedurstofanWarmResult` hefur nú `fresh`, `stale`, `unavailable` í stað einnar `ok`
- `app/(admin)/admin/page.tsx`: useTransition → useState, 7-field result display, confirm() dialog á warmer
- `lib/__tests__/weather-vedurstofan-warmer.test.ts`: 11 ný tests (warmer result shape, status counts, projection fields, never throws)
- `lib/__tests__/weather-vedurstofan-warmer-route.test.ts`: updated mock til fresh/stale/unavailable

### dff8393 — UI switch til product table

- `app/api/teskeid/weather/vedurstofan/stations/route.ts`: les nú úr `vedurstofan_forecasts_latest` í gegnum `readVedurstofanProductForStations` í stað `readVedurstofanCacheForStations`
- `lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts`: mock uppfærður

### 076d2b4 — pagination hotfix (P1 frá Codex v089)

- `lib/weather/providers/vedurstofan.server.ts`: `readVedurstofanProductForStations` er nú paginated með `PAGE_SIZE = 1000`
  - `.order('station_id').order('forecast_time')` (deterministic)
  - `.range(from, from + PAGE_SIZE - 1)` loop þar til `data.length < PAGE_SIZE`
  - Fail-open á mid-pagination villu: skilar rows sem þegar hafa verið sóttir
- `lib/__tests__/weather-vedurstofan-product-reader.test.ts`: 11 ný tests (multi-page fetch, partial map á villu, status/field mapping)

---

## Feature gates (blast radius takmarkaður)

Route `/api/teskeid/weather/vedurstofan/stations` er aðeins aðgengileg með:
- `AUTH_MVP_ENABLED`
- `WEATHER_ENABLED`
- `WEATHER_ELTA_VEDRID_FLAG`
- per-user `vedrid` + `elta-vedrid`

---

## Hvað er eftir (TODO 086)

1. Exact per-station replace semantics (P2 frá v079) -- RPC eða generation marker
2. `type=obs` observation parser -- `vedurstofan_observations_latest`
3. Cron job -- Vercel cron → warm + project API route
4. Travel route -- convert live Veðurstofan enrichment yfir í product-table reads

---

## Localhost checks fyrir Stebbi

1. Keyra admin warmer ("Sækja allar 280 stöðvar") og projector
2. Opna `/auth-mvp/vedrid/elta-vedrid` -- ætti að sýna stöðvar með `ok`/`stale` status
3. Athuga að einstaka stöðvar hafi fleiri en eina forecast-röð
4. Regression: `/auth-mvp/vedrid` travel-weather flow ósnert
