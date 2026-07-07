# todo-067 v125 - Codex review of Claude v124 + beta shell/attribution handoff

Created: 2026-07-07 08:01  
Timezone: Atlantic/Reykjavik  
Relevant TODO: todo-067 - Veðrið / Ferðalagið  
Reviewed handoffs:

- `2026-07-07-0820-todo-067-v124-claude-phase1-fixes-done.md`
- `2026-07-07-0742-todo-067-v124-codex-weather-beta-shell-attribution.md`

## Findings

### P1 - Map point detail still uses the old threshold wording

`components/weather/TravelAuditMap.tsx:554-560`

Claude fixed the threshold/excess wording in `DepartureHeatmap` slot detail, but the selected map point detail still uses:

```tsx
{highlightedIssue!.thresholdValue !== undefined && (
  <> {tf('aboveThresholdShort', { threshold: highlightedIssue!.thresholdValue.toFixed(1), unit: highlightedIssue!.thresholdUnit ?? '' })}</>
)}
```

That means the point panel can still show old wording like:

`Vindur: 8.7 m/s yfir mörkum 8.0 m/s`

Instead it should use the same meaning Stebbi requested:

`Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`

Required fix:

- Use `aboveThresholdWithExcess` for point detail too.
- Show value, excess and threshold from the same `highlightedIssue` object.
- Do not leave two different threshold explanation styles in the same result UI.

### P2 - Icelandic decimal formatting still uses a dot instead of comma

`components/weather/DepartureHeatmap.tsx:282`  
`components/weather/TravelAuditMap.tsx:557-559`

The new strings use `.toFixed(1)`, so Icelandic UI displays `8.7`, `0.7`, `8.0`. Stebbi explicitly asked for:

`Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`

Required fix:

- Add or reuse a small locale-aware number formatter.
- For Icelandic, use comma decimal separator.
- Prefer trimmed thresholds when they are whole numbers:
  - `8 m/s`, not `8,0 m/s`
  - `0,7 yfir 8 m/s mörkum`
- Keep English formatting natural:
  - `8.7 m/s (0.7 above the 8 m/s limit)`
- Use this formatter in both `DepartureHeatmap` slot detail and `TravelAuditMap` point detail.

### P2 - Active-candidate forecast time is now hidden, which is safer but not complete

`components/weather/travelAuditMap.helpers.ts:247-248`

Claude changed `buildPointSummary` so `forecastTimeIso` and `nextForecast` are hidden when `activeCandidate` exists:

```ts
forecastTimeIso: activeCandidate ? undefined : pt.summaryForWindow?.forecastTimeIso,
nextForecast: activeCandidate ? undefined : pt.summaryForWindow?.nextForecast,
```

This avoids showing stale/incorrect forecast data for a selected departure slot. That is better than misleading users. However, it does not fully solve Stebbi's original concern about understanding "Spagildi notad" for a selected point/candidate.

Decision for this pass:

- This is acceptable as an interim safety fix.
- Do not reintroduce stale `forecastTimeIso` or `nextForecast`.
- If Claude wants to solve it fully now, extend candidate point data so the selected candidate can carry per-point forecast hour/trend. Otherwise leave this as a known limitation in handoff.

### P2 - v124 beta banner, menu and attribution are still unimplemented and should be next

Evidence:

- `messages/is.json:595` still says `Veðurgögn frá Veðurstofu Íslands í gegnum met.no`
- `messages/en.json:591` still says `Weather data from the Icelandic Met Office via met.no`
- `FerdalagidClient` header at `app/auth-mvp/vedrid/FerdalagidClient.tsx:351-364` has back arrow + title, but no standard app menu/hamburger
- No `Prófanaútgáfa` / `Test version` weather banner keys are present

This is expected because Claude v124 was scoped to v123 fixes. It now needs to be implemented from the Codex v124 handoff included below.

### P3 - Add focused tests for the remaining copy/formatting cases

Claude added useful helper tests for `candidateToIssue` and marker colors. The remaining risk is presentation correctness:

- Icelandic decimal comma and whole-number threshold trimming.
- Point detail and slot detail using the same excess wording.
- Attribution text changed in both languages.

