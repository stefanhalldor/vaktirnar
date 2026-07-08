# TODO-067 v173 - Codex review of v172 prerelease

Created: 2026-07-08 06:57  
Updated: 2026-07-08 07:15  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Context: Review of `2026-07-08-0651-todo-067-v172-claude-v171-done-prerelease`

## Verdict

Closer, but not ready for prerelease signoff.

v172 appears to fix the two explicit v171 blockers:

- the old result summary card and the departure scrubber card are now one card
- the hardcoded 48h cap was removed from `buildSingleDepartureTimeline`

But there is one important product correctness issue left: selecting a different departure time does not appear to update the actual top-level result/status sentence. The card is structurally merged, but the meaning of the card is still partly tied to the original server result.

## Findings

### High - Combined card information architecture still needs to match Stebbi's intended layout

The combined card should not just merge old blocks mechanically. It needs to become the primary departure-time control and result summary.

Required layout/order:

1. Above the combined card, keep the route summary line, but include distance and duration in parentheses:
   - `Garðabær → Egilsstaðir (636 km, 460 mín.)`
   - Remove this route/distance/duration text from `Af hverju?`, because `Af hverju?` should no longer be needed in this card.
2. Inside the combined card, put `Brottfarartíminn þinn í Teskeið` at the very top.
3. Put the departure scrubber directly below that title.
4. The first departure time in the scrubber should be selected by default. This makes it visually obvious that the scrubber is clickable/selectable.
5. When locale is Icelandic, day labels in the scrubber must be Icelandic, e.g. `Mið (8. júl)`, not `Wed, Jul 8`.
6. Directly below the scrubber, show the selected-slot detail box, but with calmer text:
   - `Brottför: kl. 08:54 · Komutími: kl. 16:35`
   - not bold long text with an arrow/dash like `Brottför: Sat, Jul 11 kl. 08:54 — Komutími...`
   - replace `Vindur: ...` as the lead with `Mest krefjandi á þessum brottfarartíma: ...`
7. Do not show the separate `Næst verður varasamt...` text paragraph. Users will learn this from the scrubber.
8. Put `Þetta er veðurmat, ekki umferðar- og farartrygging.` near the bottom of the combined card.
9. Remove `Af hverju?` from this combined card for now. After route summary, selected-slot detail, scrubber and disclaimer are present, the current `Af hverju?` content is duplicated/noisy.
10. Remove the dynamic sentence like `Ferðin frá kl. 06:54 lítur vel út veðurfarslega.`
11. Instead, use the colored status line as the dynamic result sentence. For example:
    - green: `Brottför kl. 06:54 lítur vel út`
    - yellow: `Brottför kl. 08:54 er óþægileg`
    - red: `Ekki mælt með brottför kl. 08:54`
12. This status sentence must update when the user selects another scrubber slot.

This is now the desired product shape for the combined card.

### High - Selected departure time does not update the top-level result/status

In `app/auth-mvp/vedrid/FerdalagidClient.tsx`, the combined card still renders:

- `status = result?.stada` at `:433`
- `statusStyle = STATUS_STYLES[status]` at `:434`
- status label from `status` at `:785-787`
- `result.svar` as the main result sentence at `:793`

But the selected departure candidate is separate:

- `activeOutboundCandidate` at `:480-482`
- selected candidate issue/status via `selectedHeatmapIdx` at `:465-477`

That means if Stebbi selects a later yellow/red departure in the scrubber, the card can still say the original green status and original `result.svar`, while the map/detail panel reflects the selected candidate. This breaks the intended product model:

> When the user chooses a departure time, the whole result screen is now about that departure time.

Required fix:

- Derive a display result from `activeOutboundCandidate`, not only from `result`.
- The top status dot/label should use:
  - selected outbound candidate status when `selectedHeatmapIdx !== null`
  - otherwise `result.stada`
- The main status sentence should also be derived from the active candidate:
  - green: `Brottför kl. HH:MM lítur vel út`
  - yellow: `Brottför kl. HH:MM er óþægileg`
  - red: `Ekki mælt með brottför kl. HH:MM`
- The departure and arrival time shown in the sentence must match `activeOutboundCandidate`.
- Prefer selecting the first scrubber slot by default so there is always a clear active candidate.
- Do not keep `result.svar` as a visible fallback in this combined card if it produces the old `Ferðin frá...` sentence.

Implementation note:

- Avoid asking AI for this. This should be deterministic text derived from `TravelCandidate`, `status`, `reasonCode`, `worstWind`, `worstGust`, `worstPrecip`, and thresholds.
- Keep all user-facing copy in `messages/is.json` and `messages/en.json`.

