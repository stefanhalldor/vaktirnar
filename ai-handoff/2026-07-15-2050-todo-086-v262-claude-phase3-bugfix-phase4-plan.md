# 2026-07-15 21:00 - TODO-086 v262 - Claude: Phase 3 bugfix + Phase 4 plan

## Phase 3 Bugfix (uncommitted)

### Bug: WeatherPulsePanel did not reset when switching stations

`app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`

**Root cause:** `StationDetail` had no `key` prop, so React re-rendered it with new station props without re-mounting. `WeatherPulsePanel` kept its old `threadId` and `messages` from the previous station — messages from station A appeared when station B was selected.

**Fix:** Added `key={selectedStation.stationId}` to `<StationDetail>`:

```tsx
{selectedStation && <StationDetail key={selectedStation.stationId} station={selectedStation} />}
```

React now fully unmounts and remounts `StationDetail` (and all children including `WeatherPulsePanel`) when the selected station changes. Each station gets a clean slate.

**Status:** Fixed, not yet committed. `npm run type-check` passes.

---

## Phase 4 Plan — Safnpúls (Aggregated Pulse)

Stebbi wants two additions on top of the per-station pulse:

### 1. Safnpúls (aggregated view)

A unified feed showing all station pulse messages in chronological order, with station name shown next to each message.

- Reads from multiple per-station threads
- Does NOT duplicate storage — threads remain per-station
- Shows station name as a label on each message row
- Implemented as a new UI view (not a new API route necessarily — could poll multiple threads client-side, or a new server-side aggregation endpoint)

### 2. Almennur púls (general / cross-station channel)

A channel not tied to any specific station.

- Messages sent here do NOT appear on any individual station thread
- Messages DO appear in the safnpúls feed
- Implemented as a special thread with `targetId = 'general'` (or similar sentinel) under the same `domain: 'weather'` and a new `targetType` like `'general'`
- OR as a new `targetType: 'weather_general'` thread

---

## Architecture Questions for Codex Before Phase 4

### Q1: How to implement the aggregated feed?

**Option A — Client-side merge:** Client fetches each station thread separately and merges locally. Simple but does not scale beyond ~10 stations, and N+1 requests.

**Option B — New API endpoint:** `GET /api/auth-mvp/vedurpuls/feed` that queries `teskeid_chat_messages` joined with `teskeid_chat_threads` across all weather threads, ordered by `created_at`, with `target_name` included in the result. More efficient. Requires a new `FeedMessageDto` with `stationName` and `stationId` fields.

Recommendation: Option B. The repository already has all the data in `teskeid_chat_threads.target_name`. A single query with a join is straightforward.

### Q2: How to implement the general channel?

**Option A — New targetType:** `domain: 'weather'`, `targetType: 'weather_general'`, `targetId: 'global'`. Requires widening the SQL CHECK constraint on `teskeid_chat_threads.target_type` and adding a new scope constant.

**Option B — New domain:** `domain: 'weather_general'`. Less invasive, but adds a new domain value.

**Option C — Special sentinel in existing targetType:** Keep `targetType: 'vedurstofan_station'` but use a sentinel `targetId` like `'__general__'`. Not recommended — violates the intent of targetId being a real station ID.

Recommendation: Option A. Requires a SQL migration to widen the `target_type` CHECK constraint (or remove it and rely on application-level validation), a new `WEATHER_GENERAL_SCOPE` constant, and a new `POST /api/auth-mvp/vedurpuls/general/thread` route (or reusing the thread route with a different scope).

### Q3: Where does the safnpúls UI live?

Not inside a single station card — it spans all stations. Options:

- A new section at the top of `/auth-mvp/vedrid/elta-vedrid` before the station list
- A separate tab or page under `/auth-mvp/vedrid/vedurpuls`
- A panel in the main `/auth-mvp/vedrid` route

Stebbi to decide. Given that the station explorer is currently behind `elta-vedrid` flag, a new separate surface may make more sense.

---

## Current State Summary

| Phase | Status | Commit |
|-------|--------|--------|
| Phase 1 — DB + lib/chat/ core | Done | d75085e |
| Phase 2 — 4 API routes | Done | 5d75bf8 |
| Phase 3 — WeatherPulsePanel UI | Done | 1bdbf5c |
| Phase 3 bugfix — key prop | Done, uncommitted | — |
| Phase 4 — Safnpúls + almennur púls | Not started | — |

## Files Modified But Uncommitted

- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx` (key prop fix only)

## Localhost Checks for Stebbi

After the key prop fix:

1. Open `/auth-mvp/vedrid/elta-vedrid`
2. Select station A — open Veðurpúls, send a message
3. Click station B on map or list — Veðurpúls panel should be closed/reset
4. Open Veðurpúls on station B — should show empty state or B's messages only, not A's messages
5. Go back to station A — should show A's message again (loaded from server)
