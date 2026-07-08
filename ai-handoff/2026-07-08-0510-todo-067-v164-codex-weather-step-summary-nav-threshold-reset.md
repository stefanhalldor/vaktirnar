# TODO-067 v164 - Codex handoff - Ferðaveður step summary nav + conditional threshold reset

Created: 2026-07-08 05:10  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Recipient: Claude Code

## Context

Stebbi wants the Ferðaveður wizard to feel more like an app where the top step navigation reflects the assumptions already selected, not just generic step icons.

Current pain points from localhost/prod testing:

- The `Veðurmörk` step always shows `Nota sjálfgefin viðmið`, even when the visible values are already the defaults.
- The top navigation still shows generic icons/labels after the user has selected route/trailer/threshold assumptions.
- Once a route is chosen, the user should be able to glance at the top nav and see the actual route context.
- Same for trailer choice.
- Thresholds need a compact summary that is more informative than just the sliders icon, but still fits mobile.

This is a UI/polish handoff only. It should not change SQL, Supabase, RLS, Google Maps behaviour, weather calculations, or route calculation logic.

## Relevant files inspected by Codex

- `ai-handoff/README.md`
- `Design.md`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `lib/weather/thresholds.ts`
- `messages/is.json`
- `messages/en.json`

## Design.md constraints to follow

This touches navigation, layout and form controls, so `Design.md` applies:

- Mobile-first.
- No horizontal overflow at 360 px, 390 px, or 460 px.
- Text and controls must not overlap.
- Use `truncate` only when the full value is visible elsewhere in the flow.
- Fixed controls and icon/button layouts need stable dimensions.
- Icons should support meaning, not be decoration only.
- All user-facing strings belong in `messages/is.json` and `messages/en.json`.
- Navigation state must remain clear: current step, completed steps, disabled/future steps and dirty result state must still be understandable.

## Current implementation anchors

`app/auth-mvp/vedrid/FerdalagidClient.tsx` currently has:

- `STEP_ORDER = ['route', 'trailer', 'thresholds', 'result']`
- `trailerKind` and `trailerOptions`
- `thresholdOverrides`
- threshold draft state:
  - `draftCautionWind`
  - `draftRedWind`
  - `draftRedGust`
  - `draftCautionPrecip`
- `resolveThresholds(trailerKind, thresholdOverrides)`
- `handleThresholdSubmit()` already writes overrides only when draft values differ from `resolveThresholds(trailerKind)`
- `hasOverrides = Object.keys(thresholdOverrides).length > 0`
- `mvpNavSteps` around the nav render
- threshold reset button inside the `step === 'thresholds'` block

`lib/weather/thresholds.ts` currently resolves defaults by trailer:

- no trailer: `driving` defaults
- `caravan`/`horse_trailer`: current logic uses `heavyTrailer`
- other non-none trailers: current logic uses `caravan`
- precipitation default is `WEATHER_THRESHOLDS.travel.cautionPrecipMmPerHour`

Do not reinterpret these defaults in this UI pass. Use the existing `resolveThresholds()` behaviour.

## Requested implementation

### 1. Hide `Nota sjálfgefin viðmið` until thresholds differ from defaults

The reset link should only appear when the current editable values on the threshold screen differ from the current defaults for the selected trailer mode.

Important distinction:

- Do not use `thresholdsDirty` for this. That means "changed since last submitted result".
- Do not rely only on `Object.keys(thresholdOverrides).length > 0` while the user is editing the form, because the draft values may have changed before submit.
- Compare the visible draft values against `resolveThresholds(trailerKind)` when on the threshold step.

Suggested helper shape:

```ts
function thresholdDraftDiffersFromDefaults(): boolean {
  const defaults = resolveThresholds(trailerKind)
  const cautionWind = parseFloat(draftCautionWind)
  const redWind = parseFloat(draftRedWind)
  const redGust = parseFloat(draftRedGust)
  const cautionPrecip = parseFloat(draftCautionPrecip)

  if ([cautionWind, redWind, redGust, cautionPrecip].some(Number.isNaN)) {
    return Object.keys(thresholdOverrides).length > 0
  }

  return (
    cautionWind !== defaults.cautionWindMs ||
    redWind !== defaults.redWindMs ||
    redGust !== defaults.redGustMs ||
    cautionPrecip !== defaults.cautionPrecipMmPerHour
  )
}
```

