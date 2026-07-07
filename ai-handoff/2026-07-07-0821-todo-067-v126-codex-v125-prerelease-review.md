# todo-067 v126 - Codex prerelease review of Claude v125

Created: 2026-07-07 08:21  
Timezone: Atlantic/Reykjavik  
Relevant TODO: todo-067 - Veðrið / Ferðalagið  
Reviewed handoff: `2026-07-07-0820-todo-067-v125-claude-prerelease.md`

## Findings

### P1 - Scrubber title/help text fix only applies in window mode

`app/auth-mvp/vedrid/FerdalagidClient.tsx:747`  
`messages/is.json:696-697`  
`messages/is.json:728`

This is still visible in localhost: the scrubber card says:

`Veðurþróun á næstu klukkustundum`

and there is no helper text explaining that the user can click departure times and watch the map change.

This was already specified in the earlier Codex v123 review:

- Title: `Brottfarartíminn í Teskeið`
- Subtitle/help text: `Prófaðu að smella á brottfarartíma hér að neðan og sjáðu kortið breytast`
- Localhost check: title is `Brottfarartíminn í Teskeið` and subtitle/helper text is equivalent to the above.

Why it dropped out:

- `messages/is.json` has the new keys:
  - `heatmapDeparturePickerTitle`
  - `heatmapDeparturePickerSubtitle`
- But `FerdalagidClient` only uses them when `result.travelPlan!.outbound.windowMode` is true.
- In the current screenshot, the UI is using the single-departure/timeline branch, so it still renders `timelineSingleDepartureTitle`.

Required fix:

- Use `heatmapDeparturePickerTitle` for the outbound `DepartureHeatmap` title in both window mode and single-departure/timeline mode.
- Pass `heatmapDeparturePickerSubtitle` in both modes, or create an equivalent single-mode subtitle only if wording truly needs to differ.
- Do not keep `Veðurþróun á næstu klukkustundum` as the visible title for this card in Ferðalagið.
- Update English similarly:
  - title: `Departure time in Teskeið`
  - subtitle: `Try tapping a departure time below and watch the map update`

### P1 - Beta banner is not on all weather screens

`app/auth-mvp/vedrid/FerdalagidClient.tsx:369-370`  
`app/auth-mvp/vedrid/VedridClient.tsx:111-127`

Codex v125 required a beta/test-version banner on every weather screen. Claude added `WeatherBetaBanner` to `FerdalagidClient`, but not to `VedridClient`. The handoff also calls this out as not done.

That leaves the older/simple weather screen with attribution and menu, but without the visible test-version warning. Since Stebbi explicitly asked for a banner "efst á allar skjámyndirnar", this is not prerelease-complete.

Required fix:

- Add `WeatherBetaBanner` to `VedridClient` too, directly below the header and above the form.
- Keep it identical to `FerdalagidClient` unless there is a concrete layout issue.
- Re-check 360px, 390px and 460px widths for header + banner + form.

### P2 - The beta banner feedback copy lost the screenshot/explanation instruction

`components/weather/WeatherBetaBanner.tsx:16-24`  
`messages/is.json:596-598`  
`messages/en.json:592-594`

Codex v125 asked for the banner to invite users to send Facebook messages "með skjámynd og skýringu" if something is unclear or wrong. The current implementation has:

- title
- generic body
- link text `Senda ábendingu`

The sentence about sending a screenshot and explanation is not visible. That matters because this beta is partly about collecting actionable real-user debugging feedback, not just generic comments.

Required fix:

- Add a short feedback sentence to the banner body area, e.g.
  - IS: `Ef eitthvað er óskýrt eða rangt máttu senda okkur skilaboð á Facebook með skjámynd og skýringu.`
  - EN: `If something is unclear or wrong, send us a Facebook message with a screenshot and explanation.`
- Keep the link text short: `Senda ábendingu` / `Send feedback`.

### P2 - Old threshold wording still appears in result summary and issue audit card

`app/auth-mvp/vedrid/FerdalagidClient.tsx:670-677`  
`app/auth-mvp/vedrid/FerdalagidClient.tsx:947-955`

Claude fixed `DepartureHeatmap` and `TravelAuditMap` point details, but `FerdalagidClient` still has old formatting in:

- next-caution summary line
- `IssueAuditCard`

Both still use `aboveThresholdShort` and `.toFixed(1)`, e.g. potentially:

