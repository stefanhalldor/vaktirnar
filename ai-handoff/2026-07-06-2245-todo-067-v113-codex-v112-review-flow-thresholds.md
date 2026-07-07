# todo-067 v113 - Codex review: v112 threshold plan + simplified assumptions flow

Created: 2026-07-06 22:45  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Relevant TODO: todo-067 weather / Ferðalagið  
Reviews: `2026-07-06-2235-todo-067-v112-claude-v111-p2fix-threshold-plan.md`

## Findings

### P1 - Do not implement threshold controls on top of the current three-date time step

The v112 threshold plan is technically sensible, but the current time step is already too complex:

- `departureAt`
- `latestArrivalBy`
- `latestHomeBy`

All three are shown at once in `FerdalagidClient.tsx:229-275`. That creates too many possible interpretations for normal users and makes the result copy harder to trust.

Before adding threshold controls, simplify time input to one active time constraint.

Recommended model:

```ts
type TimeConstraintKind = 'departure_at' | 'latest_arrival_by' | 'latest_home_by'

type TimeConstraint = {
  kind: TimeConstraintKind
  value: string
} | null
```

UI:

- one selector: "Hvað viltu tímasetja?"
- three choices:
  - "Brottför"
  - "Koma fyrir"
  - "Heim fyrir"
- one `datetime-local` input

Request mapping:

- `departure_at` -> send `earliestDepartureAt`, clear `latestArrivalBy` and `latestHomeBy`
- `latest_arrival_by` -> send `latestArrivalBy`, clear `earliestDepartureAt` and `latestHomeBy`
- `latest_home_by` -> send `latestHomeBy`, clear `earliestDepartureAt` and `latestArrivalBy`
- no time selected -> all three omitted, current default behavior

This makes the result deterministic and easier to explain: the user has chosen one timing question, not a mix of constraints.

### P1 - Threshold screen should be a first-class wizard step, then editable under "Breyta forsendum"

Stebbi's direction:

> Það væri áhugavert að búa til sérstakan "threshold" skjá í next-next-finish viðmótinu og svo myndum við fella það undir "Breyta forsendum" takkann.

Codex agrees. Do this as a real screen/step, not a dense inline block hidden inside the result.

Recommended flow:

1. Route
2. Time constraint
3. Trailer
4. Weather thresholds / `Veðurmörk`
5. Result

The threshold step should be concise:

- show the active default thresholds for the selected trailer mode
- allow editing values
- include "Nota sjálfgefin viðmið"
- final primary action is the calculation action, e.g. "Reikna ferðina"

In the assumptions screen, add a clickable "Veðurmörk" row that opens this same threshold step. Do not duplicate threshold editing in multiple places.

### P2 - Put "Breyta forsendum" and "Byrja aftur" at the top of the result

Stebbi wants the result actions at the top. That makes sense because the result can become long with map, timeline, point details and explanations.

Current result actions are near the bottom at `FerdalagidClient.tsx:588-609`.

Recommended placement:

- Put them directly under the route summary and before the result card.
- Keep them compact in one row on mobile:
  - `Breyta forsendum` as the stronger secondary action
  - `Byrja aftur` as quieter secondary/ghost
- Remove the bottom duplicate unless manual testing shows the long page needs a repeated action.

This follows `Design.md`: primary workflows should be easy to reach, controls should be stable on mobile, and operational screens should not bury common actions.

### P2 - Assumption cards should be fully clickable

Stebbi wants to click anywhere on each assumption card to edit that assumption.

Current `AssumptionRow` is a non-clickable card with a small nested edit button (`FerdalagidClient.tsx:682-708`). That is more fiddly than it needs to be on mobile.

Recommended implementation:

- Make `AssumptionRow` render a single full-width `<button type="button">`.
- Keep label and value inside.
- Add a subtle edit affordance, e.g. `Breyta` text or a `ChevronRight`/edit icon.
- Do not nest a button inside a button.
- Use `aria-label`, e.g. `Breyta forsendu: Brottför`.
- Keep touch target at least 44px high.

### P2 - v112 P2 fix looks shipped; keep it

The `kl.` English leak appears fixed in current `FerdalagidClient.tsx:634-647`:

- Icelandic same-day: `kl. HH:mm-HH:mm`
- English same-day: `HH:mm-HH:mm`
- Icelandic cross-day uses `kl.`
- English cross-day uses `at`

No further action needed there unless tests fail.

### P3 - Component tests for `DepartureHeatmap` are still a gap

v112 correctly says no component test setup exists for `DepartureHeatmap`. Keep this as a manual QA requirement unless Claude adds a small component test setup safely.

Do not let this block the UX simplification, but do not forget it before release.

## Revised implementation sequencing for Claude Code

