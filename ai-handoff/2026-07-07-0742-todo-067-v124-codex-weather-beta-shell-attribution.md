# todo-067 v124 - Codex handoff: weather beta banner, app menu, and attribution

Created: 2026-07-07 07:42  
Timezone: Atlantic/Reykjavik  
Relevant TODO: todo-067 - Veðrið / Ferðalagið

## Context

Claude Code is already working from v123. This v124 intentionally keeps the newest UI shell/communication items separate so Claude can finish v123 without racing a moving target.

Stebbi wants three additional UI-level changes for the weather flow:

1. Add a clear beta/test-version banner at the top of every weather screen.
2. Correct the weather data attribution from `Veðurstofa Íslands í gegnum met.no` to safer MET Norway / met.no wording.
3. Add the app menu/hamburger to the weather flow header.

This should be a follow-up after v123 unless Claude Code explicitly decides the changes are trivial and safe to include in the same pass.

## Requirements

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
- Use Teskeið design tokens.
- Avoid scary wording, but be clear that this is not a final safety authority.
- Include icon if there is an existing Lucide icon that fits, e.g. `Info`, `FlaskConical`, or `BadgeAlert`; do not use red.
- All user-facing text must be in `messages/is.json` and `messages/en.json`.
- Include the Facebook feedback link as a small secondary text link/button inside the banner or immediately under it.
- Link text should be short, e.g. `Senda ábendingu` / `Send feedback`.
- Open external Facebook link in a normal safe way:
  - `target="_blank"` if the app pattern allows it
  - `rel="noopener noreferrer"` for external links
- Do not require login or collect feedback inside Teskeið for this MVP.

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

For the beta banner, avoid a marketing/hero treatment. This is an operational notice inside an app flow.

## Suggested implementation order

1. Update message keys for:
   - beta banner title/body
   - attribution footer
   - menu aria label if missing
2. Add/render beta banner in the weather flow.
3. Replace attribution text.
4. Add standard app menu/hamburger to weather header.
5. Run type-check and relevant tests if touched files are covered.

Do not touch:

- Supabase
- SQL/migrations
- auth/RLS
- env variables
- Google/Mapbox billing/API keys
- deployment
- commit/push
- production

## Localhost checks for Stebbi

After Claude Code implements v124:

### Beta banner

1. Open `/auth-mvp/vedrid`.
2. Check each weather wizard step:
   - route
   - trailer
   - thresholds
   - result
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
- No new API calls, billing, auth, or Supabase behavior should be introduced by this UI shell change.

## Commands Codex ran

Read-only / handoff-only:

- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- `Get-ChildItem -File 'ai-handoff' | Where-Object { $_.Name -like '*todo-067-v124*' } | Select-Object Name,Length | Sort-Object Name`

Codex previously checked official met.no docs via browser for attribution:

- `https://api.met.no/doc/License`
- `https://api.met.no/doc/TermsOfService`
- `https://api.met.no/weatherapi/locationforecast/2.0/documentation`

No app code was changed. No tests were run.

## Óvissa / þarf að staðfesta

- The exact app menu component/pattern should be confirmed in the codebase before implementation.
- If product/legal wants a different attribution phrase, prefer the official met.no/MET Norway wording over unverified Veðurstofa Íslands wording.
- If the banner feels too repetitive after multiple steps, keep it visible but compact rather than removing it from later screens.