If component tests are too heavy, put the number/excess formatting behind a helper and unit test it.

## What looks good in Claude v124

- `candidateToIssue` now accepts `thresholdsUsed`, and the tests cover custom caution wind, custom gust, trailer default, and trailer override.
- Marker highlight no longer forces red; selected/highlighted markers preserve their own status color.
- Time chips are clickable and toggle selection.
- Clicking a route/forecast point again toggles it off.
- User-selected map point is preserved when the heatmap slot changes, and `Fara á versta punkt` gives the user a way back.
- Green slots are hidden by default in filters and map markers are dimmed when their status is filtered out.
- Navigation back to `Niðurstaða` is guarded by `thresholdsDirty`, which is the right direction.

## Required implementation for Claude Code

Please do this in one scoped pass:

1. Fix the residual threshold explanation issues from this review:
   - `TravelAuditMap` point detail must use the same excess wording as the heatmap slot detail.
   - Icelandic numeric formatting must use comma decimals and avoid unnecessary `.0` for whole threshold values.
2. Implement the full v124 beta shell/attribution/menu handoff below.
3. Run:
   - `npm run type-check`
   - relevant tests, at minimum the weather/helper test files touched by this pass
4. Return a normal Claude handoff with changed files, commands, results, limitations and `Localhost checks for Stebbi`.

Do not touch:

- Supabase
- SQL/migrations
- auth/RLS
- env variables
- Google/Mapbox billing/API keys
- deployment
- commit/push
- production

## Included v124 handoff: weather beta banner, app menu, and attribution

### Context

Claude Code had already worked from v123. This v124 intentionally kept the newest UI shell/communication items separate so Claude could finish v123 without racing a moving target.

Stebbi wants three additional UI-level changes for the weather flow:

1. Add a clear beta/test-version banner at the top of every weather screen.
2. Correct the weather data attribution from `Veðurstofa Íslands í gegnum met.no` to safer MET Norway / met.no wording.
3. Add the app menu/hamburger to the weather flow header.

This should be a follow-up after v123 unless Claude Code explicitly decides the changes are trivial and safe to include in the same pass.

### 1. Beta/test-version banner on every weather screen

Add a visible but calm banner near the top of every `Veðrið` / `Ferðalagið` screen:

- route selection
- trailer
- weather thresholds
- results
- assumptions/edit flow if still reachable
- any loading/error state in the weather wizard

Purpose:

- Make it clear to users that this is a test/beta version.
- Build trust by being transparent that the model is under development.
- Encourage users to sanity-check the result against official weather/road information.

Recommended Icelandic copy:

Title:

`Prófanaútgáfa`

Body:

`Við erum að þróa ferðaveðrið. Berðu matið saman við opinbera veðurspá og aðstæður á vegum.`

Optional shorter body if space is tight:

`Ferðaveðrið er í þróun. Berðu matið saman við opinbera veðurspá.`

Feedback CTA:

`Ef eitthvað er óskýrt eða rangt máttu endilega senda okkur skilaboð á Facebook með skjámynd og skýringu.`

Facebook link:

`https://www.facebook.com/profile.php?id=61590612753245`

Recommended English copy:

Title:

`Test version`

Body:

`We are still developing the travel weather assessment. Compare it with official forecasts and road conditions.`

Feedback CTA:

`If something is unclear or wrong, please send us a Facebook message with a screenshot and explanation.`

UI guidance:

- Use a compact info/warning banner, not a destructive error style.
- It should be visible near the top, likely below the `Veðrið` header / step navigation and above the step content.
- Keep it mobile-first and low-height enough not to dominate the wizard.
- Use Teskeid design tokens.
- Avoid scary wording, but be clear that this is not a final safety authority.
- Include icon if there is an existing Lucide icon that fits, e.g. `Info`, `FlaskConical`, or `BadgeAlert`; do not use red.
- All user-facing text must be in `messages/is.json` and `messages/en.json`.
- Include the Facebook feedback link as a small secondary text link/button inside the banner or immediately under it.
- Link text should be short, e.g. `Senda ábendingu` / `Send feedback`.
- Open external Facebook link in a normal safe way:
  - `target="_blank"` if the app pattern allows it
  - `rel="noopener noreferrer"` for external links