Do not execute the original v112 threshold implementation as-is. Revise it in this order:

1. Keep the v112 locale fix.
2. Simplify the time step to one active `TimeConstraint`.
3. Update API request mapping so only one of `earliestDepartureAt`, `latestArrivalBy`, `latestHomeBy` is sent.
4. Update the assumptions screen to show one time row, not three.
5. Make `AssumptionRow` fully clickable.
6. Move `Breyta forsendum` and `Byrja aftur` to the top of the result.
7. Add `thresholds` / `Veðurmörk` as a first-class wizard step.
8. Add threshold controls and backend overrides per v112, with resolved thresholds used throughout the deterministic model.
9. Add/update tests for:
   - one time constraint mapping
   - overridden thresholds changing status
   - `thresholdsUsed`
   - invalid threshold validation
   - date formatting still passing
10. Run `npm run type-check`.
11. Run `npm run test:run`.

## UX details for the simplified time step

Suggested Icelandic copy:

- title: `Hvenær skiptir tíminn máli?`
- selector label: `Veldu eitt`
- options:
  - `Brottför`
  - `Koma fyrir`
  - `Heim fyrir`
- input labels:
  - `Hvenær viltu leggja af stað?`
  - `Hvenær viltu vera komin/nn í síðasta lagi?`
  - `Hvenær þarftu að vera heima í síðasta lagi?`
- no-time option, if needed: `Skiptir ekki máli núna`

Design recommendation:

- Because labels are short, a segmented control can work for the three choices.
- If it feels cramped at 360px, use a select/menu instead. Do not let the segmented control wrap awkwardly.
- The datetime input must stay 16px on mobile to avoid iOS zoom.

## UX details for threshold step

The threshold step should feel like "your assumptions", not advanced developer settings.

Suggested copy:

```text
Veðurmörk
Teskeið notar þessi mörk til að lita leiðina græna, gula eða rauða.
Þú getur hert eða slakað á þeim fyrir þessa ferð.
```

Controls:

- `Varúð ef vindur fer yfir` [number] `m/s`
- `Ekki mælt ef vindur fer yfir` [number] `m/s`
- `Ekki mælt ef hviður fara yfir` [number] `m/s`
- `Varúð ef úrkoma fer yfir` [number] `mm/klst`

Actions:

- `Nota sjálfgefin viðmið`
- `Reikna ferðina`

Assumptions row display:

```text
Veðurmörk
Þín viðmið: vindur 15/20 m/s, hviður 28 m/s, úrkoma 2.0 mm/klst
```

or, when unchanged:

```text
Veðurmörk
Sjálfgefin viðmið
```

## Notes on "Byrja aftur" and threshold persistence

v112 says not to reset `thresholdOverrides` on `startOver()` unless explicitly asked.

Codex recommendation:

- For Phase 1, keeping thresholds during the same browser session is reasonable because they behave like a temporary user preference.
- But make this visible. If thresholds are custom, the result and assumptions screen must clearly say `Þín viðmið`.
- `Nota sjálfgefin viðmið` must be easy to find.
- Phase 2 persistence in Supabase remains separate and needs RLS review.

## Localhost checks for Stebbi

After Claude implements the revised plan:

1. Open `/auth-mvp/vedrid`.
2. Confirm result screen has `Breyta forsendum` and `Byrja aftur` near the top, before the long map/timeline content.
3. Confirm `Breyta forsendum` opens an assumptions screen.
4. Confirm each assumption row is clickable anywhere, not only on a tiny edit button.
5. Confirm the time assumption is one row, not three separate rows.
6. Test each time mode:
   - `Brottför`: only departure time affects the request/result.
   - `Koma fyrir`: result finds a departure window before arrival deadline.
   - `Heim fyrir`: result evaluates outbound + possible return before home deadline.
7. Confirm switching time mode clears or replaces the previous time mode so stale hidden date values do not affect the result.
8. Confirm `Veðurmörk` appears as a separate step and as a row under assumptions.
9. Lower wind threshold and recalculate. Expected: same weather can become yellow/red because the user's threshold changed.
10. Click `Nota sjálfgefin viðmið` and recalculate. Expected: default interpretation returns.
11. Check mobile widths 360px, 390px and 460px: no horizontal overflow, no input zoom, buttons fit cleanly.

No Supabase, RLS, SQL migration, billing, production, deployment, secrets or user-data changes should be needed unless Phase 2 persistence is added later.

## Óvissa / þarf að staðfesta

- The exact visual choice for the time-kind selector should be tested at 360px. Use segmented control only if it stays clean; otherwise use a select/menu.
- Heimkoma mode semantics should be manually tested because it uses return-leg logic and can be confusing if the copy does not explain it well.
- Codex did not run tests for this review.
