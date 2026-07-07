# todo-067 v117 - Codex review: v116 fix-pass + MVP flow/nav handoff

Created: 2026-07-06 23:26  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Relevant TODO: todo-067 weather / Ferðalagið  
Reviewed:

- `2026-07-06-2321-todo-067-v116-claude-v115-done.md`
- `2026-07-06-2315-todo-067-v116-codex-mvp-flow-nav.md`

## Findings

### P1 - MVP flow decision is not implemented yet

This is not a regression in Claude Code's v116 fix-pass, because that handoff was scoped to Codex v115 findings. But it is now the next blocker before continuing the MVP UX.

Current code still has the visible time step:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:14` includes `times` in `WizardStep`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:20` keeps `STEP_ORDER = ['route', 'times', 'trailer', 'thresholds', 'result']`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:315-364` renders the `Hvenær skiptir tíminn máli?` step.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:462-466` still shows a time row in `Breyta forsendum`.

Stebbi's MVP decision is now:

```text
Leiðin -> Eftirvagn -> Veðurmörk -> Niðurstöður
```

The time step should be hidden from MVP. Teskeið should fetch and assess all available route weather values for the selected route without requiring the user to pick a time first.

### P1 - Client can still send time fields, which conflicts with the MVP framing

`app/auth-mvp/vedrid/FerdalagidClient.tsx:119-121` still sends:

- `earliestDepartureAt`
- `latestArrivalBy`
- `latestHomeBy`

For MVP, the main client request should omit these fields entirely. The API can keep supporting them for future/advanced use, and Claude Code's server-side conflict guard is fine as defensive validation. But the visible MVP path should not depend on time state.

### P2 - Result copy still implies a chosen departure time in single-window mode

`lib/weather/travel.ts:653-663` still produces copy like:

```text
Ferðin frá kl. HH:MM lítur vel út veðurfarslega.
```

That was acceptable when the user explicitly chose a departure time. If the MVP hides the time step, this copy becomes slightly misleading unless it is framed as current-departure context.

Preferred MVP copy direction:

```text
Leiðin lítur vel út miðað við spána sem við höfum núna.
```

or:

```text
Ef þú leggur af stað núna lítur ferðin vel út.
Skoðaðu tímalínuna fyrir næstu varúðargildi.
```

The important rule: do not imply the user selected a time when they did not.

### P2 - Top step navigation with icons is still missing

The header at `app/auth-mvp/vedrid/FerdalagidClient.tsx:282-295` only shows back + title. There is no top wizard navigation yet.

Add a compact stepper under the header:

1. `Leiðin`
2. `Eftirvagn`
3. `Veðurmörk`
4. `Niðurstöður`

Use lucide icons:

- `Leiðin`: `Route` or `MapPinned`
- `Eftirvagn`: `Truck` or `Car`
- `Veðurmörk`: `SlidersHorizontal`
- `Niðurstöður`: `CloudSun` or `CheckCircle2`

Behavior:

- current step is primary/dark green
- completed steps are quiet green/check state
- future steps are muted
- completed previous steps can be clicked
- future steps should be disabled unless prerequisites exist
- labels must fit at 360px without horizontal overflow

This should feel like an app wizard stepper, not a decorative tab bar.

### P3 - Claude v116 handoff format missed the required `Localhost checks for Stebbi` heading

Claude's handoff has a useful "What to check manually" section, but project rules require the exact section `Localhost checks for Stebbi`. Please use that heading in the next Claude handoff.

This is process cleanup, not a code blocker.

## What Looks Good In Claude v116

The v115 fix-pass itself looks directionally correct:

- Client-side threshold ordering is blocked before submit in `FerdalagidClient.tsx:166-170`.
- Server-side threshold ordering is blocked in `app/api/teskeid/weather/travel/route.ts:128-138`.
- API rejects multiple simultaneous time constraints in `app/api/teskeid/weather/travel/route.ts:106-109`.
- Threshold defaults are centralized through `resolveThresholds` in `lib/weather/thresholds.ts:56-67`.
- The threshold reset button has been moved out of the cramped three-button row in `FerdalagidClient.tsx:417-441`.
- Tests were added for threshold ordering in `lib/__tests__/weather-travel.test.ts:855-868`.

Codex re-ran verification:

- `npm run type-check` -> exit 0
- `npm run test:run` -> exit 0, 53 files passed, 1738 tests passed, 27 skipped, 8 todo

## Combined Handoff For Claude Code

Claude Code should treat v116 fix-pass as acceptable, then implement the MVP flow/nav decision from Codex v116.

### Required next changes

1. Add top step navigation under the weather header.
2. MVP step order must be:
   - `route`
   - `trailer`
   - `thresholds`
   - `result`