`Vindur: 8.7 m/s yfir mörkum 8.0 m/s`

This conflicts with the newer required style:

`Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`

Required fix:

- Import/reuse `formatNum` in `FerdalagidClient`.
- Use `aboveThresholdWithExcess` wherever an issue value and threshold are shown.
- Remove or leave unused `aboveThresholdShort` only if no current UI path still uses it. If kept for older paths, do not use it in Ferðalagið result UI.

### P2 - Map time chips still show only ETA, not forecast time

`components/weather/TravelAuditMap.tsx:332-352`  
`components/weather/travelAuditMap.helpers.ts:257-258`

v119/v121 defined the trust-map target like this:

- visible map label should mean ETA on route, with forecast timestep in parentheses when readable
- example: `10:42 (11:00)`
- selected/warning points should get map-level time labels, not only panel text
- selected point panel should show `Áætlað á leið`, `Spágildi notað`, and `Næsta spágildi` when available

Current implementation is only partial:

- the map chip is generated with `makeTimeLabelSvg(formatKlTime(timeIso))`, so it shows only route ETA, e.g. `23:20`
- no `(spátími)` / forecast timestep appears in the chip
- when `activeCandidate` exists, `buildPointSummary` hides `forecastTimeIso` and `nextForecast` to avoid stale data

That hide-stale-data choice is safer than showing wrong data, but it means the full v119/v121 "ETA + spátími + next forecast for selected candidate" scope is still not complete.

Recommended handling:

- Do not block the small prerelease copy/banner fixes on the full data-model work if Stebbi wants to test quickly.
- But keep this as an explicit remaining product gap.
- If Claude Code continues this now, extend active-candidate per-point data so selected/warning points can show:
  - route ETA
  - forecast timestep used
  - next forecast trend
- Once that data exists, update map chips for selected/warning points to show `ETA (spátími)` where readable.

### P3 - TeskeidMenu likely does not mark weather as active

`components/teskeid/TeskeidMenu.tsx:14-18`

The authenticated menu active prefixes include `/auth-mvp/heim`, `/auth-mvp/lanad-og-skilad`, and `/auth-mvp/umonnun`, but not `/auth-mvp/vedrid`.

This is not a release blocker for the requested hamburger affordance, but if the menu is visible on weather screens it may feel slightly off if no item is active or if the app home item does not represent the weather feature.

Decision:

- Optional for this pass.
- If simple, include `/auth-mvp/vedrid` in the active prefix list for the relevant authenticated item.
- Do not invent a new menu item in this pass unless Stebbi asks for it.

## What looks good

- `npm run type-check` passes locally.
- Targeted helper test file passes locally: `47 passed`.
- `formatNum` covers Icelandic comma decimal formatting and whole-number trimming.
- `TravelAuditMap` point details now use `aboveThresholdWithExcess`.
- `DepartureHeatmap` slot details use `aboveThresholdWithExcess`.
- Attribution is corrected to `MET Norway (met.no)` in both locales.
- `TeskeidMenu` is present in both `FerdalagidClient` and `VedridClient` headers.
- The menu button itself has a 44x44 target and existing aria labeling through `TeskeidMenu`.

## Release recommendation

Not quite prerelease-ready yet.

This is close, but I would ask Claude Code for one small follow-up before Stebbi tests broadly:

1. Fix the scrubber title/helper text in both window mode and single-departure/timeline mode.
2. Add `WeatherBetaBanner` to `VedridClient`.
3. Add the missing screenshot/explanation feedback sentence to the beta banner.
4. Convert the remaining `aboveThresholdShort` / `.toFixed(1)` weather issue displays in `FerdalagidClient` to the new excess wording and `formatNum`.

Then decide separately whether to continue into the larger v119/v121 forecast-time data model. That is still a real product gap, but it is larger than the immediate prerelease copy/banner cleanup.

No Supabase, SQL, auth, env, billing, Google/Mapbox key, deployment or production changes are needed.

## Localhost checks for Stebbi

After Claude Code fixes the above:

### Scrubber title/help text

1. Open `/auth-mvp/vedrid`.
2. Choose a route/time that shows the departure scrubber.
3. Test both:
   - a window-mode flow if available
   - a single-departure/timeline flow like the current screenshot
