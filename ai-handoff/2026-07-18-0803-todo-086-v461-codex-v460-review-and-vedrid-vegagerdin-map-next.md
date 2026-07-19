# 2026-07-18 08:03 - TODO 086 v461 - Codex review of v460 and next large step

Created: 2026-07-18 08:03
Timezone: Atlantic/Reykjavik

Source handoff reviewed: `2026-07-18-0825-todo-086-v460-claude-v459-done-prerelease`

## Short version

v460 is good contract hardening: Veðurstofan pulse writes are shut down, Vegagerdin write target is explicit, preview middleware is tighter, and tests are green.

But this still is not the product test path Stebbi needs. The next step should be accelerated toward visible Vegagerdin points on `/vedrid`: no manual station IDs, no hidden test route as the primary QA path. The user should click a Vegagerdin point on the map, see current Vegagerdin measurements, see/read the latest Veðurpuls preview, and open the full pulse page with correct return context.

The large next step should be: provider-neutral inline pulse preview + provider-aware URL selection state + Vegagerdin station detail on `/vedrid` with pulse link/preview + enough route-selection reuse to avoid duplicating this again.

## Findings

1. Medium: v460 hardens APIs, but the visible `/vedrid` Vegagerdin flow is still incomplete.

   `components/weather/WeatherOverviewClient.tsx:345` builds a Vegagerdin map layer and `components/weather/WeatherOverviewClient.tsx:396` renders `VegagerdinStationDetail`, so the code is already closer than the v460 handoff says. However, `VegagerdinStationDetail` at `components/weather/WeatherOverviewClient.tsx:628` only shows current measurements. It does not show a Veðurpuls preview, does not link to `/auth-mvp/vedrid/puls/vegagerdin/stod/[id]`, and therefore does not let Stebbi test the intended chat product from the map.

   Fix direction: make clicking a Vegagerdin marker on `/vedrid` the primary test path. Station-ID URL testing can remain a fallback, but it must not be the main validation path.

2. Medium: overview selection URL is still station-only, not provider-aware.

   `components/weather/WeatherOverviewShell.tsx:112` reads only `stationId`, `components/weather/WeatherOverviewShell.tsx:125` searches all layers by marker ID, and `components/weather/WeatherOverviewShell.tsx:165` writes only `stationId` back to the URL. This was fine for one provider, but with Veðurstofan + Vegagerdin on the same map it is not a complete identity.

   Risk: if IDs overlap or if a user refreshes/copies a URL, the shell can restore the wrong provider or fail ambiguously. Even without ID collision, the URL cannot express "open Vegagerdin station X" vs "open Veðurstofan station X".

   Fix direction: use provider-aware query state, e.g. `?provider=vegagerdin&stationId=...`. Keep backward compatibility by treating legacy `?stationId=...` with no provider as Veðurstofan where needed.

3. Medium: the inline pulse preview is still named and shaped as Veðurstofan-specific.

   `components/weather/VedurstofanPulseInline.tsx:24` is now read-only and uses `useChatPreview`, which is good, but it hardcodes the Veðurstofan preview endpoint at `components/weather/VedurstofanPulseInline.tsx:28` and the Veðurstofan href helper at `components/weather/VedurstofanPulseInline.tsx:36`.

   This is exactly the pattern Vegagerdin needs. Duplicating a `VegagerdinPulseInline` one-off would fight the reusable chat-core direction.

   Fix direction: extract a provider-neutral `WeatherPulseInline` that accepts `{ provider, stationId, returnTo }` and resolves preview endpoint + full href through `lib/weather/pulseTarget.ts`.

4. Low/Documentation: v460 handoff says "No visible Vegagerdin station pins on the map yet", but current code has a Vegagerdin overview layer.

   See `components/weather/WeatherOverviewClient.tsx:309` through `components/weather/WeatherOverviewClient.tsx:388`. Either the handoff is stale, or the layer exists but is not visible in normal env/cache conditions.

   Fix direction: next Claude handoff should reconcile this explicitly: is the layer visible on `/vedrid` when `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` allows it and current cache exists? If not, say exactly whether the blocker is feature access, missing cache, missing SQL, or UI wiring.

5. Low/Product: SQL 81 is still required for writing, but not for making the map path useful.

   v460 correctly says `sql/81_teskeid_chat_target_type_vegagerdin_station.sql` is not run. That means full Vegagerdin write flow fails until SQL 81 is run. But public/signed-in map display and read-only preview can still be implemented and tested before SQL 81.

   Fix direction: do not let SQL 81 block the visible map integration. Make preview/CTA visible now; document clearly that posting requires SQL 81.

## What I verified

- `npm run type-check` -> exit 0
- `npm run test:run -- lib/__tests__/vedurpuls-api.test.ts lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/pulseTarget.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/middleware.test.ts` -> exit 0, 7 files, 169 tests passed

