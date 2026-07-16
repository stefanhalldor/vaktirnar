# TODO 086 - Claude Code Phase 1C done

Created: 2026-07-12 12:00
Timezone: Atlantic/Reykjavik
Author: Claude Code
Type: Implementation done handoff

---

## What was implemented

Phase 1C: Veðurstofan fetch/cache wrapper (server-only).

### New files

**`lib/weather/providers/vedurstofan.server.ts`**

Server-only fetch/cache wrapper. No MET/Yr files were touched.

Exports:
- `fetchVedurstofanForecastsForStations(stationIds: string[]): Promise<Map<string, VedurstofanStationResult>>`
- `cacheKeyForStation(stationId: string): string` (also exported for tests/auditing)
- `VedurstofanStationForecastCache` type
- `VedurstofanStationResult` type

**`lib/__tests__/weather-vedurstofan-server.test.ts`**

16 tests. No network calls. All mocked via vitest.

---

## Design decisions

**Cache-first.** Same pattern as `metno.server.ts`: read cache first, return immediately if fresh, only fetch on miss/stale, upsert after successful fetch.

**Cache key:** `vedurstofan:xml:forec:is:3h:F-D-T-R-W:{stationId}` — encodes all response dimensions. No key collision risk if observations, 6h steps, English responses or different params are added later.

**TTL:** 90 minutes fixed. Veðurstofan-specific — justified by 3h forecast step frequency and absence of reliable `Expires` headers from the XML service.

**Batch max:** 10 station IDs per HTTP request.

**Verified-only filter:** `VERIFIED_STATION_IDS` is built from `VEDURSTOFAN_STATIONS.filter(s => s.coordinatesVerified)`. Unverified IDs return `{ status: 'unavailable' }` immediately without a fetch.

**Fail-open:** Three result states:
- `{ status: 'ok', payload }` — fresh data (cache or live fetch)
- `{ status: 'stale', payload }` — expired cache returned because fetch failed
- `{ status: 'unavailable' }` — unverified ID, or no cache and fetch failed

Never throws. Veðurstofan failures cannot propagate to MET/Yr route calculation.

**Attribution in every payload:** `attribution.provider`, `attribution.downloadedAtIso`, `attribution.serviceUrl` stored with every cached station payload. `fetchedAtIso` also present.

**Cache key in `weather_cache`:** Uses existing table (`sql/67_weather_cache.sql`) with no schema changes. `response_body jsonb NOT NULL` stores the parsed payload. `last_modified` is always `null` (XML service does not provide reliable `Last-Modified`).

---

## Verification

```
npm run test:run -- lib/__tests__/weather-vedurstofan-server.test.ts
Test Files  1 passed (1)
Tests       16 passed (16)
Exit code   0
```

```
npm run test:run -- lib/__tests__/weather-vedurstofan-xml.test.ts lib/__tests__/weather-vedurstofan-stations.test.ts
Test Files  2 passed (2)
Tests       49 passed (49)
Exit code   0
```

```
npm run type-check
tsc --noEmit
Exit code 0
```

---

## What was NOT done

- No `route.ts`, `assessment.ts`, `travel.ts`, or `trip-assessment.ts` changes.
- No user-visible UI.
- No route result changes.
- No shadow comparison logic.
- No cron or scheduled warming (Phase 1D).
- No SQL migration or schema changes.
- No `If-Modified-Since` / 304 handling.
- No use of `FG`/`FX` gusts for scoring.
- No commit, push, deploy.

---

## Phase summary

| Phase | Status | Files |
|---|---|---|
| 1A | Done | `vedurstofanXml.ts`, `weather-vedurstofan-xml.test.ts` |
| 1B | Done | `vedurstofanStations.ts`, `weather-vedurstofan-stations.test.ts` |
| 1C | Done | `vedurstofan.server.ts`, `weather-vedurstofan-server.test.ts` |
| 1D | Not started | Scheduled cache warmer (separate permission) |
| 2 | Not started | Shadow comparison + UI layer (separate permission) |

All Phase 1A/1B/1C files remain untracked (no commit yet). Total: 4 new files.

---

## Localhost checks for Stebbi

Nothing user-visible changed.

1. `npm run test:run -- lib/__tests__/weather-vedurstofan-server.test.ts` — expect 16 pass.
2. `npm run test:run -- lib/__tests__/weather-vedurstofan-xml.test.ts lib/__tests__/weather-vedurstofan-stations.test.ts` — expect 49 pass.
3. `npm run type-check` — expect clean.
4. Open `/vedrid` on localhost, calculate a route — behavior unchanged, no Veðurstofan network calls.

No Supabase, auth, RLS, SQL, billing, secrets or user-data behavior changed.
