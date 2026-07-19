# 2026-07-19 08:47 - TODO 086 v184 - Codex review of v183 route-memory polish

Created: 2026-07-19 08:47
Timezone: Atlantic/Reykjavik

## Context

Reviewed `2026-07-19-0930-todo-086-v183-claude-v182-vegagerdin-filter-consistency`.

Stebbi feedback after v183:

- Clicking a route-memory place pill must not open a station detail card automatically. It interrupts the overview flow.
- A newly computed localhost route `Reykjavík -> Siglufjörður` did not appear on `/vedrid`.
- Otherwise this is very close to release. Avoid feature creep before deploy.

## Findings

### Medium - route-memory pill selection still auto-opens station details

`components/weather/WeatherOverviewClient.tsx:677-702` creates `activeRequestedSelection` from the nearest Vegagerðin/Veðurstofan station and passes it into `WeatherOverviewShell`. `WeatherOverviewShell.tsx:156-169` then calls `setSelectedProvider()` and writes the selected station into the URL.

That exactly explains the current behavior: selecting a place pill filters the map, but also opens the nearest station card. This is now unwanted UX. Route-memory place selection should filter the map only. Station cards should open only when the user clicks a marker or follows a direct station/pulse link.

Recommended fix:

- Stop passing route-memory-derived nearest selections into `requestedSelection`.
- Keep nearest station IDs for filtering:
  - `singlePlaceVedurstofanIds`
  - `singlePlaceVegagerdinIds`
- Keep URL restore behavior for explicit station links.
- Do not remove marker-click detail cards.

### Medium - Siglufjörður is not a known route-memory place

`lib/iceland-routes/routePlaceNormalization.ts:45-60` covers Akureyri, Húsavík, Egilsstaðir, Ísafjörður, Hólmavík, Borgarnes, Blönduós and Varmahlíð, but not Siglufjörður.

`lib/iceland-routes/routePlaces.ts:31-46` likewise has canonical coordinates for Akureyri, Húsavík, Blönduós and Varmahlíð, but not Siglufjörður.

`app/api/teskeid/weather/travel/route.ts:426-429` only writes route-memory if both endpoints normalize. Therefore `Reykjavík -> Siglufjörður` is very likely skipped at write time, not merely hidden on `/vedrid`.

Recommended fix:

- Add Siglufjörður to:
  - `routePlaceNormalization.ts`
  - `routePlaces.ts`
  - `lib/__tests__/route-place-normalization.test.ts`
- Use key `siglufjordur`, label `Siglufjörður`.
- Also support ASCII-ish input variants: `Siglufjordur`, `Siglufjördur`.

### Low - route-memory picker does not refresh after new route writes

`components/weather/RouteMemoryPicker.tsx:55-61` fetches all known places only on mount. `RouteMemoryPicker.tsx:63-75` fetches destinations only when `selectedFrom.key` changes.

If Stebbi keeps `/vedrid` open, computes a new route in `/ferdalagid`, and comes back, the picker may still show the old in-memory list until refresh/remount. This is separate from the Siglufjörður normalizer issue.

Recommended release-safe fix:

- Add a small refetch on `window.focus` and `visibilitychange` for `/route-memory/places`.
- If `selectedFrom` is set, also refetch destinations for that selected place.
- No polling and no Google calls.
- This keeps the cache/route-memory idea visible during localhost testing without adding new product scope.

## Answer to Stebbi

Why is `Reykjavík -> Siglufjörður` not visible immediately?

Most likely two things:

1. Siglufjörður is not in the route-memory normalization registry, so `/ferdalagid` probably did not store the route-memory row at all.
2. Even after a successful write, `/vedrid` currently fetches the route-memory place list once on mount, so an already-open page may need reload or a small focus-refetch fix.

This is not a sign that Google dropdowns are still in use on `/vedrid`; the current picker is route-memory based. It just needs broader known-place coverage and refresh behavior.

## Recommended Claude Code handoff

