# TODO 086 v140 - Codex addendum: MVP summary, destination and threshold box

Created: 2026-07-14 07:40  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Context: Stebbi feedback after v138/v139 loop

## Stebbi Feedback

Stebbi says the current state is much better, but:

- Veðurstofan-only still does not show the worst point clearly enough.
- It is still not possible to select a Veðurstofan point/card as a first-class selected point.
- For MVP, always show the destination section in the summary and use MET/Yr data for that section for now.
- Remove the top provider disclaimer text:
  - "Veðurstofugögn eru í prófun. MET/Yr er áfram grunnspáin. Vegagerðin er ekki komin inn."
- Do not show the threshold line as quiet/background text.
- Put the threshold line in an attention box titled:
  - `Þín veðurmörk`
- Box content:
  - `Jafnvindur óþægilegur í 10 m/s og hættulegur í 15 m/s`

## Important Product Decision

This slightly changes the previous strict provider rule.

Provider toggles should still control the route assessment, map points, scrubber, worst route point, and "all route points" provider content.

But for MVP, the destination summary section is allowed to be a special MET/Yr-backed context section even when `met.no` is toggled off. It must not drive the route assessment. It should be clear that it is destination forecast context, not the active provider's route scoring.

Codex recommendation: label this subtly inside the destination section if needed, for example:

- `Áfangastaður`
- `Spá á áfangastað frá MET/Yr`

Do not reintroduce MET/Yr route points, MET/Yr worst route point, `Punktur X/72`, or `Yr` route links in Veðurstofan-only mode.

## Requested Scope For Claude Code

### 1. Always Show Destination Summary Section

Current code appears to gate the destination section on `showMetno && activeOutboundCandidate?.arrivalWeather`.

Change MVP behavior:

- Show the destination section whenever `activeOutboundCandidate?.arrivalWeather` exists, regardless of `showMetno`.
- Use existing MET/Yr destination forecast data for this section.
- Keep this as display/context only.
- Do not use this destination MET/Yr data to compute route severity, scrubber slots, worst route point, map markers, or Veðurstofan station state.

Guardrails:

- In Veðurstofan-only mode, destination section may show MET/Yr destination data.
- In Veðurstofan-only mode, route assessment must still be Veðurstofan-only.
- In no-provider mode, decide whether destination context should still show. Codex recommendation: do not show it when no providers are selected, because the UI says no weather assessment is active.

### 2. Remove Top Provider Disclaimer Text

Remove or stop rendering:

`vedurstofanLayerDisclaimer`

Current Icelandic copy:

`Veðurstofugögn eru í prófun. MET/Yr er áfram grunnspáin. Vegagerðin er ekki komin inn.`

This text was useful during early testing, but it now makes the result feel like internal implementation notes.

Keep provider labels/toggles, but remove this explanatory paragraph from the top of the result card.

### 3. Add Attention Box: "Þín veðurmörk"

Move the threshold summary into a visible attention/info box near the summary area, not as quiet background text.

Title:

`Þín veðurmörk`

Body:

Use existing `thresholdSummaryLine` if possible:

`Jafnvindur óþægilegur í {caution} m/s og hættulegur í {red} m/s`

For Stebbi's current example this should render:

`Jafnvindur óþægilegur í 10 m/s og hættulegur í 15 m/s`

Design guidance:

- Use a clear info/attention box, not a warning/error box.
- Keep it compact and mobile-friendly.
- This box should be visible enough that the user understands the result is based on their thresholds.
- Do not make it a large hero/card inside a card. It can be a small bordered/tinted panel in the result card.

Suggested placement:

- After provider toggles/no-provider message, before the scrubber and journey summary.
- If no providers are selected, showing threshold box is optional; Codex leans no, to keep no-provider state clean.

### 4. Worst Point And Selectable Veðurstofan Point Remain Open

Stebbi still wants:

- Veðurstofan-only mode to show the worst Veðurstofan point clearly in the summary.
- Ability to select a Veðurstofan station/point and see it as the selected point.