### Medium - Filter pill semantics should be “show selected statuses”, not “hide selected statuses”

The current scrubber and map filters are internally modelled as `hiddenStatuses`. That leads to backwards-feeling UX:

- when no pill is active and the user clicks `Óþægilegt`, the user expects to show uncomfortable slots/points
- current behavior tends to mean "hide uncomfortable"

Required fix:

- Treat filter pills as visible-status selectors in the UI.
- Default state:
  - scrubber: show all statuses
  - map: show all statuses
- If user clicks `Óþægilegt`, show only uncomfortable/yellow items.
- If user then clicks `Hættulegt`, show yellow + red items.
- If no explicit pill state is active, show all.
- The implementation may still store hidden statuses internally if Claude Code wants, but the user-facing behavior must be "selected pill = shown".

### Medium - Map “visibility” filter still only de-emphasizes markers

`TravelAuditMap` now has separate map visibility pills, which is the right direction. But `components/weather/TravelAuditMap.tsx:331-343` only sets filtered markers to opacity `0.2`.

That means filtered-out statuses still remain visible on the map. This does not match Stebbi's previous UX request that map point visibility should be independently controllable, especially after the earlier complaint that the map was still unreadable because all green points stayed visible.

Required fix:

- For hidden statuses, actually hide non-endpoint route markers and forecast markers.
- Keep origin/destination markers visible.
- For `google.maps.Marker`, use `marker.setVisible(false)` / `true`, or remove/re-add from map if needed.
- Time chips for hidden points should also not render.
- The pill counts can still count all points, not only visible points.

If Claude Code intentionally wants de-emphasis rather than hiding, that needs explicit Stebbi approval because it contradicts the “sýnileiki punktanna” direction.

### Medium - `Af hverju?` should be removed from the combined card for this iteration

The latest product direction is simpler than v172:

- remove `Af hverju?` from the combined card
- move route distance/duration to the route summary above the card
- keep `Þetta er veðurmat, ekki umferðar- og farartrygging.` at the bottom of the combined card
- use the selected-slot detail box for the weather reason

If Claude Code keeps any inline issue detail, avoid rendering it as a nested bordered card. The current `IssueAuditCard` can still render:

- `IssueAuditCard` at `app/auth-mvp/vedrid/FerdalagidClient.tsx:917`
- `IssueAuditCard` itself is a bordered nested card at `:1131`
- it still renders `aboveThresholdWithExcess` whenever `thresholdValue` and `value` exist, without checking `issue.value > issue.thresholdValue`, at `:1135-1138`

Required fix:

- Remove `Af hverju?` from this card unless Stebbi explicitly asks to bring it back.
- Remove `IssueAuditCard` from the combined card path.
- Only render `aboveThresholdWithExcess` if `issue.value > issue.thresholdValue`.

### Low - v172 handoff says `TravelAuditMap.tsx` was unchanged, but the working tree shows changes there

The handoff says:

> `TravelAuditMap.tsx`, `DepartureHeatmap.tsx`, `travelAuditMap.helpers.ts`: unchanged from v170.

The working tree diff includes changes in all three files. This may simply mean they were changed earlier and not in v172, but the statement is easy to misread during review.

Required fix:

- In future handoffs, distinguish between:
  - "unchanged in this v172 pass"
  - "present in the current uncommitted working tree"

## What Looks Good

- The old separate result card and separate scrubber card are no longer both rendered for outbound. The combined card is now structurally one card at `FerdalagidClient.tsx:777-924`.
- `NEXT_CAUTION_MAX_H` is gone from `lib/weather/travel.ts`.
- `endMs` is now `coverageCapMs`, so the timeline should use full returned forecast coverage.
- `nextCautionNone` no longer says `48 klst.`.
- New tests were added for timeline beyond 48h and caution beyond 48h.
- `Sýna allt` / `Allt` was removed from the scrubber filter, matching the newer direction.

## Required Next Step

Claude Code should do a small v174 fix pass before Stebbi spends more time testing this:

1. Reorder the combined card:
   - title first
   - scrubber immediately below title
   - selected-slot detail box below scrubber
   - dynamic status sentence with colored dot
   - coverage text
   - disclaimer at bottom
2. Make the first scrubber slot selected by default.
3. Make the combined card's status sentence reflect the selected departure slot:
   - `Brottför kl. HH:MM lítur vel út`
   - `Brottför kl. HH:MM er óþægileg`
   - `Ekki mælt með brottför kl. HH:MM`
