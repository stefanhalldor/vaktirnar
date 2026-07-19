# TODO 086 v372 - Codex review of v371 Phase B route-selection Veðurstofan layer plan

Created: 2026-07-16 22:48
Timezone: Atlantic/Reykjavik
Author: Codex

Related handoff:
- `2026-07-16-2247-todo-086-v371-claude-phase-b-route-selection-vedurstofan-layer.md`

## Findings

1. **Medium: The plan omits the visible show/hide control that started the product request**

   v371 adds Veðurstofan station markers to `RouteSelectionStep`, but it does not specify a toggle/show-hide control for the route-selection map. Stebbi's request was explicitly to show the stations with a way to hide/show Veðurstofan, and later Vegagerðin. Without a control, users may suddenly see extra markers on the first step with no explanation or escape hatch.

   This is especially important because `RouteSelectionStep` is already visually busy: place inputs, Google map, route options, warnings, and CTA. See `components/weather/RouteSelectionStep.tsx:416` onward. Add a compact provider-layer control near the map, e.g. "Sýna stöðvar" / `Veðurstofan`, with room for `Vegagerðin` later. This should follow `Design.md` controls guidance: small, mobile-first, stable height, no oversized card.

2. **Medium: The endpoint access model likely excludes public users from a layer that may soon be public**

   The proposed endpoint uses `resolveWeatherBaseAccess(user)` and then provider access. In current semantics, when `WEATHER_ENABLED=All`, signed-out users get public base access and signed-in public-tier users may get `mode: public`. The plan says: if `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` is absent/not true, `layerEnabled=true`. That would allow public Veðurstofan station preview when the provider is graduated open, which is consistent with recent product direction.

   But v371 also says `FerdalagidClient.tsx` fetches "when selected route changes and user has Vedurstofan access" and suggests "Only fetch if user has Vedurstofan access" client-side, then backs off to "always attempt". This needs to be made unambiguous: the client should not try to infer provider access. It should attempt only when the route-selection provider layer is visible/on, and the server should be the source of truth. A `403` should simply hide the layer.

3. **Medium: The preview duplicates formatting instead of reusing existing Veðurstofan row presentation**

   v371 proposes a local `RouteStationPreviewCard` that manually formats rows and shows only weather text + wind. That is okay for a first sketch, but it risks reintroducing the "same data, different card" drift we spent several rounds fixing. Existing shared pieces include `components/weather/VedurstofanForecastRows.tsx` and `ForecastRowLine`, used by `components/weather/VedurstofanPointCard.tsx`.

   The route-selection preview can be simpler than the final card, but it should reuse the row formatter/component or extract a small shared row primitive. Otherwise temperature/precip/wind direction/date formatting will diverge immediately.

4. **Medium: No Púls message is listed as Phase B, but the original route-selection idea included one newest Púls message**

   v371 explicitly defers "Veðurpúls message in preview" to Phase D. That is a reasonable scope cut if Stebbi wants the smallest technical pass. But it should be called out as a product decision because the request included one latest Púls comment on station click.

   If Phase B ships without Púls preview, the preview is mostly data-only. That may still be useful, but it is not the full requested experience. I recommend either:

   - keep Phase B data-only and label it clearly as "station weather preview only"; or
   - include exactly one route-preview Púls message using the existing chat-core preview endpoint/logic, with no compose box.

   Do not accidentally build a second station comment fetch outside chat-core.

5. **Low/Design: Marker color should use existing provider/status language rather than a new arbitrary cyan**

   The plan suggests cyan station markers. That may be visually useful, but Design.md warns against introducing new brand colors without approval. We already have Veðurstofan badges/markers elsewhere. If cyan is chosen, call it an intentional provider-layer color and keep it consistent for all Veðurstofan marker contexts. Otherwise reuse the existing Veðurstofan marker style from result map / explorer.

6. **Low: The plan says no loading indicator, but route-selection navigation already uses strong loading states**

   Optional layer loading should not block route selection, agreed. But if the map has a visible provider toggle, it should have a subtle loading/disabled state while station markers are fetched. Otherwise the user can toggle "Veðurstofan" and see nothing with no feedback, especially on slower mobile. A small "Sæki stöðvar..." text or disabled toggle is enough.