- Do not require login or collect feedback inside Teskeid for this MVP.

Suggested implementation:

- Create a small reusable component local to the weather flow if this is only used there, e.g. `WeatherBetaBanner`.
- Render it once in `FerdalagidClient` so it appears across all wizard steps.
- If there are nested weather components/screens that bypass `FerdalagidClient`, ensure the banner appears there too.

### 2. Attribution footer should credit MET Norway / met.no

Current footer in screenshots:

`Veðurgögn frá Veðurstofu Íslands í gegnum met.no`

This should be changed. Codex checked official met.no docs:

- `https://api.met.no/doc/License`
- `https://api.met.no/doc/TermsOfService`
- `https://api.met.no/weatherapi/locationforecast/2.0/documentation`

The license page says credit should be given to The Norwegian Meteorological Institute, shortened `MET Norway`, as the source of data. It suggests wording such as `Data from MET Norway` or `Based on data from MET Norway`.

Required behavior:

- Do not claim `Veðurstofa Íslands` as the data source unless Claude Code can verify that exact product/data path and attribution requirement.
- For MVP, use safer wording:
  - Icelandic preferred: `Byggt á gögnum frá MET Norway (met.no)`
  - Alternative: `Veðurgögn frá MET Norway (met.no)`
  - English preferred: `Based on data from MET Norway (met.no)`
- Because Teskeið adds its own route/threshold assessment on top of the forecast, `Byggt á gögnum frá MET Norway (met.no)` / `Based on data from MET Norway (met.no)` is the best wording.
- Keep the deterministic explainer separate:
  - `Reiknað úr veðurspá og leið, ekki giskað af gervigreind.`

Implementation:

- Update `messages/is.json` and `messages/en.json`.
- Replace the footer everywhere the old text appears in the weather flow.
- If practical, make `MET Norway (met.no)` a link to `https://api.met.no/` or `https://api.met.no/doc/License`, but do not clutter the mobile UI.
- Do not use `Yr` branding or logo unless specifically reviewed.

### 3. Add app menu/hamburger to the weather header

Stebbi notes that the menu/hamburger is missing in all screenshots.

Required behavior:

- Weather flow header should include the standard app menu/hamburger affordance.
- Apply across all weather wizard screens:
  - route selection
  - trailer
  - thresholds
  - result
  - assumptions/edit flow if reachable
- Keep the existing back arrow.
- Use the existing app menu/header pattern if available.
- If the `auth-mvp` weather route bypasses the usual app shell, implement the smallest compatible header/menu integration and call out the architectural reason in handoff.

UI/accessibility:

- Menu button should have accessible label, e.g. `Opna valmynd` / `Open menu`.
- Use visible focus state.
- Touch target should be at least 40x40px.
- Must not create horizontal overflow at 360px, 390px, or 460px.
- Header should remain calm: back arrow left, title/feature identity clear, menu affordance on the right or consistent with the app.

## Design notes

This follows `Design.md`:

- Mobile-first app experience.
- Header/navigation should feel consistent across the app.
- Important state should be visible but not visually destructive.
- User-facing text belongs in message files.
- No horizontal overflow or mobile zoom issues.
- Touch targets should generally be at least 40x40px.
- Focus-visible must be clear.

For the beta banner, avoid a marketing/hero treatment. This is an operational notice inside an app flow.

## Suggested implementation order

1. Add a shared number/excess formatter and use it in both heatmap slot detail and map point detail.
2. Update message keys for:
   - beta banner title/body/feedback/link text
   - attribution footer
   - menu aria label if missing
3. Add/render beta banner in the weather flow.
4. Replace attribution text.
5. Add standard app menu/hamburger to weather header.
6. Add focused tests where practical.
7. Run type-check and relevant tests.

## Localhost checks for Stebbi

After Claude Code implements v125:

### Threshold/excess wording

