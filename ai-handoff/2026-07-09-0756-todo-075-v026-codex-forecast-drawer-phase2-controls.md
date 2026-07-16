# Codex handoff: TODO #75 v026 - Forecast drawer phase 2 controls

Created: 2026-07-09 07:56  
Timezone: Atlantic/Reykjavik

## Context

Stebbi asked Codex to review `2026-07-09-0748-todo-075-v025-claude-forecast-drawer-sticky-header` and create one combined handoff for that work plus the next forecast-drawer improvements:

- Filter out certain hours, ideally with manual user control.
- Put weather thresholds at the top of the drawer, keep them sticky, and let the user adjust them there.
- Show warning markers where a value exceeds the active thresholds.
- Add gusts in a polished way.

This is a handoff/plan only. Codex did not change app code, SQL, migrations, commits, deployment, Supabase, secrets, or production data.

## Codex review of v025

The v025 direction is broadly useful and should be kept:

- Sticky drawer header is the right direction for a long hourly forecast.
- Yr and Google Maps links in the drawer are useful.
- Departure context in the drawer helps users understand which route/timing produced the highlighted forecast row.
- Replacing the old `highlightedLabel` copy with a consistent label like `Spágildið sem notað var í útreikning` is good.
- Moving the drawer away from a wide table toward a mobile-first grid is a sensible step.

But please tighten these before building on top of v025:

1. **Temperature trend color should not imply safety yet.**
   v025 colors temperature increases as positive and decreases as negative. Earlier TODO #75 direction intentionally kept temperature neutral until frost/ice semantics exist. Please either keep temperature neutral or explicitly ask Stebbi to approve simple temperature trend coloring. Codex recommendation: show temperature delta/arrow neutrally for now.

2. **Do not let the sticky header become a wall of controls.**
   The drawer is already mobile-first and max-height constrained. Add filters and thresholds as compact sticky controls. If the threshold editor is expanded, it can be a disclosure below the sticky summary, but the always-sticky area should stay readable on 360-390px wide screens.

3. **Separate trend tone from threshold warnings.**
   A value can be improving but still unsafe. For example, gusts may be going down but still be over the selected gust limit. Trend arrows/colors and warning markers need separate logic.

## Combined implementation plan

### Phase 2A - Stabilize v025 as the base

Keep the v025 sticky drawer work, but adjust the details:

- Keep sticky title row, close button, Yr/Google links, departure context, and highlighted row label.
- Keep the drawer mobile-first and avoid horizontal overflow.
- Keep raw `met.no` links/debug out of the main drawer unless already intentionally exposed elsewhere.
- Revert or neutralize temperature color semantics unless Stebbi explicitly approves them.
- Make warning icons accessible. Do not rely on a bare `⚠` only; include an `aria-label` or visually hidden label.

### Phase 2B - Add time filtering

Add a compact filter control in the sticky drawer header.

Recommended presets:

- `Allt`
- `Dagur`
- `Fela nótt`
- `Sérsniðið`

Suggested default:

- Keep `Allt` as the default so we never silently hide risky weather.

Suggested night definition:

- Use `23:00-06:00` unless Stebbi prefers `00:00-06:00`.
- Document the choice in the handoff after implementation, because older notes mention both.

Manual mode:

- Let the user pick visible hours with hour-level controls, e.g. `Sýna frá 06:00 til 23:00`.
- Support wrap-around logic cleanly if needed.
- Avoid native controls that cause mobile zoom or awkward keyboard behavior. Prefer buttons/segmented controls/steppers already consistent with the app.

Important behavior:

- Never hide the highlighted row used by Teskeið without making it obvious.
- If the highlighted row falls outside the active filter, either keep it visible with a small label like `Utan síu` or show a clear action such as `Sýna spágildið sem var notað`.
- If hidden rows contain warnings or non-green statuses, show a compact summary, e.g. `3 faldir tímar yfir mörkum`.

### Phase 2C - Sticky thresholds and editable preview

Add a sticky threshold summary near the top of the drawer, for example:

`Veðurmörk: vindur 10/15 m/s · hviður 18 m/s · úrkoma 5 mm/klst`

Add a compact `Breyta` control that opens threshold editing inside the drawer.

Critical product rule:

- The drawer must start from the thresholds actually used for the current route result.
- If the user changes thresholds inside the drawer, treat it as a **preview for the drawer table** unless the user explicitly recalculates the route assessment.
- Do not silently update the selected departure result, scrubber counts, map statuses, top summary, or route weather verdict from drawer-only edits.

Recommended copy for preview mode:

`Breytingar hér lita spátöfluna. Reiknaðu ferðina aftur til að uppfæra ferðamatið.`

If scope allows, add a clear action:

`Nota þessi mörk og reikna aftur`

If that becomes too broad, keep this phase to drawer-only preview and leave recalculation as a follow-up.

Validation:

