# 2026-07-06-0835-todo-067-v073-codex-combined-v072-followup

Created: 2026-07-06 08:35  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Scope: Combined follow-up handoff for TODO-067 Ferðalagið. This reviews Claude Code's `2026-07-06-0830-todo-067-v072-claude-v071-review.md` and merges in Codex/Stebbi's `2026-07-06-0829-todo-067-v072-codex-travel-precip-threshold-addendum.md`. No app code, SQL, env, commit, push, deploy, or production changes were made by Codex.

## Bottom line

Claude Code's v072 review is technically sound and should be executed, but it is incomplete without Stebbi's latest product correction:

> In Ferðalagið, light rain around `0.7 mm/klst` with calm wind must be green. It must not show `Varúð`, must not say `Mikil úrkoma`, and must not become the highlighted issue.

The next Claude Code pass should handle both sets of changes together in one small follow-up:

1. Correctness/audit fixes from Claude v072.
2. Travel-specific precipitation threshold and parsing fixes from Codex v072.

Do not implement route alternatives in this pass. Route alternatives are a later product phase.

## Design.md check

Codex read `Design.md` before writing this handoff. Relevant constraints for Claude Code:

- Mobile-first, app-like flow at 360, 390 and 460 px.
- Use quiet, practical UI. The trust/explainer text should be small and useful, not a big educational block.
- Do not put page sections inside floating cards or create nested cards.
- All user-facing text belongs in `messages/is.json` and `messages/en.json`.
- Status colors cannot be the only meaning. The result must explain what matters in text.
- Map/audit details must not cause horizontal overflow on mobile.

## Findings to fix

### P1 - Travel precipitation threshold is too sensitive

Current behavior makes almost any measurable rain a yellow warning because travel uses:

- `WEATHER_THRESHOLDS.dry.maxPrecipMmPerHour`
- current value: `0.1`

Observed problematic result:

- Route status: `Varúð`
- Reason: `Mikil úrkoma um kl. 17:00`
- Audit value: `Úrkoma: 0.7 mm/klst`
- Wind: around `2 m/s`

This should be green.

Required product rule for Ferðalagið:

- `precipitationMmPerHour <= 1.0` must not downgrade the trip by itself.
- `precipitationMmPerHour > 1.0` may downgrade to yellow.
- A higher value, recommended `>= 3.0`, may be called heavy precipitation if needed.
- `Mikil úrkoma` must not be used for `0.7 mm/klst`.
- Light rain may still appear in audit details, but should not dominate the main result.

Recommended implementation:

- Do not change `dry.maxPrecipMmPerHour` globally unless Claude Code has confirmed every consumer should change. Golf/grill may have different sensitivity.
- Add travel-specific thresholds in `lib/weather/thresholds.ts`, for example:
  - `travel.cautionPrecipMmPerHour = 1.0`
  - `travel.heavyPrecipMmPerHour = 3.0`
- Update `lib/weather/travel.ts` to use the travel threshold for driving/trailer precipitation classification.
- Keep status green when rain is `<= 1.0` and wind/gust thresholds are green.
- Only set precipitation as the reason when rain is `> 1.0`.
- Change generic precipitation reason copy from `Mikil úrkoma` to `Rigning á leiðinni`, unless the implementation adds a separate heavy-rain reason code.

### P1 - Forecast parser can overstate hourly rain when falling back to next_6_hours

Current parser behavior in `lib/weather/forecast.ts` stores:

- `next_1_hours.details.precipitation_amount`, or
- fallback `next_6_hours.details.precipitation_amount`

into `precipitationMmPerHour`.

Problem:

- `next_1_hours.precipitation_amount` is an hourly amount.
- `next_6_hours.precipitation_amount` is a 6-hour period amount.
- If `next_6_hours = 6.0`, storing that as `6.0 mm/klst` exaggerates intensity. It should be `1.0 mm/klst` if this field remains hourly.

