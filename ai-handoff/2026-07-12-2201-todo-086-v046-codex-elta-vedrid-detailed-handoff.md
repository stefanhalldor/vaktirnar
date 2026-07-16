# TODO 086 - v046 detailed handoff for "Elta vedrid"

Created: 2026-07-12 22:01
Timezone: Atlantic/Reykjavik
Author: Codex
Type: Detailed implementation handoff / plan
Inputs reviewed:
- `ai-handoff/2026-07-12-2158-todo-086-v045-claude-vedurstofan-removed-from-card.md`
- `ai-handoff/2026-07-12-2113-todo-086-v040-codex-v039-phase2b-product-review.md`
- `ai-handoff/2026-07-12-2150-todo-086-v044-codex-v043-distance-semantics-review.md`
Scope: Planning/handoff only. No source code changes, no commit, no push, no deploy, no migration.

## Current state

TODO 086 Phase 2A and the cleanup hotfix have been released:

- `a1eda72 feat: show Veðurstofan station comparison in route point detail card (#86)`
- `597ccd6 feat: remove Veðurstofan from route point detail card (#86)`

The latest `main`/`origin/main` is `597ccd6`.

After v045:

- Veðurstofan is no longer shown inside the MET/Yr route point detail card.
- `RouteWeatherPoint` still has `vedurstofanStation`.
- The route API still enriches route weather points with `vedurstofanStation`.
- `fetchVedurstofanForecastsForStations(...)` still exists and uses `weather_cache`.
- `VEDURSTOFAN_STATIONS` still contains the curated, verified station list.
- `selectNearestVedurstofanRow(...)` still exists but should not drive the first station explorer UI.

This is a good base for a separate station explorer.

## Product goal

Build **"Elta vedrid" Phase 2B0** as an internal/feature-gated station explorer:

- Show all curated Vedurstofan stations on an Iceland map.
- No route calculation.
- No origin/destination inputs.
- No MET/Yr route point comparison.
- No verdict, heatmap, provider filter, or recommendation logic.
- Clicking a station shows station metadata and all available Vedurstofan forecast rows.

The purpose is validation and understanding:

- Are the station coordinates correct?
- Are stations distributed as expected around Iceland?
- Which stations have fresh/stale/unavailable data?
- What values does the XML service return for each station?
- Does this data deserve a later product surface or route-comparison layer?

## Future-ready principle

This must be built as **validation-first, future-ready**.

The first use case is to let Stebbi validate Vedurstofan station coordinates,
coverage, freshness, and raw forecast values. But the implementation should not
be throwaway debug code. It should become the first real foundation for a
Vedurstofan data/product layer that can later support:

- an internal or public "Elta vedrid" product surface
- a standalone Vedurstofan station layer on a map
- provider comparison in a later phase
- station coverage/confidence display
- freshness/cache monitoring
- a canonical Supabase weather store later, if Stebbi chooses that direction

What must be future-ready in Phase 2B0:

- A clean API contract for station metadata, forecast rows, status, freshness,
  and attribution.
- A pure data transform/helper if the API mapping becomes non-trivial, so the
  station payload can be reused outside the first page.
- UI semantics that are station-first, not route/Yr-point-first.
- A clear status model: `ok`, `stale`, `unavailable`, with `atimeIso`,
  `fetchedAtIso`, and `expiresAtIso`.
- Attribution/source/freshness shown from the start.
- Feature-gated/internal access now, without hardcoding assumptions that would
  make a future public/product version difficult.

What should **not** be added yet just because the code is future-ready:

- No canonical Supabase weather store in Phase 2B0.
- No new SQL or migration.
- No provider verdict.
- No public release.
- No route heatmap changes.
- No "Vedurstofan only" decision layer.
- No broad product navigation unless Stebbi explicitly asks for it.

In short: build the first version like a real reusable product/data layer, but
keep the first exposure limited to validation.

## Strong recommendation

Do this as a **separate internal page**, not as a mode inside the existing route result card.

Recommended route:

- `app/auth-mvp/vedrid/elta-vedrid/page.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/loading.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`

Recommended API route:

- `app/api/teskeid/weather/vedurstofan/stations/route.ts`

The first version can be reachable by direct URL only:

- `/auth-mvp/vedrid/elta-vedrid`