I did not run localhost/browser checks and did not run SQL.

## Next large implementation step for Claude Code

Use `Workflow` if Stebbi sends this to Claude Code and wants execution under repo rules. Do not commit, push, deploy, run SQL, or change Vercel/env settings.

### Goal

Make Vegagerdin testable from `/vedrid` itself.

Stebbi should be able to:

1. Open `/vedrid`.
2. See Vegagerdin points on the map when the provider is enabled/allowed and current cache exists.
3. Click a Vegagerdin point.
4. See current Vegagerdin measurement data.
5. See the latest Veðurpuls preview for that point.
6. Click "Sja fleiri skilabod eda segja fra adstaedum" and land on the full Vegagerdin pulse page with return context preserved.

Manual testing by guessing station IDs is no longer acceptable as the main validation path.

### Scope A - Extract provider-neutral WeatherPulseInline

Create or refactor to a reusable component, likely `components/weather/WeatherPulseInline.tsx`.

Contract suggestion:

- props:
  - `provider: 'vedurstofan' | 'vegagerdin'`
  - `stationId: string`
  - `returnTo?: string`
  - optional labels/empty behavior only if needed
- it uses:
  - `useChatPreview`
  - `ChatPreviewList`
  - `weatherPulseTargetHref` or provider-specific helpers from `lib/weather/pulseTarget.ts`
- it chooses preview endpoint centrally:
  - Veðurstofan: `/api/teskeid/weather/vedurpuls/stations/${stationId}/preview`
  - Vegagerdin: `/api/teskeid/weather/vedurpuls/vegagerdin/stations/${stationId}/preview`
- it stays read-only in inline/card contexts.
- it does not create threads.
- it does not render a compose box.

Then replace existing `VedurstofanPulseInline` usage with the neutral component, or keep a very thin compatibility wrapper only if it avoids a huge diff.

Important: do not create a separate `VegagerdinPulseInline` by copy/paste unless there is a very clear reason. The reusable chat-core direction matters here.

### Scope B - Finish Vegagerdin marker detail on `/vedrid`

In `components/weather/WeatherOverviewClient.tsx`, update `VegagerdinStationDetail` so a clicked Vegagerdin station shows:

- station name
- provider badge "Vegagerdin"
- current measurement line, clearly not a forecast
- measured time and fetched time
- compact current values:
  - mean wind
  - gusts, if present
  - wind direction, if present
  - air temperature, if present
  - road temperature, if present
- `WeatherPulseInline provider="vegagerdin"` with `returnTo` pointing back to the current `/vedrid` selection URL

CTA copy should remain product-consistent:

- "Sja fleiri skilabod eda segja fra adstaedum" in Icelandic from messages
- no hardcoded user-facing text in the component

If no messages exist, use the existing empty/preview behavior. Public users may see read-only empty state or no preview depending on the current product decision, but the CTA should still let them open/login to report conditions if that is the chosen UX.

### Scope C - Make overview URL state provider-aware

In `components/weather/WeatherOverviewShell.tsx`:

1. Add query support for provider identity:
   - read `provider` and `stationId`
   - restore selected marker by `{ layerId: provider, markerId: stationId }` when provider exists
   - when only legacy `stationId` exists, treat it as Veðurstofan fallback

2. When selecting a marker:
   - write both `provider` and `stationId`
   - clearing selection removes both

3. Use this provider-aware URL for pulse `returnTo`.

Expected URL examples:

- `/vedrid?provider=vegagerdin&stationId=V1234`
- `/vedrid?provider=vedurstofan&stationId=31392`
- legacy `/vedrid?stationId=31392` should still open Veðurstofan if available

Add tests for the pure helper if this logic can be extracted. If it stays inside a client component, add at least a small helper module such as `lib/weather/overviewSelectionUrl.ts` and test that instead.

### Scope D - Route-selection map: keep same component model, but do not block overview delivery

Stebbi's immediate testing target is `/vedrid`, but the route-selection map must not drift into a second system.

After Scope A-C, either in the same pass if low risk or in the next handoff:

- extend `RouteSelectionStep` toward provider-neutral station overlays
- do not keep adding Veðurstofan-only props forever:
  - current props: `showVedurstofanLayer`, `vedurstofanStations`, etc.
  - desired direction: `providerStationLayers` or a small typed provider overlay model
- reuse `ProviderStationPreviewCard`
- reuse `WeatherPulseInline`
- Vegagerdin stations on route-selection should show current measurement + pulse preview, not forecast rows

If this balloons, stop after `/vedrid` overview integration and hand off. The priority is to get Stebbi a clickable Vegagerdin test path quickly.

### Scope E - Access/env expectations

Document this clearly in Claude's next handoff:

- `WEATHER_ENABLED=All` opens base weather to public + authenticated users.
- If `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true`, Vegagerdin current endpoint is restricted to signed-in users with `weather-provider-vegagerdin`.
- If `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` is absent or anything other than exact `true`, Vegagerdin is open to everyone who can access weather.
- SQL 80 must be run for admin feature key support.
- SQL 81 must be run before signed-in users can create/write Vegagerdin pulse threads.
- SQL 81 is not required for public marker display or preview reads.

Do not run SQL unless Stebbi explicitly asks.

### Scope F - Tests

Run at minimum:

- `npm run type-check`
- `npm run test:run -- lib/__tests__/pulseTarget.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/vedurpuls-api.test.ts`

Add tests if new helpers are created:

- provider-aware overview URL selection helper
- provider-neutral pulse preview endpoint resolver
- WeatherPulseInline behavior if the project has component tests available for this layer

## Design/workflow constraints

This step touches map, card, links, and navigation. Follow `Design.md`:

- mobile-first at 360/390/460 px
- no horizontal overflow
- card detail must remain compact and not become a dashboard
- inputs remain >=16 px if compose appears anywhere; inline preview should not render compose
- navigation/link to full pulse must not feel dead; use route loading/pending where the existing app pattern supports it
- user-facing text belongs in `messages/is.json` and `messages/en.json`

Follow `WORKFLOW.md`:

- no commit, push, deploy, SQL run, Vercel/env change, or production action
- after implementation, create a new handoff with changed files, commands, exit codes, SQL status, and localhost checks

## Localhost checks for Stebbi

After Claude Code implements the next step:

1. Public `/vedrid`, with Vegagerdin provider open.
   - Env: `WEATHER_ENABLED=All`.
   - If testing public visibility, remove `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` or set it to anything other than exact `true`.
   - Expected: Vegagerdin appears in provider strip.
   - Expected: Vegagerdin points are visible on the map if current cache has data.

2. Click a Vegagerdin point on `/vedrid`.
   - Expected: a station detail card opens from the map.
   - Expected: card says it is current Vegagerdin measurement, not a forecast.
   - Expected: current values are visible if present.
   - Expected: latest Veðurpuls preview appears or a clear empty state appears.
   - Expected: CTA says "Sja fleiri skilabod eda segja fra adstaedum" in Icelandic UI.

3. Public user clicks the CTA.
   - Expected: user is sent toward auth/full pulse flow.
   - Expected: after login, the app preserves enough return context to get back to the same `/vedrid?provider=vegagerdin&stationId=...` state or the full pulse station.

4. Signed-in user with Vegagerdin access clicks the same point.
   - Expected: full pulse page opens for `/auth-mvp/vedrid/puls/vegagerdin/stod/[id]`.
   - Expected before SQL 81: page may show write/thread error; this must be documented, not surprising.
   - Expected after SQL 81: compose works and new report appears in preview/feed polling.

5. Regression check for Veðurstofan on `/vedrid`.
   - Click Veðurstofan point.
   - Expected: Veðurstofan detail remains read-only.
   - Expected: no compose box and no hidden thread creation.
   - Expected: legacy `?stationId=31392` still restores Veðurstofan selection if available.

6. Mobile checks at 390 px.
   - Provider strip wraps cleanly.
   - Map and detail card do not overflow horizontally.
   - CTA text fits or wraps cleanly.
   - No controls look dead while navigating.

## Deferred after this step

- Provider-neutral route-selection overlay for both Veðurstofan and Vegagerdin if it is not completed in Scope D.
- Persistent Vegagerdin station registry/snapshot so full pulse pages do not 404 when current cache is unavailable.
- Favorite stations on `/vedur`: signed-in users can mark favorite Veðurstofan and Vegagerdin stations.
- Better provider-neutral station list design; avoid a long flat list under the map.
- Route-cache and Teskeid interest heatmap track from `2026-07-17-0627-todo-086-v382-codex-route-cache-and-interest-heatmap.md`.
- Deferred route-geometry oddities around Vik/Reynisfjall/Myrdalssand from `2026-07-17-0930-todo-086-v398-claude-vik-sections-deferred-verified-handoff.md`.
- Deferred Oxi south-coast/Reynisfjall route work from `2026-07-17-1039-todo-086-v409-deferred-oxi-south-coast-reynisfjall.md`.

## Confidence / uncertainty

Confidence: high that v460's API contract changes are directionally correct and tests are green.

Confidence: medium-high that the next best product step is `/vedrid` map integration, because the overview shell and Vegagerdin current adapter already exist.

Uncertainty: I did not run localhost, and current worktree is very dirty with many Claude-created files. Claude Code should be careful not to overwrite unrelated changes and should reconcile whether Vegagerdin markers are already visible under the right env/cache state before adding more UI.
