# 2026-07-18 17:39 - TODO 086 v515 - Codex addendum: source/time selector for Núna vs Spá

Created: 2026-07-18 17:39
Timezone: Atlantic/Reykjavik

Send alongside:
- `ai-handoff/2026-07-18-1735-todo-086-v514-codex-v513-review-and-hardening-plan.md`

## Short Human Summary

The `/vedrid` overview should make the time/source model obvious:

- `Núna` = Vegagerðin current observations, with the newest measurement time visible.
- `Spá` = Veðurstofan/Yr forecast timeline.

Instead of separate top provider pills plus a separate forecast scrubber, combine this into one reusable source/time selector. Put `Núna` first, then forecast slots. This should replace the current top provider pills.

## Product Intent

Stebbi wants users to understand immediately:

- Vegagerðin is the current/now layer.
- Veðurstofan/Yr is the forecast layer.
- The map color semantics are the same threshold-driven experience everywhere.
- Old Vegagerðin measurements should not disable the Vegagerðin control. Users still need to inspect the latest available current measurements, even when stale.

Suggested visual model:

```text
Vegagerðin          Veðurstofan/Yr
Núna 10:27          Spá: 18 21 00 03 06 ...
```

This can be implemented as a compact horizontal control/scrubber. Exact layout can be tuned, but the product meaning must be clear.

## Design / Architecture Principles

Follow `Design.md`:

- Mobile-first.
- No page-level horizontal overflow.
- Fixed control sizes where possible.
- Loading state must not change control width.
- Status cannot rely on color alone.
- Extract reusable component when the same behavior is shared across providers/pages.

Do not create a one-off `/vedrid` hack. This should be provider-neutral enough to later support:

- Vegagerðin current observations.
- Veðurstofan forecast.
- Yr at the same station coordinates.
- Future providers with current vs forecast semantics.

## Implementation Plan Addendum For Claude Code

```text
Workflow

Read:
- ai-handoff/2026-07-18-1735-todo-086-v514-codex-v513-review-and-hardening-plan.md
- ai-handoff/2026-07-18-1739-todo-086-v515-codex-v514-source-time-selector-addendum.md
- WORKFLOW.md
- Design.md relevant UI/mobile/reusable-control sections

Goal:
Add the UX clarification Stebbi requested: one source/time selector where `Núna` for Vegagerðin is first, and `Spá` for Veðurstofan/Yr forecast slots follows. This should replace the current top provider filter pills on `/vedrid`.

Scope:
- UI/client logic only unless a missing timestamp field requires a small DTO addition.
- No SQL.
- No migration run.
- No commit, push, deploy, or production action.
- Keep v514 hardening tasks in the same pass if safe.

Tasks:

1. Turn the current forecast scrubber into a provider-neutral source/time selector.
   - Either extend `ForecastTimeScrubber` or create a new reusable component such as `WeatherSourceTimeSelector`.
   - Do not duplicate provider-button markup and scrubber logic in `WeatherOverviewClient`.
   - The component should accept structured items/groups, not hardcoded Veðurstofan-only assumptions.

2. Add a first `Núna` item for Vegagerðin.
   - Group/source label: `Vegagerðin`.
   - Main label: `Núna`.
   - Secondary label: newest Vegagerðin measurement time, e.g. `10:27` or `Mælt 10:27`.
   - Status dot/color should reflect the worst current Vegagerðin wind status under the active thresholds, using the same status model as the map.
   - It must remain clickable/active even when measurements are stale.
   - Disable only when there are no Vegagerðin rows at all or while the data needed for that item truly has not loaded.

3. Add the forecast group for Veðurstofan/Yr.
   - Group/source label: `Veðurstofan/Yr`.
   - Label the forecast side as `Spá`.
   - Forecast slots remain the 3-hour slots from Veðurstofan for now.
   - Yr comparison is future work; do not implement Yr runtime fetching here.
   - The selected forecast slot continues to drive Veðurstofan marker colors/counts/details.

4. Replace the current top provider pills.
   - Remove the separate `Vegagerðin (núna)` / `Veðurstofan (spá)` top pills from `/vedrid`.
   - The new source/time selector becomes the visible provider/time control.
   - Selecting `Núna` should show/use Vegagerðin current layer.
   - Selecting a forecast slot should show/use Veðurstofan forecast layer.
   - Keep status filter pills under the map exactly aligned with the active layer/status model.

5. Loading and partial-data behavior:
   - If Vegagerðin loads first, render `Núna` and the map without waiting for Veðurstofan.
   - If Veðurstofan loads later, add forecast slots silently without page jump.
   - If one provider is loading, show a stable small loading state inside that group/control.
   - Do not make the whole `/vedrid` page sit in a stale `Hleð...` state when one provider is already usable.

6. Text/messages:
   - All visible new text goes through `messages/is.json` and `messages/en.json`.
   - Suggested IS:
     - `Vegagerðin`
     - `Núna`
     - `Mælt {time}`
     - `Veðurstofan/Yr`
     - `Spá`
     - `Sæki nústöðu`
     - `Sæki spá`
   - Keep text short enough for mobile.

7. Accessibility:
   - `Núna` and each forecast slot need full `aria-label`.
   - Example: `Vegagerðin núna, mælt kl. 10:27, Innan marka`.
   - Forecast slot example: `Veðurstofan/Yr spá föstudaginn 18. júlí kl. 12:00, Nálgast óþægindi`.
   - Visible labels can stay compact; accessibility labels carry the full context.

8. Testing:
   - Update/add unit tests for source/time selector item derivation if there is a pure helper.
   - Keep existing wind-status tests from v514.
   - Run:
     - `npm run type-check`
     - relevant `npm run test:run -- ...` tests for changed helpers/components
   - Do not run SQL.

After implementation:
- Create a new handoff in `ai-handoff/`.
- Include exact files changed and commands/exit codes.
- Include SQL status: no SQL run.
- Include Localhost checks for Stebbi.
```

## Localhost Checks For Stebbi

1. Open `http://localhost:3004/vedrid` as public.
2. Confirm the old top provider pills are gone.
3. Confirm the new source/time selector appears near the map and starts with:
   - `Vegagerðin`
   - `Núna`
   - newest measurement time
4. Confirm `Núna` is selectable even if Vegagerðin data is old/stale.
5. Select `Núna`.
   - Map should show Vegagerðin current points.
   - Status pill counts under the map should reflect Vegagerðin current wind thresholds.
6. Select a Veðurstofan/Yr forecast slot.
   - Map should show Veðurstofan forecast points for that selected time.
   - Status pill counts should update to the selected forecast time.
7. Change wind thresholds from 10/15 to another value.
   - `Núna`, forecast slot colors, map colors, and counts should all update consistently.
8. Test mobile widths 360/390/460 px.
   - No page-level horizontal overflow.
   - The source/time selector can scroll inside itself if needed.
   - Text does not overlap or force zoom.

No Supabase migration, Vercel change, env change, commit, push, or deploy is part of this addendum.

## Óvissa / þarf að staðfesta

- I did not inspect the exact current DTO field name for newest Vegagerðin measurement timestamp in this pass. Claude Code should reuse an existing field if available; add only a small DTO field if absolutely needed.
- I am assuming the desired interaction is one active source/time mode at a time: `Núna` for Vegagerðin or one forecast slot for Veðurstofan/Yr. If Stebbi wants multi-select layers later, keep that as a separate design decision.