Optional later: add a small authenticated-only link from `/auth-mvp/vedrid` under the existing "Fyrir þá sem eru að elta veðrið" area. Do **not** add it to public `/vedrid` or guest flow in the first pass.

## Access / feature gate

Use existing `vedrid` access for the first version.

Server page:

- Call `guardTeskeidSession()`.
- Call `guardFeatureAccess(user.email!, 'vedrid')`.
- Render the station explorer client.

API route:

- Return `404` if `AUTH_MVP_ENABLED !== 'true'` or `WEATHER_ENABLED !== 'true'`.
- Require authenticated user.
- Use `checkFeatureAccess(user.id, user.email, 'vedrid')`.
- Return `404` when authenticated user lacks `vedrid` access, consistent with existing weather APIs.
- Do not allow guest/public access, even if `WEATHER_PUBLIC_ENABLED === 'true'`.

Do not depend on the currently dirty/uncommitted `ferdalagid` feature-gate changes unless they have been separately committed and reviewed. `vedrid` is the stable gate available now.

## Data source

Use the existing source of truth:

- Station metadata: `VEDURSTOFAN_STATIONS` from `lib/weather/providers/vedurstofanStations.ts`.
- Forecast/cache wrapper: `fetchVedurstofanForecastsForStations(...)` from `lib/weather/providers/vedurstofan.server.ts`.

Do **not** create a new Supabase table in Phase 2B0.

Do **not** run migrations.

Do **not** change RLS, grants, policies, auth, or schema.

Use the existing `weather_cache` behavior:

- Cache-first.
- 90 minute TTL.
- Fetches verified stations only.
- Batches up to 10 station IDs per request.
- Returns `ok`, `stale`, or `unavailable`.
- Writes to `weather_cache` via service role when fresh data is fetched.

Important implementation detail:

`fetchVedurstofanForecastsForStations` processes live batches sequentially. With 29 stations and 10 per batch, live fetch can require up to 3 batches. If using `timeoutMs: 1500`, worst-case live wait can be roughly 4.5 seconds plus overhead. That is acceptable for an internal validation page, but the UI must show loading state.

Recommended API call:

```ts
const stationIds = VEDURSTOFAN_STATIONS.map(s => s.stationId)
const results = await fetchVedurstofanForecastsForStations(stationIds, { timeoutMs: 1500 })
```

Optional API-level response budget:

- If Claude Code wants to guard the user response, add a local `withTimeout` around the full fetch, similar to the route API.
- If the budget expires, return station metadata with `status: 'unavailable'` or `status: 'not_loaded'` rather than failing the page.
- Keep this simple; do not over-engineer cancellation in Phase 2B0.

## API response contract

Suggested response:

```ts
type VedurstofanStationExplorerResponse = {
  generatedAtIso: string
  attribution: {
    provider: 'Veðurstofa Íslands'
    serviceUrl: string
  }
  summary: {
    total: number
    ok: number
    stale: number
    unavailable: number
  }
  stations: Array<{
    stationId: string
    stationName: string
    owner: string
    lat: number
    lon: number
    coordinatesVerified: boolean
    status: 'ok' | 'stale' | 'unavailable'
    atimeIso: string | null
    fetchedAtIso: string | null
    expiresAtIso: string | null
    forecastCount: number
    forecasts: Array<{
      ftimeIso: string
      windSpeedMs: number | null
      windDirectionText: string | null
      temperatureC: number | null
      precipitationMmPerHour: number | null
      weatherText: string | null
    }>
    parseErrors: string[]
  }>
}
```

Notes:

- Include every station from `VEDURSTOFAN_STATIONS`, even if `unavailable`.
- Preserve station metadata even when forecast data is missing.
- Do not include route distance or route confidence in this response. There is no route here.
- Keep `serviceUrl` or attribution available so the UI can show source.
- Avoid exposing secrets, Supabase details, user id, or cache internals.

## UI design

Follow `Design.md`:

- Mobile-first.
- App-like, not a landing page.
- No hero.
- No nested cards.
- No decorative gradient/orb treatment.
- Text in `messages/is.json` and `messages/en.json`.
- No horizontal overflow at 360, 390, 460 px.
- Controls at least ~40px touch target.
- Use existing Teskeid tokens where possible.
- Use lucide icons only where useful.

Suggested first screen:

1. Compact page header:
   - Title: `Elta vedrid`
   - Small subtitle: `Veðurstofustöðvar til sannprófunar - hafa ekki áhrif á ferðamat.`
   - Back link/button to `/auth-mvp/vedrid`.

2. Status summary strip:
   - Total stations.
   - Fresh/ok count.
   - Stale count.
   - Missing/unavailable count.
   - Last loaded time.

3. Map:
   - Uses Google Maps JS through existing `loadMapsLibrary`, `loadMarkerLibrary`, `loadCoreLibrary`.
   - Fit bounds to all station coordinates.
   - No route polyline.
   - No MET/Yr forecast point markers.
   - Marker colors by data status:
     - ok: primary/green
     - stale: amber
     - unavailable: neutral gray
   - Status must not be color-only: marker title and detail/list rows need text.

4. Station list/detail:
   - On mobile, show selected station details below the map.
   - On desktop, a side-by-side layout is fine if it does not become dashboard-heavy.
   - Clicking marker selects the station and scrolls/focuses detail if practical.
   - List can be compact rows below the map. Cards are okay for individual repeated station rows.

5. Filters:
   - First version may include a small segmented control:
     - `Allar`
     - `Í lagi`
     - `Gömul`
     - `Vantar`
   - Avoid adding search/filter complexity unless needed.

6. Station detail content:
   - Station name.
   - Station ID.
   - Owner.
   - Coordinates.
   - Coordinates verified state.
   - Data status: fresh/stale/unavailable.
   - `atimeIso` as forecast generated time if present.
   - `fetchedAtIso` and `expiresAtIso` if present.
   - Forecast rows table/list with all rows:
     - Time
     - Wind speed + direction
     - Precipitation
     - Temperature
     - Weather text

7. Empty/error/loading states:
   - Loading while API fetches.
   - Error when API fails.
   - Empty state should be defensive only, since curated station list should not be empty.
   - Map unavailable state if Google Maps fails, with list still usable.

## Map implementation notes

Use existing browser-only Google Maps helper:

- `loadMapsLibrary()`
- `loadMarkerLibrary()`
- `loadCoreLibrary()`

Prefer classic `google.maps.Marker` like `TravelAuditMap` already does. It avoids `mapId` requirements and keeps scope small.

Suggested map defaults:

- Center Iceland around `{ lat: 64.9, lng: -18.8 }`.
- Zoom around 5 or fit bounds to station list.
- `gestureHandling: 'cooperative'`.
- `mapTypeControl: false`, `streetViewControl: false`, `fullscreenControl: false`.
- `clickableIcons: false`.

Do not reuse `TravelAuditMap` directly. It is route-specific and carries route/forecast-point semantics that caused the product confusion. Extract tiny map helpers only if useful, but keep "station map" conceptually separate.

## Message keys

Add new keys under a new namespace, for example:

```json
"eltaVedrid": {
  "title": "Elta veðrið",
  "subtitle": "Veðurstofustöðvar til sannprófunar. Þær hafa ekki áhrif á ferðamat enn sem komið er.",
  "back": "Til baka í ferðaveðrið",
  "loading": "Sæki Veðurstofugögn...",
  "loadError": "Náði ekki að sækja Veðurstofugögn. Reyndu aftur.",
  "mapUnavailable": "Kortið náði ekki að hlaðast. Stöðvalistinn virkar samt.",
  "stationsTotal": "{count} stöðvar",
  "statusOk": "Ný gögn",
  "statusStale": "Gömul gögn",
  "statusUnavailable": "Vantar gögn",
  "filterAll": "Allar",
  "filterOk": "Í lagi",
  "filterStale": "Gömul",
  "filterUnavailable": "Vantar",
  "stationId": "Stöð",
  "owner": "Eigandi",
  "coordinates": "Hnit",
  "forecastGenerated": "Spá búin til",
  "fetchedAt": "Sótt",
  "expiresAt": "Gildir til",
  "forecastRows": "Spágildi",
  "noForecastRows": "Engin spágildi fundust fyrir þessa stöð.",
  "attribution": "Gögn frá Veðurstofu Íslands"
}
```

Exact wording can be refined, but all user-facing strings must be in both `messages/is.json` and `messages/en.json`.

## Recommended file changes for implementation

