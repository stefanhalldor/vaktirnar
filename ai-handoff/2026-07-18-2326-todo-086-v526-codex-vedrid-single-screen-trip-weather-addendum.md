# 2026-07-18 23:26 - TODO 086 v526 - Codex addendum: `/vedrid` as single-screen trip weather

Send this alongside:

- `2026-07-18-2317-todo-086-v525-codex-v524-prerelease-review.md`

This is not a request to deploy, commit, run SQL, or touch production.

## Context

Stebbi tested the new `/vedrid` overview and annotated a desired order on the screenshot. The product direction is now clearer:

`/vedrid` should become the primary single-screen weather/trip-weather workspace. `/ferdalagid` can remain the full exact calculation view, but `/vedrid` should increasingly reuse the same route/weather logic directly instead of feeling like a separate overview toy.

## Screenshot Interpretation

I read Stebbi's drawn ordering as:

1. Conditions drawer: `Fréttir af aðstæðum frá notendum Teskeiðarinnar`
2. Map
3. Status filter pills under the map
4. Source/time selector at the top
5. Weather threshold controls
6. `Frá` / `Til` route inputs
7. Bottom-centered `Ferðalagið` CTA

Desired top-to-bottom order on `/vedrid`:

1. Source/time selector:
   - `Vegagerðin` / `Núna`
   - `Veðurstofan/Yr` / `Spá`
2. `Frá` and `Til` inputs with dropdown autocomplete
3. Route summary / provisional label when applicable
4. Weather thresholds
5. Conditions drawer
6. Map
7. Status filter pills
8. Bottom-centered `Ferðalagið` CTA

Remove the small inline `Ferðalagið` CTA inside the route-lens result area. Keep one clear bottom CTA.

## Product Requirement

When a user has selected `Frá` and `Til`, the map should not show weather stations scattered across all Iceland.

Instead:

- if exact/cached route geometry is available, show only provider stations within 1 km of that route geometry, matching `/ferdalagid`
- if exact route geometry is not available without Google cost, do **not** pretend the curated corridor is exact
- show a clear cache-miss/provisional state and keep `Ferðalagið` as the exact calculation CTA

The curated route-family lens can remain as a temporary fallback only if clearly labelled as provisional. It must not be visually or semantically treated as the same thing as the `/ferdalagid` 1 km route-geometry matching.

## Core Rule: Reuse, Do Not Duplicate

Do not rebuild a second travel-weather engine inside `/vedrid`.

Inspect and reuse/extract from existing `/ferdalagid` logic:

- place autocomplete / search dropdowns
- selected `from` / `to` place model
- route option/result model
- route geometry station matching
- provider station distance-to-route logic
- 1 km station filter behavior
- route state and URL prefill/restore
- departure scrubber behavior
- status pill classification/counting

If current `/ferdalagid` code is too page-bound, extract reusable hooks/helpers/components instead of copy/pasting behavior into `/vedrid`.

## Must-Have Implementation Scope

### 1. Reorder `/vedrid` UI

Apply the screenshot order:

- source/time selector above route inputs
- route inputs above thresholds
- thresholds above conditions drawer
- conditions drawer above map
- map above status pills
- one `Ferðalagið` CTA at bottom

Keep mobile-first spacing. Avoid card-in-card nesting and horizontal overflow.

### 2. Add Autocomplete Dropdowns To `Frá` And `Til`

The current text-only `Frá`/`Til` fields are not enough.

Use the same autocomplete/search behavior as the trip weather route selection flow:

- dropdown opens while typing
- selected item preserves place name/address/coordinates as needed
- keyboard/mobile behavior remains stable
- input text stays at least 16 px on mobile
- no unexpected zoom

Do not create a separate new autocomplete API/logic if one already exists.

### 3. Switch From Curated Corridor To Exact Cached Route When Possible

When both places are selected:

- first try to resolve a cached/local route geometry without Google
- if route geometry exists, use that geometry to filter provider stations
- station inclusion should match `/ferdalagid`: within 1 km of route geometry unless an explicit route/control-point rule says otherwise
- apply to both Vegagerðin and Veðurstofan through the same provider-neutral matching model

If no exact cached route exists:

- show cache miss / provisional route state
- do not silently show all Iceland as if the route filter worked
- do not call Google implicitly unless Stebbi has explicitly approved that product/cost behavior
- bottom `Ferðalagið` CTA should take the user to exact route calculation with `Frá`/`Til` prefilled

