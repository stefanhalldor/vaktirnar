# TODO-067 v171 - Codex review of v170 prerelease: combined card + full forecast horizon

Created: 2026-07-08 06:44  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Context: Review of `2026-07-08-0638-todo-067-v170-claude-v169-done-prerelease`

## Verdict

Not ready for prerelease signoff.

The current UI still shows two separate boxes where Stebbi explicitly asked for one combined box, and the weather timeline is still capped at 48 hours even though the product decision is now to use all forecast values available from met.no.

## Findings

### High - The result is still two boxes, not one combined box

Current code still renders:

- the old top result summary card at `app/auth-mvp/vedrid/FerdalagidClient.tsx:777`
- a separate `Brottfarartíminn þinn í Teskeið` card at `app/auth-mvp/vedrid/FerdalagidClient.tsx:908`

This is exactly the split UI Stebbi rejected. The requested UX is one single card above the map, not a summary card plus a timeline card.

Required change:

- Replace the old result summary card and the separate departure timeline card with one single combined card.
- The single card must contain:
  - status dot + status label
  - the main result sentence, for the selected departure time
  - departure time and arrival time
  - active threshold summary, if shown
  - forecast coverage text, e.g. `Teskeið hefur metið brottfarartíma á klukkutíma fresti fram til föstudagsins 17. júlí.`
  - departure scrubber/timeline
  - the `Af hverju?` disclosure inside the same card
- The old separate top card must be removed.
- The old separate `Brottfarartíminn þinn í Teskeið` card wrapper must be removed.
- Do not create a card inside a card. If the disclosure needs visual grouping, use a divider or compact inner section, not another bordered card.

Design.md relevance:

- `Design.md` warns against cards inside cards and too many large cards.
- This correction moves toward a calmer mobile-first UI: one card, one mental model, less duplicated explanation.

### High - The 48 hour forecast cap is still hardcoded

Current code still has:

- `lib/weather/travel.ts:12`  
  `const NEXT_CAUTION_MAX_H = 48`
- `lib/weather/travel.ts:489-490`  
  `hardCapMs = startMs + NEXT_CAUTION_MAX_H...` and `endMs = Math.min(coverageCapMs, hardCapMs)`
- `lib/weather/travel.ts:463-465` and `lib/weather/travel.ts:644-646` still describe a `coverage/48h cap`
- `lib/weather/types.ts:187` still says `from departure to coverage/48h cap`
- `messages/is.json:694` still says `Engin varúð fannst á leiðinni næstu {hours} klst.`
- `messages/en.json:690` has the same assumption in English

This is why the UI still says `Engin varúð fannst á leiðinni næstu 48 klst.`

Required change:

- Remove `NEXT_CAUTION_MAX_H`.
- Do not cap the single-departure timeline at 48 hours.
- Use the full usable forecast horizon already returned in met.no `timeseries`.
- The natural end point is already mostly present in the code:
  - `lastForecastMs` = minimum last forecast hour across route points
  - `coverageCapMs = lastForecastMs - durationS * 1000`
  - `endMs` should be based on `coverageCapMs`, not `Math.min(coverageCapMs, hardCapMs)`.
- `timelineCandidates` and `nextCaution` should inspect the full generated horizon, not only 48 hours.
- Update comments/types so no `48h` language remains.

Important implementation guardrail:

- This does not mean making a separate met.no request for every hour.
- Fetch each route forecast point once, then reuse all returned `hours/timeseries` values across the full available horizon.
- If met.no changes resolution later in the forecast, keep the existing data-availability rules honest. Do not fake precision beyond available data.

### Medium - The `nextCautionNone` message is no longer the right primary summary

Once the scrubber is merged into the main card, a line like `Engin varúð fannst á leiðinni næstu 48 klst.` is both duplicated and too narrow.

Required change:

- Remove that sentence from the primary card, or replace it with horizon-aware wording only if it adds real value.
- Preferred: let the scrubber and coverage sentence carry this information.
- If still needed, use wording like:
  - `Engin varúð sést á skoðuðu tímabili.`
  - not `næstu 48 klst.`

### Medium - v170 handoff said “combined card”, but the localhost check did not prove it

The previous checks accepted the presence of the new card without checking that the old card was gone.

Required change:

- Add an explicit regression check: result screen must have one combined card above the map, not two cards.

## Implementation Plan For Claude Code

1. In `app/auth-mvp/vedrid/FerdalagidClient.tsx`, restructure the result screen so the current status/result block at `:777` and the departure timeline block at `:908` are merged into one component/block.
2. Put this merged block above `TravelAuditMap`.
3. Keep the map below it.
4. Keep the lower point detail panel below the map.
5. Remove the old separate wrapper around the top summary.
6. Remove the old separate wrapper around `DepartureHeatmap`.
7. In `lib/weather/travel.ts`, remove `NEXT_CAUTION_MAX_H` and the `hardCapMs` branch.
8. Build timeline candidates until the actual forecast coverage limit derived from returned met.no data.
9. Update `messages/is.json` and `messages/en.json` so no user-facing copy refers to `48 klst.` / `48 hours`.
10. Update comments in `lib/weather/travel.ts` and `lib/weather/types.ts` so future agents do not reintroduce the 48h assumption.
11. Add or update focused tests that verify:
    - timeline generation is not capped at 48h when forecast data extends beyond 48h
    - `nextCaution` can find a caution after 48h
    - green selected slots do not show negative threshold deltas
    - the result UI does not render the old separate summary/timeline split, if a component test exists for this screen

## Copy / Text Requirements

Use concrete date wording for coverage.

Good Icelandic examples:

- `Teskeið hefur metið brottfarartíma á klukkutíma fresti fram til föstudagsins 17. júlí.`
- `Brottför: kl. 06:40 · Komutími: kl. 14:20`

Avoid:

- `næstu 48 klst.`
- `næstu X daga` if X is guessed
- any negative threshold phrase like `-18,6 yfir mörkum`

## Localhost checks for Stebbi

Open `http://localhost:3004/auth-mvp/vedrid` or the active localhost port Stebbi is using.

Use a long route, for example:

1. `Frá`: Garðabær
2. `Til`: Egilsstaðir
3. Keep default thresholds.
4. Calculate the route.

Expected result:

- There is exactly one main white card above the map.
- The card title/content includes `Brottfarartíminn þinn í Teskeið`.
- The old separate top result card is gone.
- The old separate scrubber card is gone.
- The card includes status, result sentence, departure/arrival time, coverage text, the scrubber, and `Af hverju?`.
- No text says `48 klst.` or `48 hours`.
- The scrubber extends as far as the available forecast coverage allows, not just 48 hours.
- The map remains below the combined card.
- Selecting a new departure time updates the whole result screen consistently.
- On a green selected time, no negative `yfir mörkum` text is shown.

Also test a shorter route, for example Garðabær -> Akranes, to verify the compact/mobile layout still feels calm and does not create vertical clutter.

Mobile checks:

- Test around 360 px and 390 px width.
- No horizontal overflow.
- The combined card should not contain nested bordered cards that make the screen feel broken or cramped.
- The scrubber remains horizontally scrollable without shifting the layout.

Do not run SQL or touch production data for this change.

## Commands Claude Code Should Run

At minimum:

```bash
npm run type-check
npm run test:run
```

If there are focused weather tests, run those specifically too.

## Notes

This is not a styling nit. The split-card state makes the information architecture wrong: the user sees a “result” card and a separate “departure” card even though the product decision is that the selected departure time is the result context.

The 48h cap is also not just copy. It is a real logic cap in `lib/weather/travel.ts`, so fixing the text without removing the cap would still be incorrect.