Expected new files:

- `app/auth-mvp/vedrid/elta-vedrid/page.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/loading.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `app/api/teskeid/weather/vedurstofan/stations/route.ts`
- `lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts`

Expected modified files:

- `messages/is.json`
- `messages/en.json`

Optional, only if it makes the API easier to test:

- `lib/weather/providers/vedurstofanStationExplorer.ts`
  - Pure helper that merges `VEDURSTOFAN_STATIONS` with result map and returns the client payload.
  - Test this helper directly if it contains non-trivial mapping logic.

Optional, only if Stebbi explicitly wants a link:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - Add authenticated-only link to `/auth-mvp/vedrid/elta-vedrid`.
  - Do not show for `isGuest`.

Do not modify in Phase 2B0:

- `RouteWeatherPointDetailCard.tsx`
- `TravelAuditMap.tsx`
- route verdict logic
- heatmap logic
- MET/Yr forecast selection
- provider filter logic
- SQL migrations
- Supabase RLS/grants/policies

## Testing plan

Add focused API tests:

- `GET /api/teskeid/weather/vedurstofan/stations` returns `404` when `AUTH_MVP_ENABLED` or `WEATHER_ENABLED` is false.
- Returns `401` when no authenticated user.
- Returns `404` when authenticated user lacks `vedrid` feature access.
- Returns all curated stations with metadata.
- Merges `ok`, `stale`, and `unavailable` results correctly.
- Includes forecast rows for ok/stale stations.
- Does not expose user id, email, Supabase internals, or secrets.
- Does not throw when `fetchVedurstofanForecastsForStations` rejects or returns missing entries.

Mock:

- `createClient().auth.getUser()`
- `checkFeatureAccess`
- `fetchVedurstofanForecastsForStations`

Do not call live Veðurstofan in tests.

Client component testing can be light in this phase because Google Maps is hard to exercise in Vitest. Prefer:

- Pure transform/helper tests where possible.
- Manual localhost map checks by Stebbi.

Verification commands after implementation:

- `npm.cmd run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/weather-vedurstofan-server.test.ts lib/__tests__/weather-vedurstofan-stations.test.ts`
- `npm.cmd run type-check`
- `npm.cmd run lint`
- `npm.cmd run build` if page/API surface changed and release is being considered

If lint/build shows only pre-existing warnings, document them.

## Supabase / RLS / production risk

No new SQL should be written for Phase 2B0.

No migration should be run.

No RLS/grant/auth/policy change should be made.

However, opening the new API/page can write to existing `weather_cache` via `fetchVedurstofanForecastsForStations` when cache is missing or expired.

Important caveat for Stebbi:

- If `.env.local` points at production Supabase, localhost testing may write `weather_cache` rows to production.
- This is existing behavior from Phase 1C/2A, not a new schema change.
- It does not write user route data.
- It may make up to 3 live Veðurstofan HTTP requests when all 29 stations need refresh.

No service-role data should ever be sent to the browser except the explicit station forecast payload.

## External service / cost risk

- Google Maps JS loads count toward Google Maps quota/billing.
- Keep this page internal/feature-gated in Phase 2B0.
- Do not add public navigation or guest access until Stebbi accepts the cost profile.
- Vedurstofan data terms/attribution should be verified before this becomes public or before long-term bulk republishing is productized.

## Implementation order for Claude Code

1. Confirm explicit implementation permission from Stebbi.
2. Start with API route + tests.
3. Add page guard + loading screen.
4. Add client station explorer with API fetch and list fallback.
5. Add map markers and click selection.
6. Add messages in both languages.
7. Run targeted tests + type-check.
8. Run lint/build if release is being considered.
9. Handoff to Codex before commit/push.

Do not commit, push, deploy, or run Supabase/migrations unless Stebbi explicitly asks for those actions.

## Suggested copy/paste to Claude Code

```text
TODO 086 Phase 2B0 - "Elta veðrið" station explorer

Do not commit, push, deploy, run migrations, or touch Supabase console unless Stebbi explicitly asks.

Implement a separate internal/feature-gated Veðurstofan station explorer, not a route-flow change.