Implementation detail can differ, but behaviour should be:

- Default values shown, no reset link.
- User changes one value, reset link appears immediately.
- User changes it manually back to the default, reset link disappears.
- User clicks reset, draft values return to current defaults and reset link disappears.
- Changing trailer type changes the effective defaults, so the reset-link comparison must use the currently selected trailer mode.

The reset button should still clear `thresholdError`.

### 2. Step nav should show selected route instead of generic route icon

When both `origin` and `destination` are selected, the `Leið` step in the top navigation should show a compact two-line route summary instead of the generic route icon.

Preferred mobile presentation:

```txt
Akranes
Egilsstaðir
```

Rules:

- Use `origin.name` and `destination.name` or `effectiveDestinationName` if the ferry-port substitution is active and that is what the actual driving destination is.
- Keep the step tappable if it is completed/currently navigable today.
- Keep active/current/completed visual state.
- Avoid showing long addresses in the nav. Names only.
- Use `truncate`, `min-w-0`, and a stable max height so very long place names do not push other nav items out.
- The full route is already visible elsewhere, so truncation is acceptable in this compact nav only.

If only one side is selected, keep the existing icon + `Leið` label.

### 3. Step nav should show selected trailer instead of generic trailer icon

When trailer has been selected, the `Eftirvagn` step should show the selected trailer label instead of just the icon.

Examples:

- `Enginn eftirvagn`
- `Hjólhýsi`
- `Fellihýsi`
- `Hestakerra`

Rules:

- Use the existing `trailerLabel` from `trailerOptions`.
- Keep a short, one- or two-line layout.
- Truncate long labels if needed.
- Keep disabled/current/completed visual state.
- If no explicit selection state exists beyond the default `none`, it is still acceptable to show `Enginn eftirvagn` once the user has progressed past the trailer step. Do not show it too early if it makes the first screen noisy.

### 4. Step nav should show compact threshold summary

For `Veðurmörk`, Stebbi's suggested direction is:

- wind icon with `10/15/18`
- underneath, precipitation icon/value such as `5`

Suggested compact layout:

```txt
[wind icon] 10/15/18
[rain icon] 5
```

Meaning:

- `10/15/18` = caution wind / red wind / red gust
- `5` = caution precipitation mm/klst

Rules:

- Use values from `effectiveThresholds = resolveThresholds(trailerKind, thresholdOverrides)` for submitted/active values.
- If the user is on the threshold step and editing drafts, consider whether the nav should reflect draft values live. Preferred: reflect draft values live while on the threshold step, because the nav is acting as current assumption summary.
- Keep units out of the nav if they make it too crowded, but the threshold screen itself must still show units.
- Add accessible text via `aria-label` or visually hidden text so the compact numbers are understandable to screen readers.
- Do not rely on color alone to indicate changed/custom thresholds.
- If thresholds differ from defaults, optionally show a tiny dot/badge or use existing dirty hint pattern, but do not create a loud warning. This is an assumption summary, not an error.

Potential translations to add if needed:

- `stepNavThresholdSummaryAria`: `Veðurmörk: vindur {caution}/{red}/{gust} m/s, úrkoma {precip} mm/klst`
- English equivalent.

### 5. Preserve result navigation semantics

The `Niðurstaða` step currently has special logic:

- it can be re-opened if `result !== null && !thresholdsDirty`
- it should be disabled if thresholds changed and recalculation is required

Do not regress this.

If the user changes thresholds and result is dirty:

- `Niðurstaða` should remain visually disabled or clearly unavailable.
- Existing `thresholdsDirtyNavHint` should still work.
- The user should not get stale results by tapping the result step.

### 6. Keep this scoped

Do not combine this with:

- saved places filtering,
- Google Maps referrer fallback,
- route alternatives,
- loader polish,
- Supabase migrations,
- auth changes,
- weather model threshold changes.

Those have separate handoffs/issues.

## Suggested component approach

Inside `FerdalagidClient.tsx`, consider replacing the simple `mvpNavSteps` render with a small local render helper:

```ts
function getStepNavContent(step: WizardStep) {
  // returns either generic icon/label or compact selected assumption summary
}
```

or create a tiny internal component:

```tsx
<StepNavItem
  step={s.step}
  state={...}
  summary={...}
  icon={...}
/>
```