## What looks good

- The new endpoint is scoped and avoids extra Google route calls.
- The endpoint uses `matchProviderPointsToRoute(...)`, which is the right provider-neutral foundation for Vegagerðin later.
- The plan keeps MET/Yr sampling and final route calculation unchanged.
- It avoids SQL/env/deploy/migration work.
- It caps `routePoints` at 1000, which is a sensible body-size guard.
- It correctly treats Veðurstofan preview as fail-open: no provider data should break route selection.

## Recommended adjustments before sending with Workflow

I would revise v371 before asking Claude Code to implement:

1. Add a route-selection provider layer control:
   - `Veðurstofan` toggle now.
   - Disabled/future placeholder for `Vegagerðin` only if it does not clutter the first pass.
   - Default can be on when server access allows, but user must be able to hide it.

2. Make client/server access clear:
   - Client attempts fetch only when layer toggle is on and selected route exists.
   - Server is the only authority on base weather/provider access.
   - `403` means clear markers and leave toggle off/disabled or silently unavailable.

3. Reuse forecast row display:
   - Prefer shared `ForecastRowLine`/Veðurstofan row primitive.
   - If a compact row is needed, extract it once rather than hardcoding a new formatting stack.

4. Decide explicitly whether Phase B includes one latest Púls message:
   - If yes, use chat-core preview logic.
   - If no, state "Púls is intentionally omitted from Phase B" in acceptance criteria.

5. Add a subtle layer loading state:
   - Do not block route selection.
   - Do not show a full-screen loader.
   - Avoid layout shift.

6. Add Design.md compliance to the implementation notes:
   - mobile-first
   - no horizontal overflow
   - touch targets around 40 px
   - no nested cards inside route option cards
   - all new text in `messages/is.json` and `messages/en.json`

## Suggested acceptance criteria

- Route-selection map has a visible control to show/hide Veðurstofan stations.
- Turning the layer off removes station markers and preview.
- Changing selected route refreshes station markers for that route.
- Station matching uses `matchProviderPointsToRoute(...)` and selected route geometry.
- No MET/Yr route sampling or final route calculation changes.
- Provider preview reuses shared Veðurstofan forecast row formatting or an extracted shared primitive.
- Server enforces base weather access and provider access.
- Public/provider-open behavior follows existing `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` semantics.
- The route-selection step remains usable on 360 px mobile width.

## Tests I would add/change

The endpoint tests in v371 are good, but add:

1. `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` absent + `WEATHER_ENABLED=All` + signed-out/public user gets station data when product table returns data.
2. `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` + signed-out user gets 403.
3. signed-in public-tier user without provider access gets 403 when access-required is true.
4. routePoints over 1000 returns 400.
5. invalid finite coordinate values return 400.

For client/UI, if existing test setup allows it:

1. Toggle off hides markers/preview.
2. Selected route change clears selected station preview.
3. Failed/403 fetch clears station data without breaking route options.

## Localhost checks for Stebbi

After implementation:

1. Open `/vedrid` on mobile-width viewport.
2. Select Reykjavík -> Selfoss.
3. Confirm a compact Veðurstofan layer control appears near the map.
4. Toggle Veðurstofan on/off and confirm markers appear/disappear without layout jump.
5. Click a station marker and confirm preview opens below the map.
6. Confirm preview row formatting matches existing Veðurstofan cards enough to feel like the same system.
7. Change to another route option and confirm old preview closes and markers refresh.
8. Continue to result step and confirm existing final Veðurstofan cards and calculations are unchanged.
9. Test signed-out/public behavior with provider open and provider restricted, if env makes that easy locally.

No SQL, RLS, Vercel env, migration, deployment, secrets, billing, or production data testing belongs to this pass.

## Recommendation

Do not send v371 as `Workflow` unchanged if Stebbi expects the show/hide layer control or one latest Púls message in the station preview. The core architecture is good, but it needs the route-selection provider toggle and a clearer access/formatting contract before implementation.

If Stebbi wants the smallest safe implementation, send Claude Code a revised Phase B that includes:

- Veðurstofan toggle
- route-matched markers
- shared-format forecast preview
- no Púls yet

Then do Púls/Yr comparison/scrubber as separate scoped phases.