3. Remove `times` from visible MVP `STEP_ORDER`.
4. Remove or hide the visible `times` JSX block from MVP.
5. Route confirmation should go directly to `trailer`.
6. Trailer next should go to `thresholds`.
7. Threshold submit should calculate the result.
8. MVP client request should not send `earliestDepartureAt`, `latestArrivalBy` or `latestHomeBy`.
9. Remove the time row from `Breyta forsendum`.
10. Keep `Veðurmörk` visible in MVP.
11. Keep server support for time fields for future use, but do not expose it in the MVP flow.
12. Adjust result copy so no user-selected departure time is implied when no time was selected.

### Suggested component shape

Either keep it local in `FerdalagidClient.tsx` or split out to `components/weather/WeatherStepNav.tsx` if the file is getting too large.

Suggested labels/icons:

```ts
[
  { step: 'route', label: tf('stepNavRoute'), icon: Route },
  { step: 'trailer', label: tf('stepNavTrailer'), icon: Truck },
  { step: 'thresholds', label: tf('stepNavThresholds'), icon: SlidersHorizontal },
  { step: 'result', label: tf('stepNavResult'), icon: CheckCircle2 },
]
```

Add i18n keys in both `messages/is.json` and `messages/en.json`; do not hardcode user-visible labels.

### Result copy guidance

If no explicit time was sent:

- prefer overview copy from available forecast data
- show next caution as the actionable warning
- use the timeline/scrubber as the main detail
- phrase current departure as "ef þú leggur af stað núna" if it is shown at all

Do not remove the existing deterministic model. The change is UX framing and request shape, not a move to AI decisioning.

## Design Notes

This follows `Design.md`:

- mobile-first, app-like wizard
- no unnecessary advanced question before the user sees value
- compact stable controls
- no horizontal overflow at 360px
- icon + label stepper, not dense desktop navigation
- thresholds remain visible because they explain and tune the model

Avoid:

- a stepper that wraps awkwardly on narrow phones
- tiny text to force all labels into one row
- hidden time state affecting results
- hardcoded text outside `messages/*`

## Localhost checks for Stebbi

After Claude Code implements the MVP flow/nav change:

1. Open `/auth-mvp/vedrid`.
2. Confirm the top step navigation appears under the title with icons:
   - `Leiðin`
   - `Eftirvagn`
   - `Veðurmörk`
   - `Niðurstöður`
3. Confirm the first screen is route selection, not the time question.
4. Select origin and destination.
5. Confirm next step is `Eftirvagn`.
6. Continue from `Eftirvagn`.
7. Confirm next step is `Veðurmörk`.
8. Continue/calculate from `Veðurmörk`.
9. Confirm the result appears.
10. Confirm there is no visible `Hvenær skiptir tíminn máli?` step in the MVP flow.
11. Click `Breyta forsendum`.
12. Confirm assumptions show route, trailer and weather thresholds, but no time row.
13. Confirm result copy does not imply you selected a departure time.
14. Confirm the timeline/scrubber still appears and still shows future warning/caution slots.
15. Test at 360px, 390px and 460px wide:
    - stepper does not overflow horizontally
    - labels do not overlap
    - buttons remain tappable
    - no mobile zoom is triggered by threshold inputs

No Supabase, RLS, SQL migration, production, deployment, billing, API key, secret or user-data changes should be needed.

## Commands Run By Codex

```text
Get-Content -Encoding UTF8 WORKFLOW.md
Get-Content -Encoding UTF8 ai-handoff/README.md
Get-Content -Encoding UTF8 ai-handoff/2026-07-06-2321-todo-067-v116-claude-v115-done.md
Get-Content -Encoding UTF8 ai-handoff/2026-07-06-2315-todo-067-v116-codex-mvp-flow-nav.md
git status --short
git diff -- app/api/teskeid/weather/travel/route.ts app/auth-mvp/vedrid/FerdalagidClient.tsx lib/weather/thresholds.ts messages/is.json messages/en.json lib/__tests__/weather-travel.test.ts
rg -n "type WizardStep|STEP_ORDER|time_constraint_conflict|validateResolvedThresholdOrdering|thresholdOrderError|timeConstraint|earliestDepartureAt|latestArrivalBy|latestHomeBy|resolveThresholds|handleThresholdSubmit" app/auth-mvp/vedrid/FerdalagidClient.tsx app/api/teskeid/weather/travel/route.ts lib/weather/thresholds.ts lib/__tests__/weather-travel.test.ts messages/is.json messages/en.json
npm run type-check
npm run test:run
Get-Date -Format 'yyyy-MM-dd HH:mm'
```

Results:

- `npm run type-check` exit 0
- `npm run test:run` exit 0
- Test result: 53 files passed, 1738 tests passed, 27 skipped, 8 todo

## Óvissa / þarf að staðfesta

- Codex did not browser-test the stepper because Claude Code has not implemented it yet and Stebbi runs localhost/dev server himself.
- The exact icon choices can change if Claude Code finds a better Lucide fit.
- If Claude Code wants to fully delete time-state code now, that is acceptable only if it does not remove server/API support needed for later advanced timing work. Safer MVP path: hide from client flow and omit request fields, keep backend compatibility.