- Reuse the same threshold validation rules as the existing weather-threshold step.
- Keep caution/red wind ordering valid.
- Prevent negative values and nonsensical precipitation/gust thresholds.

Implementation note:

- Avoid duplicating threshold logic inside the React component.
- Prefer extracting pure display helpers into a client-safe module, e.g. `lib/weather/forecastDrawerDisplay.ts`, so warning derivation can be unit-tested without pulling in server-only route code.

### Phase 2D - Warning markers per value

Use the active drawer thresholds to mark cells that exceed limits:

- Wind over caution/red wind threshold.
- Gust near/over selected gust threshold.
- Precipitation over selected precipitation threshold.

The warning should be attached to the specific metric cell, not only the whole row.

Suggested semantics:

- `danger`: over red/selected hard limit.
- `caution`: near hard limit or over caution limit.
- `notice`: notable gust spread or close to limit.
- `none`: no marker.

Important edge case:

- A metric that is trending in a good direction but is still over threshold must still show the warning marker.

### Phase 2E - Gust display polish

Show gusts inside the wind column/cell without making the table cramped.

Recommended mobile format:

- Primary line: `7,9 m/s`
- Secondary line or compact chip: `hvið. 12,3 ↑1,2`

Severity styling:

- Normal gust: muted secondary text.
- Notice gust: subtle yellow/amber chip or marker.
- Caution/danger gust: stronger amber/red chip with accessible warning text.

Do not make the wind column so wide that the row overflows on mobile. If needed, use a two-line mobile row layout instead of forcing all content into a single grid row.

## Suggested files to inspect

- `components/weather/ForecastDrawer.tsx`
- `lib/weather/travel.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`
- Existing threshold UI/components used by the weather threshold step
- Existing tests around `buildForecastRows`, `deriveGustSeverity`, and travel weather evaluation
- `Design.md`, especially mobile-first controls, dense data display, no horizontal overflow, and structured summary guidance

## Suggested tests

Add or update tests for:

- Time filter presets, including night filtering.
- Manual time-range filtering, including wrap-around if supported.
- Hidden-risk summary when filtered-out rows include warnings.
- Highlighted row behavior when the highlighted hour is outside the active filter.
- Gust severity based on active thresholds.
- Threshold preview changing drawer warnings without mutating the route result.
- Wind/gust/precip warning markers being independent from trend tone.
- Temperature remaining neutral unless Stebbi explicitly approves trend coloring.

Run:

- `npm run type-check`
- `npm run test:run`
- `npm run build` if this touches shared route/client boundaries or extracted helpers.

## Scope boundaries

Do not include in this phase unless Stebbi separately approves:

- New SQL or migrations.
- Supabase/RLS/auth changes.
- New met.no, Google Maps, Mapbox, or other paid/external API calls.
- Route-provider changes.
- Persisting custom thresholds server-side.
- Commit, push, deploy, or production rollout.

The drawer should use forecast data and thresholds already present in the current result. This should be a UI and pure-display-logic improvement, not a new data-fetching feature.

## Óvissa / þarf að staðfesta

- Confirm whether `Fela nótt` means `23:00-06:00` or `00:00-06:00`. Codex recommends `23:00-06:00` for travel-weather scanning, but this is a product choice.
- Confirm whether Stebbi wants temperature trend coloring now. Codex recommends neutral temperature trend display until frost/ice semantics exist.
- Confirm whether drawer threshold editing should be preview-only in this phase or include a `Nota þessi mörk og reikna aftur` action. Codex recommends preview-only first unless the existing recalculation flow is easy to reuse cleanly.
- Confidence: medium-high on UI/product direction, medium on exact implementation details because Codex did not inspect the full current component after v025 beyond the handoff and known diff summary.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost and use routes that produce enough hourly forecast rows, for example Garðabær -> Akranes and Garðabær -> Þorlákshöfn.

Check these before release:

1. Open `Spá 🥄` from the destination weather block.
2. Open `Spá 🥄` from the most demanding point card.
3. Open `Spá 🥄` from at least one row under `Allir spápunktarnir á leiðinni`.
4. Confirm the drawer header stays sticky while scrolling.
5. Confirm Yr and Google Maps links are visible, tappable, and do not stretch awkwardly across mobile width.
6. Confirm time filters work and that hidden risky hours are summarized.
7. Confirm the highlighted row used by Teskeið is still findable even if the active filter would normally hide it.
8. Change thresholds in the drawer and confirm warning markers update in the drawer.
9. Confirm changing thresholds in the drawer does not silently change the top verdict, scrubber counts, map coloring, or selected departure summary unless a deliberate recalculate action is implemented and used.
10. Confirm gusts look polished at 360px and 390px wide viewports with no horizontal overflow.
11. Confirm temperature is not misleadingly colored as safer/less safe unless Stebbi explicitly approved that product behavior.
12. Close the drawer with the X and by tapping outside; confirm focus/scroll state still feels normal on mobile.