### 4. Convert Scrubber Semantics When Route Is Selected

When no route is selected:

- source/time selector can remain general overview mode:
  - Vegagerðin current measurements
  - Veðurstofan/Yr forecast time

When route is selected and exact geometry is available:

- scrubber should move toward `Brottför` semantics like `/ferdalagid`
- not just "choose a general forecast time"
- status dots should reflect the selected route's relevant provider points, not all Iceland

Do not remove the current provider/time selector concept yet. The important shift is that route-selected mode should feel like trip weather, not an unrelated map forecast.

### 5. Status Pill Counts Must Match Visible Route Points

After route filtering:

- map markers and status pill counts must refer to the same station set
- pills must use the same labels/colors as `/ferdalagid`
- no duplicate status classification logic

### 6. Bottom CTA

Keep one bottom-centered CTA:

- label: `Ferðalagið`
- opens exact route calculation view with current `Frá`/`Til` prefilled
- if a cached route is already available, preserve that context where possible
- style can remain slightly more prominent/fun than the black default button, but stay within Teskeið tokens

## Explicit Non-Goals In This Pass

- Do not deploy.
- Do not commit unless Stebbi explicitly asks.
- Do not run SQL or migrations.
- Do not create new persisted route history or route-interest logging.
- Do not call Google from `/vedrid` typing or route-lens resolution unless explicitly approved.
- Do not replace `/ferdalagid` completely yet.

## Route Intelligence Check

This work touches:

- route geometry
- route cache
- provider station matching
- departure time semantics
- `/vedrid` overview map
- `/ferdalagid` shared domain logic

Required:

- update `IcelandRoadmap.md` if any new reusable route/cache/station matching abstraction is introduced
- keep route-domain logic in `lib/iceland-routes/` or an equally reusable weather-route domain module
- if exact cached geometry is not available yet, document the gap clearly instead of hiding it in UI code

Privacy/cost:

- no new personal route persistence in this pass
- no new Google cost without explicit approval
- if route cache is read, make sure cache keys do not expose sensitive home addresses in client-visible state

## Design Check Requirements

Relevant `Design.md` constraints:

- mobile-first at 360, 390, 460 px
- inputs must be at least 16 px to avoid iOS zoom
- no horizontal overflow when dropdowns open
- touch targets at least ~40 px
- route inputs and dropdown should not push important controls into broken scroll states
- bottom CTA must leave safe-area/browser-chrome breathing room
- no card-in-card layout

## Suggested Validation Commands

Run at least:

```bash
npm run type-check
npm run test:run -- lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/iceland-routes-segments.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-travel.test.ts
```

Add or update focused tests for:

- route selected with cached geometry filters stations to the same 1 km rule as `/ferdalagid`
- route selected without cached geometry does not pretend to be exact
- status pill counts equal visible markers after route filter
- autocomplete selected values pass correctly into bottom `Ferðalagið` CTA
- source/time selector switches to departure semantics when exact route mode is active

## Localhost Checks For Stebbi

1. Open `/vedrid` at 360, 390, and 460 px widths.
2. Confirm order matches the screenshot intent:
   - source/time selector
   - Frá/Til
   - thresholds
   - conditions drawer
   - map
   - pills
   - bottom `Ferðalagið`
3. Type in `Frá`.
   - Dropdown appears.
   - Select Reykjavík.
   - No mobile zoom, no horizontal overflow.
4. Type in `Til`.
   - Dropdown appears.
   - Select Akureyri.
5. If cached route geometry exists:
   - map shows only stations on the selected route
   - stations should match `/ferdalagid` 1 km behavior
   - pills count only visible route stations
   - scrubber reads as departure/trip-weather context
6. If cached route geometry does not exist:
   - UI clearly says the exact route is not available in the quick view
   - it does not show all Iceland as if filtered
   - bottom `Ferðalagið` CTA still works with Frá/Til prefilled
7. Compare same route in `/vedrid/ferdalagid`.
   - station set should be consistent where exact geometry is used.
8. Toggle Vegagerðin and Veðurstofan/Yr modes.
   - same route filter applies consistently.
   - no provider ID bleed-through.
9. Refresh page after selecting a route.
   - if state persistence is in scope, route state is restored
   - if not in scope, handoff must say so explicitly

No SQL, Supabase, env, Vercel, production, commit, push, or deploy action is part of these checks.
