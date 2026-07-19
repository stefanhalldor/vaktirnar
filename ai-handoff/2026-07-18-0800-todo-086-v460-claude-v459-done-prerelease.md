# TODO-086 v460 - Claude Code - v459 implemented, prerelease

Created: 2026-07-18 08:25
Timezone: Atlantic/Reykjavik
From: Claude Code
To: Stebbi (localhost review) / Codex (prerelease review)
Status: Implementation complete. Type-check clean. 104 test files pass, 3100 tests passed.

## What was implemented

Handoff v459 — Veðurpúls product contract hardening. Makes the provider contract explicit,
removes write access from Vedurstofan stations, tightens middleware preview routing,
and wires conditions feed links to the correct provider-aware pulse pages.

---

## Scope A — API provider and write contract

### thread/route.ts — strict provider

`provider` is now required and must be exactly `'vedurstofan'` or `'vegagerdin'`.
Any other value (including omitted/null/unknown string) returns 400 `provider must be vedurstofan or vegagerdin`.

Previously, anything except `'vegagerdin'` silently defaulted to `'vedurstofan'`.

### messages/route.ts — POST scope narrowed to PRIMARY_TARGET_TYPES

- GET remains `WEATHER_PULSE_ALL_TARGET_TYPES` — legacy Vedurstofan threads stay readable.
- POST now uses `WEATHER_PULSE_PRIMARY_TARGET_TYPES` (`['vegagerdin_station']`).
  Posting to a Vedurstofan thread returns 404 (scope check fails).
- Comments updated to reflect the split read/write contract.

### read/route.ts, report/route.ts, feed/route.ts — stale comments updated

All three routes had docblocks saying `targetType=vedurstofan_station`. Updated to reflect
actual ALL or PRIMARY scoping and the provider-neutral intent.

### vegagerdin/stations/[stationId]/preview/route.ts — comment fix

Fixed the contradictory comment that said both "Returns 400 if cache unavailable" and
"Returns [] if cache unavailable". Cache unavailable = [] (fail-open). Unknown station = 400.

---

## Scope B — Vedurstofan full-pulse route made read-only

**`app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`**

Removed: `useEffect` thread creation, `threadId`/`accessDenied`/`threadError` state,
`ScopedChatPanel`, `VEDURPULS_TRANSPORT`, `ThreadDto` import.

Added: `useChatPreview` with the Vedurstofan station preview URL, `ChatPreviewList`
for read-only message display.

The page now shows:
- Station name + legacy note (`pulseLegacyNote` translation key)
- Vedurstofan forecast context (unchanged)
- Read-only preview of any existing messages via `ChatPreviewList`

No thread is created on page load. No compose UI. No login CTA.

**Translation keys added** under `teskeid.vedrid.eltaVedrid`:

| Key | IS | EN |
|---|---|---|
| `pulseLegacyNote` | Vegaaðstæður eru nú skráðar á Vegagerðar stöðvum. Þessi síða sýnir veðurspá og eldri skilaboð, ef einhver eru. | Road-weather reports are now on Vegagerðin stations. This page shows the forecast and any legacy messages. |

---

## Scope C — Conditions feed targetHref dispatches on provider

**`components/weather/WeatherOverviewClient.tsx`**
**`components/weather/VedurstofanRoutePulseSummary.tsx`**

Both previously used `vedurstofanPulseHref` unconditionally for the feed item "view more" link.

Now dispatch on `target.provider`:
- `'vegagerdin'` → `vegagerdinPulseHref(target.targetId, returnTo)`
- otherwise → `vedurstofanPulseHref(target.targetId, returnTo)` (includes legacy Vedurstofan messages)