```md
## v184 final pre-release fix: route-memory pills should filter only, plus Siglufjörður coverage

Context:
Stebbi tested v183. Vegagerðin filtering is now consistent, but two release-blocking polish issues remain:

1. Clicking a route-memory place pill opens a station detail card. That is distracting. Selecting a place should only filter the map.
2. A newly calculated route Reykjavík -> Siglufjörður does not appear on /vedrid.

Keep this as a small release fix. No new feature creep, no new Google calls, no new migration unless genuinely necessary.

### Required changes

1. Stop auto-opening station cards from route-memory pill selection.
   - In `WeatherOverviewClient`, do not pass nearest route-memory station as `requestedSelection`.
   - Keep the nearest station IDs only for single-place map filtering.
   - Marker clicks and explicit station URL restoration should still open detail cards.
   - After selecting `Akureyri`, `Egilsstaðir`, `Reykjavík`, etc. the map should filter, but no detail card should open automatically.

2. Add Siglufjörður as a known route-memory place.
   - Add to `lib/iceland-routes/routePlaceNormalization.ts` with key `siglufjordur` and label `Siglufjörður`.
   - Add to `lib/iceland-routes/routePlaces.ts` with approximate town-center coordinates.
   - Add tests in `lib/__tests__/route-place-normalization.test.ts`.
   - Cover Icelandic and ASCII-ish forms: `Siglufjörður`, `Siglufjordur`, `Siglufjördur`.

3. Add lightweight route-memory refresh behavior.
   - `RouteMemoryPicker` should refetch known places on window focus / visibilitychange.
   - If a first place is selected, refetch destinations for that place too.
   - No polling.
   - No Google calls.
   - Existing empty/loading/hint copy should remain from messages files.

4. Verify this does not reopen the previous v182 issue.
   - In single-place mode, Vegagerðin/Núna dot and measured timestamp must still be based on the filtered station set.
   - In exact route-memory mode, both Vegagerðin and Veðurstofan must use the exact stored station IDs.

### Tests / checks

Run:

- `npm run type-check`
- `npm run test:run -- lib/__tests__/route-place-normalization.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/weather-route-memory-migration.test.ts`
- If touched enough shared weather UI: run the same targeted overview/weather tests from v183, or full `npm run test:run` if time allows.
- `npm run build` before release candidate.

### Localhost checks for Stebbi

1. Open `/vedrid`.
2. Click `Akureyri` in `Skoða veðrið á ákveðinni leið`.
   - Expected: map filters to the Akureyri-nearest station set.
   - Expected: no station detail card opens automatically.
3. Click a marker on the map.
   - Expected: station detail card opens.
4. Clear route.
   - Expected: full overview map returns.
5. In `/ferdalagid`, calculate `Reykjavík -> Siglufjörður`.
   - Expected: route-memory write succeeds silently.
6. Return to `/vedrid` or focus the `/vedrid` tab.
   - Expected: `Siglufjörður` appears as an available route-memory place/destination without needing Google dropdowns.
7. Select `Reykjavík -> Siglufjörður`.
   - Expected: map filters to the exact stored stations from that `/ferdalagid` calculation.
8. Network tab:
   - Expected: route-memory picker uses `/api/teskeid/weather/route-memory/*`.
   - Expected: no Google calls from the `/vedrid` route-memory picker itself.

### Route intelligence check

- Route/place touched: Reykjavík -> Siglufjörður, North Iceland route-memory endpoint coverage.
- New reusable knowledge belongs in `lib/iceland-routes/routePlaceNormalization.ts` and `routePlaces.ts`.
- Provider-neutral: yes, the place key is independent of Veðurstofan/Vegagerðin and can be reused by route-memory and future IcelandRoadmap work.
- Privacy: still safe. Store only normalized public place key/label and provider station IDs, no raw address and no Google geometry.
- Google cost: no new Google calls on `/vedrid`; this improves cache-driven testing and release readiness.
```

## Design check

This follows `Design.md`: selecting a pill should not trigger surprising navigation/state expansion; marker details should be an explicit user action. The focus-refetch is silent and should not introduce layout shift.

## Route intelligence check

1. Route/place touched: Reykjavík, Siglufjörður, and route-memory-based overview filtering.
2. New knowledge belongs in `lib/iceland-routes/routePlaceNormalization.ts` and `lib/iceland-routes/routePlaces.ts`, not scattered in UI.
3. Provider-neutral: yes, place normalization is shared route-domain logic.
4. Needs test fixture: yes, add Siglufjörður normalization tests.
5. Privacy: safe if the existing sql86 contract remains unchanged.
6. Google: no raw Google route content should be stored. This work should only store normalized place labels and matched provider station IDs.
7. `IcelandRoadmap.md` already covers route-memory; no doc change needed for this small place-registry addition.

## SQL / migration status

No SQL changes recommended for this fix. `sql/86_weather_route_memory.sql` remains the required route-memory schema. Do not run new migrations as part of this patch unless Claude Code discovers an actual schema gap.

## Commands run by Codex

- Read `ai-handoff/2026-07-19-0930-todo-086-v183-claude-v182-vegagerdin-filter-consistency.md`
- Read `ai-handoff/README.md`
- Read relevant sections/files:
  - `WORKFLOW.md`
  - `Design.md`
  - `IcelandRoadmap.md`
  - `components/weather/WeatherOverviewClient.tsx`
  - `components/weather/WeatherOverviewShell.tsx`
  - `components/weather/RouteMemoryPicker.tsx`
  - `lib/iceland-routes/routePlaceNormalization.ts`
  - `lib/iceland-routes/routePlaces.ts`
  - `app/api/teskeid/weather/travel/route.ts`
  - route-memory API files
- No tests run by Codex for this review.

## Release stance

Do one small v184 fix before release:

1. remove auto-open from route-memory place pill selection
2. add Siglufjörður known-place support
3. add focus/visibility refetch for route-memory picker

Then release. Anything larger, including map-based route picking or richer IcelandRoadmap routing, should wait until after this release so real route-memory data can start accumulating.