Required fix:

- If using `next_1_hours`, keep the value as-is.
- If falling back to `next_6_hours`, divide by 6 before storing in `precipitationMmPerHour`.
- If Claude Code thinks this is semantically wrong, rename/add a separate period field instead, but do not silently store 6-hour totals as hourly intensity.

### P1 - Cross-leg highlighted issue tie-break can choose the wrong leg

Claude v072 confirmed this bug.

Current `buildHighlightedIssue()` chooses between outbound and return primarily by status and uses `>=`, which means return wins on equal status because return is appended after outbound.

Required behavior:

- Red beats yellow.
- On equal status, use metric severity via existing `candidateSeverity`.
- On a full tie, prefer outbound because it is the immediate leg and avoids surprising return-only dominance.

Example that must pass:

- Outbound: yellow due to strong wind.
- Return: yellow due to light/moderate rain.
- Highlighted issue should be outbound if severity is higher.

### P1 - Return-leg distance wording is misleading in audit card

Claude v072 confirmed this.

Problem:

- `IssueAuditCard` shows `distanceFromOriginM` as `km frá uppruna`.
- For return-leg issues, the user thinks in terms of "from destination / on the way home", not from the original departure point.

Recommended fix:

- Add to `TravelIssue`:
  - `distanceFromLegStartM?: number`
  - `legStartName?: string`
- In `checkTravelWeather`, after `highlightedIssue` is selected:
  - outbound: `distanceFromLegStartM = distanceFromOriginM`, `legStartName = originName`
  - return: `distanceFromLegStartM = totalDistanceM - distanceFromOriginM`, `legStartName = destinationName`
- In `IssueAuditCard`, render:
  - `{km} km frá {legStartName}`
- Replace `kmFromOrigin` with a more general message key such as `kmFrom`.

### P1/P2 - Deterministic-vs-AI explainer is still missing

Stebbi wants this visible in the UI because users will reasonably ask whether "AI" is guessing the decision.

Required product copy:

IS:

- `howAssessedShort`: `Reiknað úr veðurspá og leið, ekki giskað af gervigreind.`
- `howAssessedTitle`: `Hvernig er þetta metið?`
- `howAssessedBody`: `Veðurmatið er reiknað úr leiðinni, tímasetningu og veðurspá á punktum meðfram leiðinni. Gervigreind tekur ekki ákvörðunina sjálf. Hún má hjálpa okkur að orða niðurstöðuna, en vindur, hviður, úrkoma, tími og staðsetning ráða matinu.`

EN:

- `howAssessedShort`: `Calculated from the route, timing and weather forecast, not guessed by AI.`
- `howAssessedTitle`: `How is this assessed?`
- `howAssessedBody`: `The travel assessment is calculated from the route, timing and forecast values along the route. AI does not make the decision. It may help phrase the result, but wind, gusts, precipitation, time and location drive the assessment.`

UI guidance:

- Put the short line near the result, below or inside the result area.
- Add a small expandable row/button for the longer explanation.
- Keep it quiet and practical, not a large education panel.
- Use icon/chevron with accessible button text.

### P2 - Static Maps URL should be built structurally

Claude v072 confirmed current string concatenation is brittle.

Required fix:

- Build Static Maps URL with `URLSearchParams`.
- Append repeated `markers` values with `params.append`.
- Include `size`, `scale`, `key`, `path`, and markers.
- Unit test that required query params exist.

This is not a product redesign. It is hygiene around a URL that contains reserved characters like `|`, `:`, and `,`.

### P2 - External forecast link must open a human-readable forecast

Stebbi explicitly said "Skoða spágögn" is not helpful if it opens raw API JSON.

Required behavior:

- Primary forecast link should open a human-readable forecast page, preferably yr.no for the selected coordinates.
- Raw met.no JSON can remain as a secondary/debug link, clearly labeled as raw data.

Keep:

- `Skoða veðurspá` -> human-readable forecast page.
- `Hrá met.no gögn` -> raw API/debug data.

Claude Code should verify the human-readable URL on localhost. If the current yr.no URL pattern fails, use a safer yr.no search URL for coordinates as a fallback.

### P2 - Metric-aware tests are too weak

Claude v072 confirmed the existing test only asserts that `highlightedIssue` exists. That does not protect the bug.

Required test hardening:

- Assert `highlightedIssue.metric`.
- Assert selected point/lat/lon or route index.
- Assert `reasonCode`.
- Add cross-leg equal-status tests.

### P3 - Hardcoded `Hnit:` fallback must move to messages

In `FerdalagidClient.tsx`, fallback text uses hardcoded Icelandic:

- `Hnit: ...`

Required fix:

- Add `coordinatesLabel` to `messages/is.json` and `messages/en.json`.
- Use translation key in UI.

## Recommended implementation steps for Claude Code

### Step 1 - Thresholds

File: `lib/weather/thresholds.ts`

- Add travel-specific precipitation thresholds.
- Keep existing dry thresholds untouched unless a wider product decision is made.

Suggested shape:

```ts
travel: {
  cautionPrecipMmPerHour: 1.0,
  heavyPrecipMmPerHour: 3.0,
}
```

### Step 2 - Forecast parsing

File: `lib/weather/forecast.ts`

- Preserve `next_1_hours` precipitation as hourly.
- Divide `next_6_hours` precipitation by 6 when used as fallback for `precipitationMmPerHour`.
- Update/add tests in `lib/__tests__/weather-forecast.test.ts`.

Expected tests:

- `next_1_hours.precipitation_amount = 0.7` parses as `0.7`.
- `next_6_hours.precipitation_amount = 6.0` parses as `1.0` if stored in `precipitationMmPerHour`.

### Step 3 - Travel classification and reason text

File: `lib/weather/travel.ts`

- Use `WEATHER_THRESHOLDS.travel.cautionPrecipMmPerHour` for travel precipitation status.
- Keep calm `0.7 mm/klst` green.
- Use `Rigning á leiðinni` for normal precipitation warnings.
- Use `Mikil úrkoma` only if a separate heavy precipitation path is implemented and value is high enough, recommended `>= 3.0`.

Do not change wind/gust thresholds in this pass.

### Step 4 - Highlighted issue correctness

Files:

- `lib/weather/travel.ts`
- `lib/weather/types.ts`

Implement:

- Cross-leg tie-break using status, `candidateSeverity`, and outbound preference on full tie.
- `distanceFromLegStartM` and `legStartName` on `TravelIssue`.

### Step 5 - Audit map and links

Files:

- `lib/weather/travel.ts`
- possibly `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Implement:

- Static Maps URL with `URLSearchParams`.
- Human-readable forecast link as primary.
- Raw met.no link only as secondary/debug.

### Step 6 - UI copy and audit card

Files:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`

Implement:

- `kmFrom`
- `coordinatesLabel`
- `howAssessedShort`
- `howAssessedTitle`
- `howAssessedBody`
- Leg-aware distance text.
- Small deterministic/AI explainer.

Keep UI compact and mobile-first per `Design.md`.

### Step 7 - Tests

Files likely affected:

- `lib/__tests__/weather-travel.test.ts`
- `lib/__tests__/weather-forecast.test.ts`

Required test coverage:

1. Calm `0.7 mm/klst` rain returns green for Ferðalagið.
2. Calm `0.7 mm/klst` with trailer also stays green unless wind/gust thresholds fail.
3. `> 1.0 mm/klst` can return yellow with precipitation reason.
4. `0.7 mm/klst` does not produce `Mikil úrkoma`.
5. `next_6_hours` fallback divides by 6.
6. Cross-leg equal-status tie uses metric severity, not array order.
7. Return-leg issue has `distanceFromLegStartM` from destination.
8. Static Maps URL includes required params.

