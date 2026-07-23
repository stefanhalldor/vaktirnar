# TODO-086 v348 - Codex review: route / Mitt veður marker lifecycle

Created: 2026-07-23 13:19  
Timezone: Atlantic/Reykjavik

## Scope

Codex reviewed:

- `2026-07-23-1300-todo-086-v346-chase-route-separation-wind-emoji.md`
- `2026-07-23-1500-todo-086-v347-mitt-vedur-place-marker-hide.md`
- implementation commits `3ca8ebb` and `cd65fa0`
- current `components/weather/RoadMapPrototypeMap.tsx`
- relevant types, translations, tests, `Design.md`, `IcelandRoadmap.md`, `WORKFLOW.md`, and `ai-handoff/README.md`

This was a read-only production-minded review. Codex made no code, SQL, migration,
Supabase, auth, production, commit, push, deploy, `TODO.md`, or `DONE.md` changes.
The only created file is this review handoff, as required by the project workflow.

## Findings

### P1 - Clearing a route does not restore Mitt veður markers

References:

- `components/weather/RoadMapPrototypeMap.tsx:1902-1908`
- `components/weather/RoadMapPrototypeMap.tsx:2001-2008`
- `components/weather/RoadMapPrototypeMap.tsx:2820-2853`
- `components/weather/RoadMapPrototypeMap.tsx:4433-4444`

When a route becomes active, `clearWeatherChaseMapMarkers()` correctly removes the
Mitt veður markers. The effect that creates those markers reads
`routeActiveRef.current`, but a ref mutation does not trigger a render/effect, and
route activity is not a dependency of that effect.

`handleClearRoute()` later sets `routeActiveRef.current = false`, but does not
rebuild the Mitt veður markers or change any dependency that reliably causes the
marker effect to run. Therefore selected Mitt veður markers can remain absent
after route cancel. This contradicts v346 localhost check 8.

Suggested fix:

- Represent route-active state in React state (with a mirrored ref only where
  imperative callbacks require current state), and include that state in the
  Mitt veður marker effect; or
- extract one explicit reconciliation function for map marker mode and call it
  after both route activation and route clear.

The React-state option is preferred if it can be kept small: visibility is UI
state, and making it reactive removes the current hidden dependency on unrelated
state changes.

### P1 - Clearing a route restores place markers even while Mitt veður is active

References:

- `components/weather/RoadMapPrototypeMap.tsx:1981-2000`
- `components/weather/RoadMapPrototypeMap.tsx:2820-2853`
- `components/weather/RoadMapPrototypeMap.tsx:4745-4754`

`handleClearRoute()` unconditionally restores every place marker according to
zoom. It does not check whether Mitt veður still has selected items / owns the
map. Because the Mitt veður effect does not rerun merely when
`routeActiveRef.current` changes, nothing immediately hides those place markers
again.

This contradicts v347 localhost check 7: canceling a route with Mitt veður items
still selected should leave the place markers hidden.

Suggested fix:

- Centralize place-marker visibility in a helper such as
  `reconcilePlaceMarkerVisibility({ routeActive, weatherSelectionActive, zoom })`.
- On route clear, show zoom-based place markers only when Mitt veður is not the
  active map mode. Otherwise keep them hidden.
- Avoid duplicating the importance/zoom thresholds in the effect cleanup, route
  clear, and zoom listener.

### P2 - The two activity concepts are inconsistent and can overwrite each other

References:

- `components/weather/RoadMapPrototypeMap.tsx:1631-1639`
- `components/weather/RoadMapPrototypeMap.tsx:1902-1908`
- `components/weather/RoadMapPrototypeMap.tsx:1981-2000`
- `components/weather/RoadMapPrototypeMap.tsx:2228-2234`

`weatherChaseActiveRef` is assigned from `isWeatherChaseOpen` in one effect, but
is also independently set to `true`/`false` by the map-marker effect. Those are
not the same concept:

- panel open
- selected Mitt veður items controlling the map
- Mitt veður DOM markers currently mounted

Effect cleanup can overwrite the value written by the panel-open effect. Other
logic then combines this unstable ref with a separate
`hasWeatherChaseSelection` check. The current behavior is difficult to reason
about and caused the two P1 lifecycle gaps above.

Suggested fix:

- Define one explicit semantic boolean, for example
  `hasWeatherChaseSelection = weatherChaseSelectedItems.length > 0`.
- If panel-open state also needs to suppress another layer, name and handle it
  separately.
- Do not let two effects own the same mutable activity ref.
- Prefer a single derived map mode: `route | weather-selection | overview`.

### P2 - No regression tests cover the new helpers or mode transitions

References:

- `components/weather/RoadMapPrototypeMap.tsx:578-593`
- `components/weather/RoadMapPrototypeMap.tsx:1899-2008`
- `components/weather/RoadMapPrototypeMap.tsx:2800-2854`

The full suite is green, but there are no direct tests for:

- degree boundary mapping to Icelandic wind directions
- met.no symbol suffix and precipitation/thunder/snow mapping
- `overview -> Mitt veður -> route -> Mitt veður`
- route cancel with selected Mitt veður items
- route cancel without selected Mitt veður items
- zoom while Mitt veður owns the map

Suggested fix:

- Extract the two pure weather helpers into an existing suitable helper module
  or export them for focused unit tests.
- Extract pure map-mode / place-visibility decision logic and unit-test the state
  matrix.