In WeatherOverviewClient the Vedurstofan returnTo includes `?stationId=` for the explorer;
for Vegagerðin the returnTo is just `stationPulseReturnBase` (no stationId query needed —
Vegagerðin pulse pages don't use the elta-vedrid explorer).

---

## Scope E — Middleware preview path hardening

Removed the two broad `startsWith` entries from `PUBLIC_PATHS`:
- `/api/teskeid/weather/vedurpuls/stations/`
- `/api/teskeid/weather/vedurpuls/vegagerdin/stations/`

Replaced with a `PREVIEW_PATH_PATTERNS: RegExp[]` array checked via `.some(r => r.test(pathname))`:
```
/^\/api\/teskeid\/weather\/vedurpuls\/stations\/[^/]+\/preview$/
/^\/api\/teskeid\/weather\/vedurpuls\/vegagerdin\/stations\/[^/]+\/preview$/
```

Only exact `.../stations/{id}/preview` paths are public. Any sibling or sub-path
(e.g. `.../stations/31392/other`, `.../stations/preview`) requires auth and returns 401.

---

## Files changed

- `app/api/auth-mvp/vedurpuls/thread/route.ts`
- `app/api/auth-mvp/vedurpuls/messages/route.ts`
- `app/api/auth-mvp/vedurpuls/read/route.ts`
- `app/api/auth-mvp/vedurpuls/feed/route.ts`
- `app/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview/route.ts`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/VedurstofanRoutePulseSummary.tsx`
- `middleware.ts`
- `messages/en.json`
- `messages/is.json`
- `lib/__tests__/vedurpuls-api.test.ts`
- `lib/__tests__/middleware.test.ts`

## Not changed

- No SQL executed. SQL 81 must still be run by Stebbi before Vegagerðin write flows work.
- No new Supabase functions, RLS, auth, or deployment changes.
- Vegagerðin pulse pages (`/puls/vegagerdin/stod/[id]`) unchanged — functional as of v457.
- No visible Vegagerðin station pins on the map yet (deferred — needs separate map work).

---

## SQL 81 status

`sql/81_teskeid_chat_target_type_vegagerdin_station.sql` is written but NOT run.

- Thread creation for `provider: 'vegagerdin'` will fail at the DB CHECK constraint until SQL 81 is run.
- The Vegagerðin pulse client will show an error state (thread creation fails → 500 from thread endpoint).
- The Vedurstofan preview and read flows are not affected.
- The feed and feed-preview queries will return `[]` for Vegagerðin (no threads exist yet).

After SQL 81 is run: Vegagerðin thread creation will succeed, users can post reports, and the feed will populate.

---

## Test results

```
Test Files  104 passed (104)
Tests  3100 passed | 27 skipped | 8 todo (3135)
```

TypeScript: clean (no errors).

---

## Localhost checks for Stebbi

1. **thread API rejects unknown/omitted provider**
   - POST `/api/auth-mvp/vedurpuls/thread` with `{ targetId: '31392' }` (no provider)
   - Expected: 400 `provider must be vedurstofan or vegagerdin`
   - POST with `{ provider: 'hack', targetId: '31392' }` — same 400.

2. **Vedurstofan full pulse page is read-only**
   - Open `/auth-mvp/vedrid/puls/stod/31392` (replace with a real station ID).
   - Expected: page loads with station name and `pulseLegacyNote` subtitle.
   - Expected: no loading spinner for thread, no compose box.
   - Expected: preview messages shown (if any exist) or empty state.
   - Expected: Vedurstofan forecast shown below the note.
   - Expected: no POST to `/api/auth-mvp/vedurpuls/thread` in network tab.

3. **message POST rejects Vedurstofan threads**
   - If a Vedurstofan thread ID exists, POST to `/api/auth-mvp/vedurpuls/messages`
     with that threadId.
   - Expected: 404 (scope check fails — vedurstofan_station not in PRIMARY_TARGET_TYPES).

4. **Conditions feed "view more" links are provider-aware**
   - Open the conditions feed drawer in the overview or in a travel result.
   - If feed items exist with `provider: 'vegagerdin'`, the "view more" link should open
     `/auth-mvp/vedrid/puls/vegagerdin/stod/[id]`.
   - If feed items exist with `provider: 'vedurstofan'` (legacy), link opens
     `/auth-mvp/vedrid/puls/stod/[id]`.

5. **Middleware preview path patterns are exact**
   - GET `/api/teskeid/weather/vedurpuls/stations/31392/preview` (no auth) → 200 (public).
   - GET `/api/teskeid/weather/vedurpuls/stations/31392/other` (no auth) → 401 (not public).
   - GET `/api/teskeid/weather/vedurpuls/vegagerdin/stations/V1234/preview` (no auth) → 200.
   - GET `/api/teskeid/weather/vedurpuls/vegagerdin/stations/V1234/other` (no auth) → 401.

6. **Vegagerðin pulse page (before SQL 81)**
   - Open `/auth-mvp/vedrid/puls/vegagerdin/stod/[validStationId]`.
   - Expected: page loads, measurement card visible, nearby forecast cards visible.
   - Expected: chat panel shows an error state (thread creation fails at DB level).
   - This is expected until SQL 81 is run.