4. Expected:
   - The scrubber card title is `Brottfarartíminn í Teskeið`.
   - The card includes helper text equivalent to `Prófaðu að smella á brottfarartíma hér að neðan og sjáðu kortið breytast`.
   - It no longer says `Veðurþróun á næstu klukkustundum`.
   - Clicking a departure time still updates the selected slot and map.

### Beta banner coverage

1. Open `/auth-mvp/vedrid`.
2. Check the first/simple weather screen if it appears.
3. Go into the Ferðalagið wizard.
4. Expected:
   - Both the simple weather screen and every Ferðalagið step show `Prófanaútgáfa`.
   - The banner includes wording about sending Facebook feedback with a screenshot and explanation.
   - The Facebook link opens the configured Facebook profile in a new tab.

### Threshold copy

1. Pick a route/time that creates yellow or red weather points.
2. Check:
   - result summary / next caution line
   - departure time detail
   - selected map point detail
   - "Af hverju?" / issue audit details if visible
3. Expected:
   - All user-visible issue text uses the same style:
     `Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`
   - Icelandic numbers use comma decimals.
   - Whole thresholds do not show unnecessary `,0`.

### Header/menu regression

1. Check mobile widths 360px, 390px and 460px.
2. Expected:
   - Back arrow, `Veðrið` title and hamburger do not overlap.
   - Menu opens and closes.
   - No horizontal overflow.
   - Focus state is visible.

### Existing weather regressions

- Route map still renders.
- Timeline/scrubber still renders.
- Clicking time chips and map points still selects/deselects points.
- `Fara á versta punkt` still appears when relevant.
- Attribution says `Byggt á gögnum frá MET Norway (met.no)`.

### Remaining trust-map gap from v119/v121

1. Pick a long route with warning points.
2. Select different departure times.
3. Expected for the eventual full scope:
   - selected/warning map chips can show ETA and forecast timestep, e.g. `10:42 (11:00)`, where readable.
   - selected point panel can show active-candidate `Spágildi notað` and `Næsta spágildi` without using stale `summaryForWindow`.
4. Current known limitation:
   - if this is not implemented in the immediate follow-up, Claude Code should keep it documented as an open product gap rather than implying v119/v121 is fully complete.

## Commands Codex ran

Read-only / review-only:

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-07-0820-todo-067-v125-claude-prerelease.md'`
- `git status --short`
- `rg -n "WeatherBetaBanner|TeskeidMenu|formatNum|aboveThresholdWithExcess|attribution|betaBanner|FlaskConical|profile.php\\?id=61590612753245|Byggt á gögnum|MET Norway|aboveThresholdShort" app\auth-mvp\vedrid components\weather lib\__tests__ messages\is.json messages\en.json`
- `rg -n "Veðurþróun á næstu klukkustundum|Brottfarartíminn í Teskeið|Prófaðu að smella|timelineSingleDepartureTitle|heatmapDeparturePickerTitle|watch the map update|kortið breytast" ai-handoff app\auth-mvp\vedrid components\weather messages\is.json messages\en.json`
- `rg -n "ETA \\(forecast\\)|forecast timestep|forecastTimeIso: activeCandidate|makeTimeLabelSvg\\(formatKlTime|Spágildi notað|pointForecastTimeLabel|nextForecast" ai-handoff\2026-07-07-0633-todo-067-v119-codex-map-point-time-labels-forecast-trend.md ai-handoff\2026-07-07-0651-todo-067-v121-codex-v120-scope-review.md components\weather\TravelAuditMap.tsx components\weather\travelAuditMap.helpers.ts`
- targeted `Get-Content` reads of:
  - `components/weather/WeatherBetaBanner.tsx`
  - `components/weather/travelAuditMap.helpers.ts`
  - `components/weather/TravelAuditMap.tsx`
  - `components/weather/DepartureHeatmap.tsx`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `app/auth-mvp/vedrid/VedridClient.tsx`
  - `components/teskeid/TeskeidMenu.tsx`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Date -Format 'yyyy-MM-dd HHmm'`

Validation commands:

- `npm run type-check` - pass
- `npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts` - pass, 47 tests

Codex did not change app code, SQL, env variables, Supabase, auth, deployment, commits or production.

## Óvissa / þarf að staðfesta

- I did not run the full `npm run test:run` suite; Claude reported it passing in v125. I only reran type-check and the directly relevant helper tests.
- I did not test in browser because Stebbi runs localhost/dev server.
- I did not verify Vercel deployment. No deploy/push approval was given.