Keep it local unless the component gets too bulky. This is not yet a shared design system primitive.

## Edge cases to handle

- Very long origin/destination names.
- Ferry-port flow where original destination is Vestmannaeyjar but driving destination is Landeyjahofn/Thorlakshofn.
- Trailer default `none` before and after the trailer step.
- User enters invalid threshold text/empty field.
- User changes threshold to non-default, reset appears.
- User changes threshold back to default manually, reset disappears.
- User changes trailer after setting custom thresholds. Existing product decision may be to keep custom thresholds, but the reset comparison must always use the new trailer's defaults.
- 360 px mobile width with Icelandic labels.

## Testing guidance for Claude Code

Run at least:

```bash
npm run type-check
npm run test:run
```

If existing focused tests for `FerdalagidClient` or threshold helpers exist, add or update tests for:

- reset link hidden at defaults,
- reset link visible after draft differs,
- reset link hidden again after draft matches defaults,
- threshold nav summary uses effective/draft values.

If component tests are not practical, extract pure helpers for:

- threshold default comparison,
- threshold nav summary values,
- route nav summary truncation/content source.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost with the weather feature enabled and Google Maps keys configured.

1. Start a new trip.
2. Select a route such as `Akranes` -> `Egilsstaðir`.
   - Expected: once both places are selected and you move forward, the top `Leið` nav item shows the selected place names compactly, not only the route icon.
3. Choose each trailer type once.
   - Expected: after the trailer step, the top `Eftirvagn` nav item shows the selected trailer label, e.g. `Enginn eftirvagn`, `Hjólhýsi`, `Fellihýsi`.
4. Go to `Veðurmörk` with untouched defaults.
   - Expected: `Nota sjálfgefin viðmið` is hidden.
5. Change one wind value.
   - Expected: `Nota sjálfgefin viðmið` appears immediately.
6. Change that value manually back to the default.
   - Expected: `Nota sjálfgefin viðmið` disappears again.
7. Change one value again and click `Nota sjálfgefin viðmið`.
   - Expected: values reset to the current defaults and the reset link disappears.
8. Check the top `Veðurmörk` nav summary.
   - Expected: it shows compact threshold values such as wind `10/15/18` and precipitation `5`, without overflow.
9. Calculate the trip.
   - Expected: result still opens normally.
10. Go back to `Veðurmörk`, change a value, and do not recalculate.
   - Expected: `Niðurstaða` should not reopen stale results if current dirty-result guard is active.
11. Repeat visually at 360 px, 390 px and 460 px widths.
   - Expected: no horizontal overflow, overlap, clipped controls, or awkward nav height jump.

No Supabase, RLS, production data, secrets, billing, or migration checks are needed for this UI-only task.

## Commands Codex ran

Read-only:

```powershell
Get-Content -Encoding UTF8 'ai-handoff/README.md'
Select-String -Path 'Design.md' -Pattern 'Navigation|mobile|overflow|text|icon|input|button|sticky|header' -Context 1,3 -Encoding UTF8
rg -n "STEP_ORDER|stepNav|thresholdReset|threshold|trailer|Eftirvagn|Veðurmörk|Leið|stepThreshold|DEFAULT" app/auth-mvp/vedrid components/weather messages/is.json messages/en.json
$p='app/auth-mvp/vedrid/FerdalagidClient.tsx'; $c=Get-Content -Encoding UTF8 $p; $c[500..620]
$p='app/auth-mvp/vedrid/FerdalagidClient.tsx'; $c=Get-Content -Encoding UTF8 $p; $c[670..725]
$p='app/auth-mvp/vedrid/FerdalagidClient.tsx'; $c=Get-Content -Encoding UTF8 $p; $c[0..125]
$p='app/auth-mvp/vedrid/FerdalagidClient.tsx'; $c=Get-Content -Encoding UTF8 $p; $c[330..385]
$p='lib/weather/thresholds.ts'; if (Test-Path $p) { Get-Content -Encoding UTF8 $p }
$p='messages/is.json'; $c=Get-Content -Encoding UTF8 $p; $c[735..775]
Get-ChildItem -File 'ai-handoff' | Select-Object Name,Length | Sort-Object Name | Select-Object -Last 15
Get-Date -Format "yyyy-MM-dd HH:mm"
```

No tests were run by Codex. No app code, SQL, env, production data or migrations were changed by Codex.