4. Remove the old dynamic `Ferðin frá kl...` sentence from the combined card.
5. Remove the `Næst verður varasamt...` paragraph.
6. Remove `Af hverju?` from the combined card.
7. Move route distance/duration to the route summary above the card:
   - `Garðabær → Egilsstaðir (636 km, 460 mín.)`
8. Fix Icelandic scrubber day labels:
   - `Mið (8. júl)`, not `Wed, Jul 8`
9. Change scrubber and map filter semantics so selected pills mean "show this status", not "hide this status".
10. Make map filter pills actually hide filtered map points, not only fade them.
11. Guard threshold delta rendering everywhere so negative `yfir mörkum` text cannot appear.

Do not touch SQL, Supabase, RLS, auth, env, production data, deployment, or migration files.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost.

Use a route with mixed slots, for example a long route such as Garðabær -> Egilsstaðir, or any route where the scrubber shows both green and yellow/red slots.

1. Confirm the card structure:
   - Expected: exactly one main combined card above the map.
   - Expected: no separate old summary card above it.
   - Expected: no separate old `Brottfarartíminn` scrubber card below it.
   - Expected: title `Brottfarartíminn þinn í Teskeið` is the first thing inside the card.
   - Expected: scrubber is directly below the title.
   - Expected: `Af hverju?` is not shown in the combined card.

2. Confirm selected departure changes the result:
   - Expected: the first scrubber time is selected by default.
   - Select a green slot.
   - Select a yellow or red slot.
   - Expected: the status dot/label changes with the selected slot.
   - Expected: the main status sentence changes with the selected slot:
     - green: `Brottför kl. HH:MM lítur vel út`
     - yellow: `Brottför kl. HH:MM er óþægileg`
     - red: `Ekki mælt með brottför kl. HH:MM`
   - Expected: departure and arrival time in the sentence/card match the selected slot.
   - Expected: the map and lower point detail panel match the same selected slot.
   - Expected: the old `Ferðin frá kl...` sentence is gone.

3. Confirm no 48h wording:
   - Expected: no `48 klst.` appears anywhere in the result UI.
   - Expected: coverage text says a concrete end date, e.g. `fram til föstudagsins 17. júlí`.

4. Confirm route summary:
   - Expected: route line above the combined card includes distance and duration:
     - e.g. `Garðabær → Egilsstaðir (636 km, 460 mín.)`
   - Expected: this same route/distance/duration information is not duplicated inside `Af hverju?`.

5. Confirm Icelandic date labels:
   - Use Icelandic locale.
   - Expected: scrubber day labels are Icelandic, e.g. `Mið (8. júl)`.
   - Expected: no `Wed, Jul 8` appears in Icelandic UI.

6. Confirm scrubber selected-slot box:
   - Click a scrubber time.
   - Expected: detail box says `Brottför: kl. HH:MM · Komutími: kl. HH:MM`.
   - Expected: detail box uses `Mest krefjandi á þessum brottfarartíma: ...`.
   - Expected: it does not use the old bold long date/arrow line.

7. Confirm filter semantics:
   - Start with no selected filter pill.
   - Expected: all slots/points show.
   - Click `Óþægilegt`.
   - Expected: only uncomfortable/yellow items show.
   - Click `Gott veður`.
   - Expected: good + uncomfortable items show.
   - Click selected pills again to return toward all/no explicit filtering.

8. Confirm map point visibility:
   - Use the map visibility pills under/near the map.
   - Select only yellow/uncomfortable.
   - Expected: green route-weather markers disappear from the map, except route endpoints if intentionally kept visible.
   - Expected: warning points remain visible and readable.

9. Confirm removed text:
   - Expected: `Næst verður varasamt...` paragraph is not shown.
   - Expected: `Þetta er veðurmat, ekki umferðar- og farartrygging.` appears near the bottom of the combined card.
   - Expected: no negative `yfir mörkum` text appears.

10. Mobile checks:
   - Test around 360 px and 390 px width.
   - Expected: no horizontal overflow.
   - Expected: scrubber scrolls horizontally.
   - Expected: the combined card remains readable and not overly nested.

## Commands Claude Code Should Run

At minimum after the fix pass:

```bash
npm run type-check
npm run test:run
```

Add or adjust a focused component/helper test if there is already a reasonable test seam for selected departure display state.

## Óvissa / þarf að staðfesta

I did not run the full test suite in this review. I relied on static review plus Claude Code's reported test results.

The selected-departure finding is based on the current client render path. If another layer mutates `result.svar` or `result.stada` when `selectedHeatmapIdx` changes, Claude Code should point to it explicitly, but I did not see such a path in `FerdalagidClient.tsx`.
