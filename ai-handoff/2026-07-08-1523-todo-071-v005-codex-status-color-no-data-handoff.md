# TODO-071 v005 - Codex handoff - status colors and no-data wording

Created: 2026-07-08 15:23
Timezone: Atlantic/Reykjavik
Author: Codex
Relevant TODO: #71 - Veður: allir spápunktar og fjarlægð frá vegi
Status: Ready for Claude Code implementation. Codex changed only this handoff file.

## Context

Stebbi tested the latest Ferðaveður UI after TODO-071 v004. v004 appears to have moved the all-points rows closer to the full detail-card format, but two product/UI issues remain:

1. `Engin gögn` appears too prominently in the selected departure summary, even though the expanded `Allir spápunktarnir á leiðinni` list appears to show weather data for the route points.
2. The long all-points list is visually hard to scan because all point cards look similar.

Stebbi's request:

- In `Allir spápunktarnir á leiðinni`, color the point cards using the same status colors as the pills/timeline: green, yellow/orange, red and gray.
- Use gray only for genuinely missing data.
- Make it easier to read through the long point list.

This should be treated as a follow-up to v004, not as a route-provider or weather-algorithm rewrite.

## Current baseline from v004

Claude Code v004 changed:

- `components/weather/travelAuditMap.helpers.ts`
- `components/weather/TravelAuditMap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

v004 status:

- `npm run type-check` passed.
- `npm run test:run` passed.
- `RoutePointRow` now shows ETA, forecast distance, forecast time and weather values.

Do not undo v004. Build on it.

## Main finding / risk

### Medium - `Engin gögn` may be coming from a coarser status than the point rows

The screenshot suggests that the selected departure slot/top summary can show `Engin gögn` while individual route points still render wind, precipitation, temperature and forecast time. That could mean one of several things:

- the aggregate departure slot is classified as no-data when only one required aggregate field is missing;
- the all-points rows are rendering partial data, while the departure summary requires a stricter complete dataset;
- `RoutePointRow` is not using the same status source as the heatmap/pills;
- the UI copy says `Engin gögn` for an ambiguous state that is really "insufficient data for this summary".

Claude Code should verify this in code before changing labels. Do not simply hide `Engin gögn`; if data is truly missing, the user should still see that clearly.

## Scope

Implement a small UI/status polish pass:

1. Add status-aware visual styling to each `Punktur x/y` card under `Allir spápunktarnir á leiðinni`.
2. Reuse the same status/color mapping as the existing pills/timeline as much as possible.
3. Investigate and narrow `Engin gögn` so it is not shown for rows or summaries that actually have usable weather data.
4. Keep the full information order introduced in v004.

Do not change:

- Google/Mapbox/provider logic.
- route geometry selection.
- weather thresholds unless a clear existing status-mapping bug is found.
- SQL, RLS, auth, Supabase, saved places or admin analytics.
- the three links: `Skoða veðurspá`, `Opna á korti`, `Hrá met.no gögn`.

## Design guidance

Claude Code should read `Design.md` before implementation and mention the relevant parts in the handoff.

Relevant Design.md rules:

- mobile-first at 360-460 px;
- status colors must not be the only way status is communicated;
- cards should remain calm, compact and readable;
- avoid heavy decorative color blocks;
- no horizontal overflow;
- no card-in-card feeling.

Recommended visual treatment:

- keep the cards white or very lightly tinted;
- add a subtle left border, top border, badge, or soft background tint per status;
- use existing green/yellow/red/gray tokens/classes where nearby weather UI already defines them;
- keep text labels/badges so users do not need color vision to understand the status.

## Implementation notes

### 1. Find the canonical weather status mapping

Inspect the existing code that renders the top pills/timeline and selected departure status, likely in:

- `components/weather/DepartureHeatmap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/TravelAuditMap.tsx`
- weather status helpers under `lib/weather/*` if present

Use the existing status categories and color classes if they exist. Avoid creating a parallel enum or a second color vocabulary unless there is no reusable mapping.

Expected status meanings:

- good: green
- caution/uncomfortable: yellow or orange
- severe/bad/danger: red
- no-data/unknown: gray

Use the actual codebase names if they differ.

### 2. Style `RoutePointRow` cards by status

In `app/auth-mvp/vedrid/FerdalagidClient.tsx`, update `RoutePointRow` so each row/card receives a status-derived class.

Preferred behavior:

- If the point/window has a clear existing status, use it.
- If status is missing but the row has usable wind/precip/temp/forecast data, do not style it as no-data by default. Either derive status with the same helper used elsewhere or show a neutral "has data" fallback while preserving the existing text values.
- If there is genuinely no usable forecast data for that point, use gray.

Keep the row content from v004:

1. `Punktur x/y` and existing status/badges
2. distance from origin
3. ETA when available
4. forecast point distance from road
5. forecast time
6. wind / precipitation / temperature
7. links

### 3. Audit `Engin gögn`

Search for `Engin gögn`, no-data translation keys and no-data status mapping.

Questions to answer in the Claude handoff:

- Which component is producing `Engin gögn` in the selected departure box?
- What exact data is missing when that text appears?
- Do the route points in that same departure window have usable forecast data?
- Is the no-data label technically correct, or is it an over-strict aggregate classification?

Possible safe outcomes:

- If no-data is technically wrong: fix the status calculation/mapping so the summary uses the correct status.
- If no-data is technically true only for the aggregate but point data exists: change copy to be more precise, for example `Ófull gögn fyrir samantekt` if Stebbi approves wording. Prefer not to add new copy unless needed.
- If no-data is only appearing in point rows without data: keep it and style those cards gray.

Do not remove no-data states entirely.

### 4. Messages

If new visible text is added or existing visible text changes, update both:

- `messages/is.json`
- `messages/en.json`

If only classes/styles change and existing labels are reused, message changes may not be needed.

## Files to inspect

- `Design.md`
- `TODO.md`
- `ai-handoff/2026-07-08-1500-todo-071-v004-claude-v003-numeric-distance-routepointrow.md`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `messages/is.json`
- `messages/en.json`
- relevant `lib/weather/*` status or assessment helpers

## Tests / verification

Run:

```bash
npm run type-check
npm run test:run
```

If a focused test already covers status mapping or route point rows, update/add it. Do not create broad brittle snapshot tests for the whole page unless the project already uses that pattern.

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid`.
2. Calculate a route that produces a mix of statuses, ideally including `Gott veður`, `Óþægilegt` and `Engin gögn`.
3. Open `Allir spápunktarnir á leiðinni`.
4. Expected: each `Punktur x/y` card has a subtle status color matching the existing pills/timeline:
   - green for good,
   - yellow/orange for caution/uncomfortable,
   - red for bad/severe if present,
   - gray for genuinely no data.
5. Expected: color is not the only status signal. Text/badge/status remains readable.
6. Expected: cards with wind/precipitation/temperature/forecast time are not incorrectly presented as `Engin gögn`.
7. Expected: genuinely missing-data cards remain gray and clear.
8. Check the selected departure/top summary for the same route.
9. Expected: `Engin gögn` appears only if the summary genuinely lacks usable data, or the copy has been narrowed to describe the real state.
10. Test mobile widths 360, 390 and 460 px.
11. Expected: no horizontal overflow, no text overlap, no card-in-card feeling, and the long list is easier to scan.

No Supabase migration, production data, auth config, billing, secrets, commit, push or deploy is part of these localhost checks.

## Suggested Claude handoff after implementation

Claude Code should report:

- what caused the `Engin gögn` behavior;
- whether it was fixed in status logic, copy, or row styling only;
- the exact status-to-color mapping used;
- files changed;
- tests run and exit codes;
- any remaining ambiguity around aggregate no-data vs partial point data;
- localhost checks for Stebbi.

## Óvissa / þarf að staðfesta

Codex has not inspected the live post-v004 code path for the top `Engin gögn` summary in this handoff. The screenshot strongly suggests the state is over-broad, but Claude Code should verify the actual data shape before changing behavior.

Confidence: medium-high on the UI direction; medium on the root cause of `Engin gögn` until code is inspected.