For MVP, if full clickable map/card selection is too large for this patch:

- Keep the current "worst station" summary, but make sure it is visible and reads like the worst point.
- Defer first-class clickable Veðurstofan selection to a follow-up, but document it clearly.

Codex recommendation for sequencing:

1. Do the small MVP text/summary patch now.
2. Then implement selectable provider points generically, because Vegagerðin will need the same selection model.

## Acceptance Criteria

### Veðurstofan-only

- Route scrubber/worst route assessment/map points are still Veðurstofan-driven.
- Destination section is visible if MET/Yr destination arrival data exists.
- Destination section does not imply it is part of Veðurstofan route scoring.
- No `Punktur X/72` or route `Yr` links appear as active route assessment.
- Top provider disclaimer is gone.
- Threshold box titled `Þín veðurmörk` is visible.

### MET/Yr-only

- Existing MET/Yr behavior still works.
- Destination section still appears as before.
- Threshold box appears and uses submitted thresholds.

### Both Providers

- MET/Yr remains baseline route assessment for now.
- Veðurstofan overlay/rows remain visible.
- Destination section appears.
- Threshold box appears.

### No Providers

- Provider toggles remain visible.
- No-provider message remains clear.
- No route assessment is shown.
- Avoid showing destination context unless Stebbi explicitly wants destination context in no-provider mode.

## Suggested Files To Touch

Likely:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`

Avoid:

- SQL
- Supabase
- cron
- Vercel
- migrations
- feature access
- unrelated files

## Suggested Tests / Checks

Run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

If there are existing component tests around `FerdalagidClient` or result rendering, add/update a focused assertion for:

- destination section visible when `showMetno=false` but `arrivalWeather` exists
- provider disclaimer not rendered
- threshold summary title/body rendered

If no such component test exists, do not create a large testing scaffold just for this patch unless it is easy and follows existing patterns.

## Localhost Checks For Stebbi

Preconditions:

- Stebbi runs localhost himself.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`.
- Veðurstofan product data has been warmed recently.
- No Supabase migration, cron run, deploy, push, or commit is part of these checks.

Open `/auth-mvp/vedrid` and test a route with both MET/Yr and Veðurstofan data.

1. Veðurstofan-only:
   - Turn `met.no` off and `Veðurstofan` on.
   - Expected: route map/scrubber/worst station are Veðurstofan-driven.
   - Expected: destination section still appears, using MET/Yr destination forecast context.
   - Expected: top provider disclaimer text is gone.
   - Expected: `Þín veðurmörk` box is visible with the correct wind thresholds.

2. MET/Yr-only:
   - Turn `met.no` on and `Veðurstofan` off.
   - Expected: old MET/Yr result remains intact.
   - Expected: destination section appears.
   - Expected: threshold box appears.

3. Both providers:
   - Turn both on.
   - Expected: destination section appears.
   - Expected: Veðurstofan markers/rows remain visible.
   - Expected: threshold box appears.

4. No providers:
   - Turn both off.
   - Expected: no-provider message remains.
   - Expected: toggles are still visible.
   - Expected: no route assessment is shown.

5. Mobile:
   - Test around 360 px, 390 px, and 460 px.
   - Expected: threshold box, provider toggles, map, and summary sections do not overflow or overlap.

## Notes For Codex Review After Claude Code

Codex should specifically check:

- Destination section is the only intentional MET/Yr exception in Veðurstofan-only mode.
- The threshold box uses submitted/effective thresholds, not hardcoded 10/15 unless those are the actual active thresholds.
- Removing `vedurstofanLayerDisclaimer` does not leave unused translation keys that trigger lint/type issues.
- Worst point and selected provider point remain correctly documented if not fully solved in this patch.

## Óvissa / þarf að staðfesta

- Stebbi's wording says "always show destination section"; Codex interprets that as "always show while at least one provider is active and destination MET/Yr data exists", not in the no-provider state.
- Full selectable Veðurstofan point behavior likely deserves a separate generic provider-selection patch, because Vegagerðin should reuse the same model.