- Keep browser checks because MapLibre DOM marker mount/removal still needs real
  integration verification.

## Non-blocking observations

- Adding optional fields to `ForecastDrawerRow` is backwards-compatible.
- The wind arrow renderer intentionally displays the direction the wind travels
  toward (for example wind from north is shown as `↓`); the new met.no conversion
  is consistent with that existing convention.
- Keeping the internal `eltaVedrid` translation namespace and feature-flag name
  is reasonable and avoids unrelated churn.
- The remaining admin text `Elta veðrið-aðgangur` is internal/admin-facing and
  was outside the stated user-visible rename scope. Claude Code may leave it
  unchanged unless Stebbi wants terminology normalized everywhere.
- No SQL, RLS, auth, grants, secrets, billing, or user-data risks were introduced
  by these two commits.

## Design.md check

The change is map/UI behavior and therefore `Design.md` applies. The fixes should
preserve the existing mobile-first overlay layout and must not introduce
horizontal overflow, control overlap, or dead/pending navigation. The recommended
work is lifecycle/state reconciliation only; it should not require a visual
redesign or a Design.md deviation.

## Route intelligence check

- Scope: generic separation between an active calculated route and Mitt veður
  selections; no particular route, segment, region, or route-family is changed.
- No new canonical route knowledge, control point, caution, station-matching rule,
  cache key, or fixture belongs in `IcelandRoadmap.md` / `lib/iceland-routes/`.
- The suggested fix is provider-neutral UI state management.
- No route data is stored or counted, so there is no new privacy impact.
- `IcelandRoadmap.md` does not need an update for this bounded fix.

## Verification performed

- `npm run type-check` -> exit code 0.
- `npm run test:run` -> exit code 0.
- Vitest: 129 files passed; 3577 tests passed, 27 skipped, 8 todo.
- Initial combined check with an unsupported extra invocation timed out after
  one second before useful output; it made no changes. Both canonical checks were
  then run successfully.
- No dev server or browser was started.

## Recommended implementation plan for Claude Code

1. Re-read this review and inspect the current dirty worktree before editing.
   Preserve Stebbi's unrelated `.obsidian/workspace.json` change and the existing
   v346 handoff filename delete/add state.
2. Choose and document one canonical map-mode model:
   `route`, `weather-selection`, or `overview`.
3. Make route activity reactive, or introduce one explicit reconciliation path
   that is called on every route/Mitt veður transition. Do not rely only on ref
   mutation to rerun React behavior.
4. Centralize zoom-based place-marker visibility so the thresholds exist in one
   location.
5. Ensure route activation removes Mitt veður markers and hides place markers.
6. Ensure route clear:
   - rebuilds Mitt veður markers and keeps place markers hidden when selections
     remain;
   - restores overview/place markers when no Mitt veður selection remains.
7. Remove or clarify the conflicting ownership of `weatherChaseActiveRef`.
8. Add focused pure tests for direction/emoji mappings and the map-mode
   visibility matrix.
9. Run `npm run type-check` and `npm run test:run`.
10. Stop without commit, push, deploy, migration, or production action unless
    Stebbi separately authorizes it.
11. Return a new Claude Code handoff with exact files, commands, exit codes,
    decisions, remaining risk, and the localhost matrix below.

## Localhost checks for Stebbi

Page: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Setup:

- Sign in as a user with the prototype/road-intelligence feature access.
- Have at least one Veðurstofan item and one met.no item available in Mitt veður.
- Stebbi runs localhost; Claude Code must not start or restart the dev server.

Steps and expected results:

1. With no route and no Mitt veður selection, confirm overview markers and
   zoom-appropriate green place markers appear.
2. Select 2-3 Mitt veður items. Confirm Mitt veður weather cards appear, overview
   station markers disappear, and green DOM place pills disappear.
3. Zoom in and out. Confirm green place pills do not reappear.
4. Confirm both providers show a direction arrow and expected emoji where data
   exists. Check a boundary-like direction if available (north/east/south/west).
5. Calculate a route while Mitt veður items remain selected. Confirm Mitt veður
   markers disappear immediately and only route-focused markers remain.
6. Cancel the route without changing the Mitt veður selection. Confirm Mitt veður
   markers return immediately and green place pills remain hidden.
7. Calculate and cancel again after removing every Mitt veður item. Confirm the
   normal overview and zoom-appropriate green place pills return.
8. Repeat steps 5-7 with the Mitt veður panel open and closed to ensure panel
   visibility does not corrupt map mode.
9. On a mobile viewport, confirm overlays do not overlap controls, cause
   horizontal overflow, or leave stale markers after opening/closing panels.

Main regressions to watch:

- duplicate station/weather cards
- stale or missing markers after route cancel
- green place pills flashing/reappearing during route transitions
- overview markers remaining hidden after all Mitt veður selections are removed
- zoom changing ownership of map layers

No Supabase, auth, RLS, production data, secrets, billing, deployment, or
migration action is needed for these localhost checks.

## Óvissa / þarf að staðfesta

- Confidence: high for the two P1 lifecycle findings based on direct control-flow
  inspection.
- Browser behavior was not executed because Stebbi controls localhost. The exact
  visual timing/flash behavior therefore still needs the localhost checks above.
- Confirm with Stebbi whether “Mitt veður active” means selected items own the map
  regardless of whether the panel itself is open. The existing marker behavior
  is selection-driven, and this review assumes that is the intended product rule.
