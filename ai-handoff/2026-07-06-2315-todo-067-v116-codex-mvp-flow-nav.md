# todo-067 v116 - Codex handoff: MVP flow without time step + top step navigation

Created: 2026-07-06 23:15  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Relevant TODO: todo-067 weather / Ferðalagið  
Builds on:

- `2026-07-06-2310-todo-067-v114-claude-v113-done.md`
- `2026-07-06-2310-todo-067-v115-codex-v114-review.md`
- Stebbi direction: hide the time step in MVP and add top navigation.

## Product Decision

For MVP, hide the explicit time step.

The user should not have to answer "Hvenær skiptir tíminn máli?" before seeing value. Instead:

- user chooses route
- user chooses trailer / vehicle setup
- user sees or adjusts weather thresholds
- Teskeið fetches all route weather values available for the selected route
- result shows the route overview, timeline and warnings from available forecast data

The time step can come back later as an advanced assumption. It should not be in the MVP main flow.

## MVP Step Navigation

Add a compact top step navigation under the header for the weather flow.

MVP steps:

1. `Leiðin`
2. `Eftirvagn`
3. `Veðurmörk`
4. `Niðurstöður`

Use icons, with text labels:

- `Leiðin`: `MapPinned` or `Route`
- `Eftirvagn`: `Truck` or `Car`
- `Veðurmörk`: `SlidersHorizontal`
- `Niðurstöður`: `CloudSun` or `CheckCircle2`

Behavior:

- current step is primary/dark green
- completed steps are quiet green/check state
- future steps are muted
- clicking completed previous steps is allowed
- clicking future steps should be disabled unless the required assumptions exist
- labels must fit at 360px; if labels crowd, use icons + shorter labels, not tiny text

This should feel like an app stepper, not a tab bar. It shows progress and confidence, but the user still moves through the wizard.

## Flow Changes

### 1. Remove `times` from the visible MVP flow

Current code:

```ts
type WizardStep = 'route' | 'times' | 'trailer' | 'thresholds' | 'result' | 'assumptions'
const STEP_ORDER: WizardStep[] = ['route', 'times', 'trailer', 'thresholds', 'result']
```

MVP should become:

```ts
type WizardStep = 'route' | 'trailer' | 'thresholds' | 'result' | 'assumptions'
const STEP_ORDER: WizardStep[] = ['route', 'trailer', 'thresholds', 'result']
```

Remove the visible `times` step from the main flow.

Do not show the time row in `Breyta forsendum` for MVP.

### 2. Request should omit explicit time fields

For MVP main flow, the travel API request should omit:

- `earliestDepartureAt`
- `latestArrivalBy`
- `latestHomeBy`

The backend can keep supporting these fields for later, but the client should not send them in MVP unless a future hidden/debug/advanced path explicitly opts in.

### 3. Result copy must not overclaim "leaving at now"

Important nuance:

If the user did not select a departure time, do not make the main result read like a precise "ferðin frá kl. 23:15" decision unless that is clearly framed as "ef þú leggur af stað núna".

Preferred MVP framing:

- route overview from now over available forecast data
- show timeline as the primary explanation
- show next caution if any
- show whether current departure looks okay as one datapoint, not the whole product promise

Concrete copy direction:

```text
Leiðin lítur vel út miðað við spána sem við höfum núna.
Næst verður varasamt ...
```

or:

```text
Ef þú leggur af stað núna lítur ferðin vel út.
Skoðaðu tímalínuna fyrir næstu varúðargildi.
```

Avoid implying the user chose a time when they did not.

### 4. Keep `Veðurmörk` visible

Unlike the time step, `Veðurmörk` should remain in the MVP flow because it explains the model and lets people tune their comfort level.

Keep:

- default thresholds
- custom thresholds
- `thresholdsUsed`
- result display showing which thresholds were used

Still apply v115 fix-pass items:

- enforce `cautionWindMs < redWindMs`
- remove duplicated threshold defaults if straightforward
- avoid cramped three-button action row on mobile

### 5. `Breyta forsendum`

In MVP, assumptions screen should show:

- `Leiðin`
- `Eftirvagn`
- `Veðurmörk`

No time row.

Each row should remain fully clickable as v114 implemented.

If/when time returns later, it can be added as a fourth row under "Ítarlegra" or similar.

## Revised Relationship To v115 Findings

v115 findings that still apply:

- P1 threshold validation invariant: still required.
- P2 API max one time constraint: still recommended server safety, but less urgent for MVP if client no longer sends time fields.
- P2 threshold defaults duplicated in client/server: still worth fixing.
- P2 threshold action row cramped on mobile: still worth fixing.
- P3 API validation tests: still useful.

v115 finding that becomes obsolete for MVP:

- time mode switch clearing value. If time step is hidden, this is not a user-facing MVP issue. If the code remains behind an internal path, clearing should still be implemented before exposing it later.

## Design Notes

This follows `Design.md`:

- mobile-first wizard
- stable compact controls
- no dense dashboard layout
- no unnecessary advanced inputs before value is shown
- thresholds use numeric inputs with 16px font
- stepper labels/icons must not overflow at 360px

Avoid:

- turning top navigation into a decorative tab bar
- too many labels in one row
- hidden time state affecting results
- card-inside-card layouts

## Suggested Implementation Plan For Claude Code

1. Add a reusable `WeatherStepNav` component local to `FerdalagidClient.tsx` or `components/weather/` if cleaner.
2. Render it under the header for route/trailer/threshold/result/assumptions views.
3. Remove `times` from `STEP_ORDER`.
4. Remove/hide the visible `times` JSX block from MVP flow.
5. Ensure route `onConfirm` goes to `trailer`.
6. Ensure trailer `next` goes to `thresholds`.
7. Ensure threshold submit goes to result and calls the API with no time fields.
8. Remove time row from assumptions.
9. Adjust result copy if needed so it does not pretend a user-selected time exists.
10. Apply v115 threshold validation and mobile button fixes.
11. Run `npm run type-check`.
12. Run `npm run test:run`.

## Localhost Checks For Stebbi

After Claude implements:

1. Open `/auth-mvp/vedrid`.
2. Expected top navigation: `Leiðin - Eftirvagn - Veðurmörk - Niðurstöður`, with icons.
3. Confirm first step is route selection, not time selection.
4. Pick a route and continue.
5. Expected next step: `Eftirvagn`.
6. Continue.
7. Expected next step: `Veðurmörk`.
8. Continue / calculate.
9. Expected next step: `Niðurstöður`.
10. Confirm there is no visible time step in MVP flow.
11. Confirm `Breyta forsendum` shows only route, trailer and weather thresholds.
12. Confirm result copy does not imply you selected a departure time unless phrased as "ef þú leggur af stað núna".
13. Confirm the timeline/scrubber still appears and shows available forecast slots.
14. Test at 360px, 390px and 460px: step navigation fits without horizontal overflow.

No Supabase, RLS, SQL migration, billing, production, deployment, secrets or user-data changes should be needed.

## Óvissa / þarf að staðfesta

- Exact icon choices can be adjusted by Claude Code based on available Lucide icons.
- The result semantics should be checked carefully: without a selected time, the primary result should be an overview from available forecast data, not a misleading point-in-time promise.
- Codex did not run tests for this handoff because it is a planning/update artifact only.