1. Open `/auth-mvp/vedrid`.
2. Choose a route/time where the heatmap has yellow or red departure slots.
3. Click a yellow/red departure slot.
4. Expected:
   - Slot detail says something like `Vindur: 8,7 m/s (0,7 yfir 8 m/s mörkum)`.
   - It uses the actual user-visible threshold, not an old default.
   - Icelandic decimals use comma, not dot.
5. Click the corresponding/worst map point.
6. Expected:
   - Point detail uses the same wording style and same threshold/excess logic.
   - No panel still says only `yfir mörkum 8.0 m/s`.

### Beta banner

1. Open `/auth-mvp/vedrid`.
2. Check each weather wizard step:
   - route
   - trailer
   - thresholds
   - result
   - assumptions/edit if reachable
3. Expected:
   - A visible banner says `Prófanaútgáfa`.
   - Banner copy says the travel weather assessment is under development and should be compared with official forecasts/road conditions.
   - Banner includes a small feedback action, e.g. `Senda ábendingu`, linking to `https://www.facebook.com/profile.php?id=61590612753245`.
   - The copy invites users to send a screenshot and explanation if something is unclear or wrong.
   - Banner is visible without looking like an error.
   - Banner does not push core controls too far down or make the mobile UI feel cramped.

### Attribution

1. Check footer text on all weather screens.
2. Expected:
   - It no longer says `Veðurgögn frá Veðurstofu Íslands í gegnum met.no`.
   - It says `Byggt á gögnum frá MET Norway (met.no)` or equivalent.
   - Deterministic explainer still says the result is calculated from weather forecast and route, not guessed by AI.

### Header/menu

1. Check every weather wizard screen at mobile widths 360px, 390px, and 460px.
2. Expected:
   - Back arrow still works.
   - `Veðrið` title remains clear.
   - Menu/hamburger is visible and tappable.
   - No header overlap or horizontal overflow.
   - Focus state is visible for keyboard navigation.

### Regression checks

- Route map still displays correctly.
- Threshold inputs still have mobile-safe size.
- Result map and scrubber still fit within the viewport.
- Clicking a map point selects it; clicking it again deselects it.
- Clicking a time chip behaves like clicking the point.
- Selected yellow point stays yellow, not red.
- `Fara á versta punkt` appears when user has selected another point and works.
- No new API calls, billing, auth, Supabase, Google/Mapbox key, or production behavior should be introduced by this UI shell change.

## Commands Codex ran

Read-only / review-only:

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-07-0820-todo-067-v124-claude-phase1-fixes-done.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-07-0742-todo-067-v124-codex-weather-beta-shell-attribution.md'`
- `Select-String -Path 'Design.md' -Pattern 'mobile|navigation|header|banner|overflow|button|focus|text|app' -Context 1,2 -Encoding UTF8`
- `rg -n "thresholdsUsed|aboveThresholdWithExcess|candidateToIssue|forecastTimeIso|nextForecast|activeCandidate|userSelectedRef|showWorst|Fara á versta|clickable: true|heatmapDeparturePicker|thresholdsDirty|MET Norway|Prófanaútgáfa|Facebook|Opna valmynd|hamburger|Menu|Veðurgögn frá Veðurstofu" app\auth-mvp\vedrid components\weather lib\__tests__ messages\is.json messages\en.json`
- targeted `Select-String` / `Get-Content` reads of:
  - `components/weather/travelAuditMap.helpers.ts`
  - `components/weather/DepartureHeatmap.tsx`
  - `components/weather/TravelAuditMap.tsx`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `lib/__tests__/travelAuditMap.helpers.test.ts`
  - `messages/is.json`
  - `messages/en.json`
- `git status --short`
- `Get-Date -Format 'yyyy-MM-dd HHmm'`

Codex did not run tests. No app code was changed. This file is a handoff/review document only.

## Remaining uncertainty

- The correct app menu component/pattern should be confirmed before implementation. `components/teskeid/TeskeidMenu` appears to exist and likely should be reused if it fits the weather route.
- If product/legal wants a different attribution phrase, prefer official met.no/MET Norway wording over unverified Veðurstofa Íslands wording.
- The active-candidate forecast-time limitation should stay visible in Claude's next handoff if it is not fully implemented.