Scope:
- New page: /auth-mvp/vedrid/elta-vedrid
- Guard with guardTeskeidSession + guardFeatureAccess(user.email!, 'vedrid')
- New API route: GET /api/teskeid/weather/vedurstofan/stations
- API must require authenticated vedrid access; no guest/public access
- API should merge VEDURSTOFAN_STATIONS with fetchVedurstofanForecastsForStations(all station IDs, { timeoutMs: 1500 })
- Return all stations with metadata, status ok/stale/unavailable, atime/fetched/expires, forecast rows, parse errors, and attribution
- No new Supabase table, no SQL, no RLS/grant/auth changes
- Client page shows all stations on Iceland map using existing Google Maps client helpers
- Clicking station shows station detail and all available forecast rows
- Include loading, error, map unavailable, empty/unavailable states
- All user-facing strings in messages/is.json and messages/en.json
- Follow Design.md: mobile-first, no hero, no nested cards, no horizontal overflow, stable touch targets

Non-goals:
- Do not put Veðurstofan back into RouteWeatherPointDetailCard
- Do not change route verdicts, heatmap, MET/Yr sampling, provider filters, or route recommendations
- Do not add public/guest access
- Do not create canonical Supabase weather store yet

Expected tests:
- API auth/feature gate tests
- API payload merge tests for ok/stale/unavailable
- No live Veðurstofan calls in tests

Run:
- npm.cmd run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/weather-vedurstofan-server.test.ts lib/__tests__/weather-vedurstofan-stations.test.ts
- npm.cmd run type-check
- npm.cmd run lint
- npm.cmd run build if release is being considered

Then hand off to Codex for review before commit/push.
```

## Localhost checks for Stebbi

After Claude Code implements Phase 2B0 and before commit/push:

1. Confirm `.env.local` points where Stebbi expects. If it points at production Supabase, opening the page may write `weather_cache` rows.
2. Open `/auth-mvp/vedrid/elta-vedrid` while signed in as a user with `vedrid` access.
3. Confirm the page is not accessible as guest/public.
4. Confirm all curated stations appear on the Iceland map.
5. Confirm marker colors/statuses correspond to fresh/stale/unavailable data and are also explained in text.
6. Click stations in several regions:
   - Capital area/Reykjanes
   - South coast
   - East/North
   - West/Northwest if available in current station list
7. Confirm station detail shows:
   - station name
   - station ID
   - owner
   - coordinates
   - verified coordinate state
   - data status
   - forecast generated/fetched/expires times
   - all forecast rows with wind, direction, precipitation, temperature, weather text
8. Confirm unavailable/stale stations are understandable and do not look like broken UI.
9. Force/observe map failure if practical: list/details should still be usable.
10. Check mobile widths 360, 390, and 460 px:
   - no horizontal overflow
   - no overlapping map/detail/list
   - touch targets usable
   - forecast rows wrap or stack cleanly
11. Confirm the route weather flow still works and no Veðurstofan block reappears in route point detail cards.
12. Confirm no route verdict, heatmap, or provider filter changed.

Do not run migrations, use Supabase console, deploy, commit, or push unless Stebbi explicitly approves.

## Files reviewed for this handoff

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `Design.md`
- `ai-handoff/2026-07-12-2158-todo-086-v045-claude-vedurstofan-removed-from-card.md`
- `ai-handoff/2026-07-12-2113-todo-086-v040-codex-v039-phase2b-product-review.md`
- `ai-handoff/2026-07-12-2150-todo-086-v044-codex-v043-distance-semantics-review.md`
- `app/auth-mvp/vedrid/page.tsx`
- `app/auth-mvp/vedrid/loading.tsx`
- `app/vedrid/page.tsx`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/saved-places/route.ts`
- `components/weather/TravelAuditMap.tsx`
- `lib/weather/googleMaps.client.ts`
- `lib/weather/providers/vedurstofan.server.ts`
- `lib/weather/providers/vedurstofanStations.ts`
- `messages/is.json`
- `package.json`
- Existing relevant tests:
  - `lib/__tests__/weather-vedurstofan-server.test.ts`
  - `lib/__tests__/weather-travel-api.test.ts`

## Commands run

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-12-2158-todo-086-v045-claude-vedurstofan-removed-from-card.md'`
  - Exit code: 0
- `git status --short`
  - Exit code: 0
  - Result: TODO086 source appears clean after `597ccd6`; unrelated dirty/untracked files remain. Existing `C:\Users\Lenovo/.config/git/ignore` permission warning appeared.