## Commands Claude Code should run

Run after implementation:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-forecast.test.ts
npm run test:run
npm run build
```

If any command fails, stop and include the exact failure in the next handoff.

## Explicit non-goals

- Do not implement route alternatives now.
- Do not add Google/Mapbox bakeoff UI.
- Do not change env variables.
- Do not change SQL, Supabase, RLS, auth, billing, production data, or deployments.
- Do not commit, push, or deploy.
- Do not start, stop, or restart Stebbi's dev server.
- Do not globally relax dry activity precipitation thresholds unless explicitly justified and approved.

## Localhost checks for Stebbi

After Claude Code implements this and Stebbi restarts localhost if needed:

1. Open `/auth-mvp/vedrid`.
2. Test the same route/time that produced `Úrkoma: 0.7 mm/klst` with calm wind.
3. Expected:
   - Status is green.
   - No `Varúð`.
   - No `Mikil úrkoma`.
   - No highlighted precipitation issue for `0.7 mm/klst`.
   - Audit details may still show `Úrkoma: 0.7 mm/klst`.
4. Test a scenario or fixture where precipitation is above `1.0 mm/klst`.
5. Expected:
   - Status can become yellow.
   - Wording says `Rigning á leiðinni` or similar.
   - Measured value is visible in details.
6. Test a wind-only route warning.
7. Expected:
   - Wind/gust warnings still work.
   - Highlighted issue is on the correct route point.
8. Test a route with return-time warning if possible.
9. Expected:
   - Return issue says distance from destination/on return leg, not `km frá uppruna`.
10. Open the audit section.
11. Expected:
   - Static map renders.
   - Blue route line, red worst-point marker, and destination marker are visible when data exists.
   - Forecast point shown in audit details matches the map marker closely enough to build trust.
12. Click `Skoða veðurspá`.
13. Expected:
   - Opens a human-readable forecast page, not raw JSON.
14. Click `Hrá met.no gögn`.
15. Expected:
   - Opens raw met.no data only as secondary/debug detail.
16. Open `Hvernig er þetta metið?`.
17. Expected:
   - It clearly says the assessment is calculated from route, time, forecast values and thresholds.
   - It clearly says AI does not make the decision.
18. Test mobile widths 360, 390 and 460 px.
19. Expected:
   - No horizontal overflow.
   - Map stays inside viewport.
   - Long Icelandic text wraps cleanly.
   - Links/buttons are tappable.

No production, env, Supabase, SQL, billing, commit, push, or deploy testing is part of this pass.

## Questions for Claude Code to answer in next handoff

1. Did any non-travel feature depend on the old `dry.maxPrecipMmPerHour = 0.1` behavior?
2. Was `next_6_hours` fallback divided by 6, or was another safer representation chosen?
3. Did the human-readable yr.no URL work on localhost?
4. Did the `0.7 mm/klst` calm route become green?
5. Did tests cover both outbound and return highlighted issue selection?

## Suggested single message for Stebbi to send Claude Code

Claude Code, framkvæmdu litla follow-up passann í `ai-handoff/2026-07-06-0835-todo-067-v073-codex-combined-v072-followup.md`.

Þetta sameinar tvö atriði:

1. V072 review frá Claude Code á v071 correctness/audit map.
2. V072 Codex/Stebbi úrkomu-fix: Ferðalagið má ekki flagga rólegri `0.7 mm/klst` rigningu sem `Varúð` eða `Mikil úrkoma`; úrkoma þarf að vera `> 1.0 mm/klst` til að verða vandamál í keyrslumati, nema vindur/hviður valdi sjálfstæðri viðvörun.

Ekki framkvæma route alternatives, ekki breyta SQL/Supabase/env, ekki commit-a, push-a eða deploya. Keyrðu type-check, targeted tests, full tests og build, og skilaðu handoff með niðurstöðu og localhost checks.
