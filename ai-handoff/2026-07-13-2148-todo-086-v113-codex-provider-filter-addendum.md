# TODO 086 v113 - Codex provider filter addendum for Veðurstofan travel layer

Created: 2026-07-13 21:48 Atlantic/Reykjavik

## Context

Stebbi has not sent v111 or v112 to Claude Code yet.

Use this handoff as the current clarification/addendum for the next Claude Code step. It supersedes sending v111 alone and extends v112.

Relevant prior docs:

- `2026-07-13-2140-todo-086-v111-codex-v110-ui-toggle-review.md`
- `2026-07-13-2143-todo-086-v112-codex-provider-aware-point-layer-addendum.md`

The direction is no longer just a single "Veðurstofan on/off" card below the route result. Stebbi wants a future-proof provider filter near the summary/result area.

## Stebbi's clarified product direction

Build a provider filter at the top near the summary/result card. It should let the user toggle weather-source layers in and out:

- `met.no`
- `Veðurstofan`
- `Vegagerðin`

For now this whole provider filter should stay under the same experimental/feature-gated surface as the current Veðurstofan component.

`Vegagerðin` should be shown as disabled by default, labelled clearly as in progress, for example:

- `Vegagerðin (í vinnslu)`

Do not integrate a real Vegagerðin source yet. The disabled control is a product placeholder and a future-proof UI affordance, not a data integration.

## Product intent

The user should eventually understand every displayed weather point as coming from a provider/source.

Instead of hiding Veðurstofan behind a separate card, the UI should move toward a provider-aware model:

- Existing route forecast points are `met.no`.
- Veðurstofan station/forecast points are `Veðurstofan (í prófun)`.
- Vegagerðin is reserved for later and disabled.

This should help us reach the future state where:

- the same point-card component is reused for worst point, selected map point, and all forecast points;
- cards/markers have explicit provider labels;
- links are provider-specific;
- the baseline MET/Yr flow remains intact while Veðurstofan is tested as an additive layer.

## Recommended behavior for the next implementation

Use a multi-select filter/toggle group, not a mutually exclusive segmented control, because users may want multiple providers visible at the same time.

Recommended defaults:

- `met.no`: on
- `Veðurstofan`: off initially, or preserve the existing current default if Claude already implemented one intentionally
- `Vegagerðin (í vinnslu)`: off and disabled

Avoid letting the UI enter a confusing empty state. If `met.no` is the only enabled source and Veðurstofan is off/unavailable, either keep `met.no` locked on or immediately restore it if the user tries to turn everything off.

Important distinction:

- The provider filter should first control visibility of provider points/cards/markers.
- It must not accidentally remove the current MET/Yr baseline calculation from the product.
- If the current Veðurstofan toggle already controls the augmented route result, fold that behavior into the `Veðurstofan` filter carefully and label it clearly as experimental.

In other words: `met.no` remains the stable baseline. Veðurstofan can be shown as an extra experimental layer and, where already implemented, can be included in the augmented result under the feature flag. Do not make normal users depend on Veðurstofan yet.

## UI placement

Place the provider filter near the top of the weather result/summary card, before the deeper point details/list. Stebbi specifically wants it "efst hjá summary spjaldinu".

The current separate card:

> Veðurstofan (í prófun)

can become or be replaced by a compact provider filter panel, so the user sees this as source/layer control rather than a one-off experiment toggle.

Suggested visual hierarchy:

- short label such as `Gagnaveitur` or `Spágögn`
- toggle/check controls:
  - `met.no`
  - `Veðurstofan (í prófun)`
  - `Vegagerðin (í vinnslu)` disabled
- short helper text only if needed:
  - `MET/Yr er áfram grunnspáin. Veðurstofugögn eru í prófun. Vegagerðin er ekki komin inn.`

Keep text short and put it in `messages/is.json` and `messages/en.json`, not hardcoded in components.

## Design.md implications

This is a mobile-first control surface.

Follow `Design.md`:

- Use toggles/checkboxes for binary provider visibility, not a mutually exclusive segmented control.
- Keep tap targets at least about 40x40.
- Ensure labels fit at 360/390/460 px widths without overflow.
- Disabled `Vegagerðin (í vinnslu)` must have a clear disabled visual state and not rely on color alone.
- Controls need accessible names and keyboard/focus-visible behavior.
- Do not create horizontal overflow or controls that require manual zoom.

The current switch review in v111 still matters: if any switch remains, it needs an accessible name and a mobile-friendly hit target.

## Provider-aware point/card model

Continue the v112 direction: create or move toward a normalized point card model, for example:

- `provider: 'metno' | 'vedurstofan' | 'vegagerdin'`
- provider display label
- coordinates
- forecast/observation fields that exist for that provider
- provider-specific links
- source freshness/status

Cards should not assume every point has Yr links or raw MET links.

Provider-specific links:

- `met.no` cards can show `Yr` and raw met.no data links where available.
- `Veðurstofan` cards should not show Yr links. If we have `source_url` from `vedurstofan_stations`, show a direct vedur.is station/source link.
- `Vegagerðin` cards do not exist yet.

Provider labels:

- Existing MET/Yr route cards should be visibly labelled `met.no`.
- Veðurstofan cards should be visibly labelled `Veðurstofan (í prófun)`.
- Do not label Veðurstofan rows as `Vegagerðin` just because some stations have owner `Vegagerðin`. Provider and owner are different concepts.

## Map and list expectations

Stebbi expected that, when Veðurstofan is enabled, point count/listing should grow beyond the current MET/Yr route points.

Desired direction:

- "Allir spápunktar" should be able to include both MET/Yr route points and Veðurstofan provider points.
- Veðurstofan points should be clearly marked as provider `Veðurstofan`.
- If map markers are included in this step, they must also respect the provider filter.

Recommended implementation order if scope feels large:

1. Fix v111 accessibility/stale drawer issues.
2. Replace the one-off Veðurstofan card with the provider filter near the summary card.
3. Make the all-points list/card rendering provider-aware.
4. Then add provider-aware map markers, if that is still small and safe.

Do not force all map-marker refactoring into the same patch if it would balloon the change. It is better to land a clean shared card/filter model first.

## Data/cost constraints

Keep the future-proof, low-cost architecture:

- Do not add direct client-side calls to Veðurstofan, MET/Yr, Google, or Vegagerðin.
- Use existing server/API/product-table data.
- Toggling providers should filter already-fetched data in the UI where possible.
- Do not add any extra Google or met.no cost.
- Keep Veðurstofan behind feature flag/per-user access.

## Files Claude Code should inspect

Likely relevant:

- route weather UI component(s) that currently render the summary card and Veðurstofan toggle
- `RouteWeatherPointDetailCard` or equivalent shared card component
- API/DTO code returning `vedurstofanLayer`
- message files:
  - `messages/is.json`
  - `messages/en.json`
- tests around route weather, feature gating, and Veðurstofan layer

Claude should preserve unrelated dirty worktree changes.

## Specific questions for Claude Code

Please answer in the handoff before or after implementation:

1. Is the provider filter controlling display only, or also the experimental augmented result calculation?
2. Is `met.no` allowed to be toggled off when no other active provider is visible?
3. Does the all-points list now contain provider-labelled Veðurstofan points, or only MET/Yr points?
4. Are Veðurstofan links using `vedurstofan_stations.source_url` when available?
5. Are all new user-facing strings in `messages/is.json` and `messages/en.json`?

## Localhost checks for Stebbi

Use localhost after Claude implements the next patch.

Preconditions:

- Sign in as a user with access to the relevant weather feature and the `elta-vedrid`/Veðurstofan experimental flag.
- Ensure local Veðurstofan data has been warmed/projected if the UI expects Supabase-backed Veðurstofan rows.

Checks:

1. Open the route weather flow that shows the summary/result card.
2. Confirm the provider filter appears near the top of the summary/result area, not buried below the route/map.
3. Confirm `met.no` is on by default.
4. Confirm `Veðurstofan (í prófun)` can be toggled on/off.
5. Confirm `Vegagerðin (í vinnslu)` is visible but disabled/off and cannot be toggled.
6. With Veðurstofan off, confirm the existing MET/Yr baseline result still behaves as before.
7. With Veðurstofan on, confirm Veðurstofan points/cards are clearly labelled as Veðurstofan and are not pretending to be Yr/met.no.
8. In "Allir spápunktar", confirm provider labels are visible and provider-specific links make sense:
   - met.no rows may show Yr/met.no links;
   - Veðurstofan rows should not show Yr links;
   - Veðurstofan rows should show vedur.is/source links if available.
9. Toggle filters several times and confirm the selected/worst point drawer/card does not show stale data from a previous provider state.
10. On mobile widths around 360, 390, and 460 px, confirm no horizontal overflow, no clipped labels, and tap targets feel usable.
11. With the experimental flag/access off, confirm normal users do not see the experimental provider filter and the existing weather flow remains unchanged.

Do not test this by changing production data, running migrations, or calling production cron endpoints unless Stebbi explicitly approves that separately.