- `Get-Content -Encoding UTF8 'Design.md'`
  - Exit code: 0
- `git show --stat --oneline --decorate --no-renames 597ccd6`
  - Exit code: 0
  - Result: confirmed `HEAD -> main, origin/main` at v045 hotfix commit.
- `rg -n "loadMapsLibrary|loadMarkerLibrary|loadCoreLibrary|guardFeatureAccess|vedrid|ferdalagid|featureKey" app components lib messages`
  - Exit code: 0
- `Get-Content` with line numbers for `lib/weather/providers/vedurstofan.server.ts`
  - Exit code: 0
- `Get-Content` with line numbers for `lib/weather/providers/vedurstofanStations.ts`
  - Exit code: 0
- `Get-Content` with line numbers for `lib/weather/googleMaps.client.ts`
  - Exit code: 0
- `Get-Content` with line numbers for `app/auth-mvp/vedrid/page.tsx`
  - Exit code: 0
- `Get-Content` with line numbers for `app/vedrid/page.tsx`
  - Exit code: 0
- `Get-Content` with line numbers for relevant `app/api/teskeid/weather/travel/route.ts`
  - Exit code: 0
- `Get-Content` with line numbers for relevant `components/weather/TravelAuditMap.tsx`
  - Exit code: 0
- `Get-Content` with line numbers for relevant `messages/is.json`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'package.json'`
  - Exit code: 0
- `Get-Content` with line numbers for `app/api/teskeid/weather/saved-places/route.ts`
  - Exit code: 0
- `Get-Content` with line numbers for `app/api/teskeid/weather/travel/routes/route.ts`
  - Exit code: 0
- `Get-ChildItem -Force 'app/auth-mvp/vedrid' | Select-Object Name,Mode,Length`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'app/auth-mvp/vedrid/loading.tsx'`
  - Exit code: 0
- `Get-Content` with line numbers for relevant `lib/__tests__/weather-vedurstofan-server.test.ts`
  - Exit code: 0
- `Get-Content` with line numbers for relevant `lib/__tests__/weather-travel-api.test.ts`
  - Exit code: 0
- `Get-ChildItem -Recurse -Filter 'loading.tsx' app | Select-Object FullName`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-12-2113-todo-086-v040-codex-v039-phase2b-product-review.md'`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-12-2150-todo-086-v044-codex-v043-distance-semantics-review.md'`
  - Exit code: 0
- `git status --short -- app/api/teskeid/weather/travel/route.ts components/weather/RouteWeatherPointDetailCard.tsx components/weather/TravelAuditMap.tsx app/auth-mvp/vedrid/FerdalagidClient.tsx lib/weather/providers/vedurstofan.server.ts lib/weather/providers/vedurstofanStations.ts components/weather/travelAuditMap.helpers.ts lib/weather/types.ts messages/is.json messages/en.json`
  - Exit code: 0
  - Result: no TODO086 source changes listed; only git ignore permission warnings.
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
  - Exit code: 0
  - Result: `2026-07-12 22:01`

One broad `rg` command for Vedurstofan/cache terms failed due a sandbox ACL issue. It was replaced by narrower direct file reads and a narrower `rg`.

## Files changed by Codex in this handoff

- Added `ai-handoff/2026-07-12-2201-todo-086-v046-codex-elta-vedrid-detailed-handoff.md`

No source code, tests, SQL, env, TODO/DONE, commit, push, deploy, or Supabase state was changed by Codex.

## Tests

No tests were run for this handoff because it is planning only.

## Open questions for Stebbi

1. Should the first version be direct URL only, or should Claude Code add an authenticated-only link from `/auth-mvp/vedrid` immediately?
2. Is Google Maps acceptable for this internal validation page, knowing it may count toward Maps quota/billing?
3. Should the first version fetch all station forecasts on page load, or show markers first and fetch forecast rows only when a station is selected?
4. Should this be strictly internal forever, or is the long-term product idea a public "Elta vedrid" surface?

Codex recommendation:

- Direct URL only in first implementation.
- Google Maps is fine while internal.
- Fetch all station forecasts on page load for validation, because there are only 29 stations and the existing cache wrapper already batches.
- Revisit public/product version after Stebbi has validated station quality and coverage.
