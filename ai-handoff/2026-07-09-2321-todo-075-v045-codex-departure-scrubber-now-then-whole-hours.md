Created: 2026-07-09 23:21
Timezone: Atlantic/Reykjavik

# TODO 075 v045 - Departure Scrubber: Now, Then Whole Hours

## Context

Stebbi asked whether the weather departure scrubber should start with the current departure time and then move to whole clock hours. Product reasoning: people usually think "I could leave now, or at 00:00, 01:00, 02:00..." rather than "I could leave at 23:37, 00:37, 01:37...".

Yes, this is a good UX change. The scrubber is a list of choices, not a literal proportional time scale.

## Goal

In the single-departure weather result scrubber:

1. The first candidate remains the exact current/requested departure time.
2. The first visible slot should be clearly labeled as "Núna" when it represents the implicit current departure.
3. Every following candidate should be aligned to whole clock hours strictly after the first candidate.
4. Example if the current departure is `2026-07-09T23:37:00Z`:
   - `Núna · 23:37`
   - `00`
   - `1`
   - `2`
5. Example if the current departure is exactly `23:00`:
   - `Núna · 23:00`
   - `00`
   - `1`
   - No duplicate `23:00`.

Keep the existing behavior where the first slot is selected by default and drives the map, "Á leiðinni", destination weather, and details.

The visible scrubber labels should be compact because the selected detail area directly below always explains the chosen departure in full `hh:mm` format. For whole-hour slots, prefer:

- `00` for midnight
- `1` for `01:00`
- `2` for `02:00`
- `17` for `17:00`

Keep full time semantics in accessibility labels and selected-slot detail text.

## Current Code Pointers

- `lib/weather/travel.ts:502` has `buildSingleDepartureTimeline(...)`.
- `lib/weather/travel.ts:525-530` currently starts at `startMs` and then adds `NEXT_CAUTION_STEP_S` each time. That means it is hourly, but anchored to the current minute (`23:37`, `00:37`, `01:37`).
- `lib/weather/travel.ts:11` has `CANDIDATE_INTERVAL_S = 30 * 60`, but that belongs to candidate/window scanning, not this exact timeline change.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:472-475` uses `timelineCandidates` for the outbound scrubber in single-departure mode.
- `components/weather/DepartureHeatmap.tsx:176` renders sticky day labels.
- `components/weather/DepartureHeatmap.tsx:189` builds the slot aria label.
- `components/weather/DepartureHeatmap.tsx:198` renders the visible slot time.

## Implementation Plan

1. Change only the single-departure timeline generation, ideally inside or near `buildSingleDepartureTimeline(...)`.

2. Add a small helper that calculates the next whole UTC hour after a timestamp:

   ```ts
   function nextWholeUtcHourAfter(ms: number): number {
     const d = new Date(ms)
     d.setUTCMinutes(0, 0, 0)
     const rounded = d.getTime()
     return rounded <= ms ? rounded + 3_600_000 : rounded
   }
   ```

   Use UTC methods because the rest of this weather/time code works from ISO timestamps and Iceland has no DST. This avoids local-machine timezone surprises.

3. In `buildSingleDepartureTimeline(...)`, generate candidates like this:

   - Push the exact first departure (`startMs`) once.
   - Set `t = nextWholeUtcHourAfter(startMs)`.
   - Continue with `t += NEXT_CAUTION_STEP_S * 1000` until `endMs`.

   This preserves the first "leave now" evaluation, but makes every later choice a clean clock-hour departure.

4. Do not change `CANDIDATE_INTERVAL_S` unless there is a separate, explicit decision to change window-mode behavior.

5. Keep `nextCaution` derived from `timelineCandidates[i > 0]`. After this change the "next caution" scan naturally follows the same human-facing hourly choices.

6. Add display support for the first slot label:

   Recommended minimal approach:

   - Add optional props to `DepartureHeatmap`, for example:
     - `firstSlotLabel?: string`
     - `firstSlotAriaLabel?: string`
   - Pass `firstSlotLabel={t('weather.timelineNowLabel')}` only for the single-departure outbound scrubber in `FerdalagidClient`.
   - Do not pass it for return/window-mode scrubbers unless product explicitly wants that too.

   Avoid making every first slot say "Núna" globally, because `DepartureHeatmap` is reused for return candidates and window-mode candidates.

7. Add messages:

   - `messages/is.json`: `timelineNowLabel`: `Núna`
   - `messages/en.json`: `timelineNowLabel`: `Now`

8. Suggested visual treatment in the scrubber:

   - Keep fixed/stable slot dimensions.
   - First slot can show:
     - status dot
     - `Núna`
     - actual time below, e.g. `23:37`
   - Whole-hour slots after the first should use compact visible labels:
     - `00`, `1`, `2`, `17`
     - not `00:00`, `01:00`, `02:00`, `17:00`
   - Use `00` rather than `0` for midnight. It reads better and avoids looking unfinished.
   - If the first slot feels too tight on mobile, show only `Núna` visibly and include the exact time in the selected detail and aria label. Do not let the first slot become much wider than the others.
   - Aria labels must still use full time, e.g. `Brottför kl. 01:00`, even when the visible label is only `1`.

## Important Design Notes

Read and follow `Design.md`.

This is a mobile-first control. Verify at narrow widths around 360-390 px:

- no horizontal page overflow,
- no text overlap between `Núna`, the clock time, and sticky day labels,
- touch target remains usable,
- scrubber scroll behavior stays predictable,
- day labels remain visible inside the scrubber and transition cleanly across midnight.

This should feel like a compact app control, not a dense table.

## Do Not Do

- Do not change route calculation.
- Do not change weather scoring thresholds.
- Do not remove or change hviður/gust-related code in this task.
- Do not change the forecast drawer.
- Do not change `CANDIDATE_INTERVAL_S` globally just to solve this scrubber issue.
- Do not make window-mode, return-trip, or route-option candidates silently switch to whole-hour behavior unless Stebbi explicitly approves that broader change.

## Tests / Checks For Claude Code

Please add or update focused tests if there are existing tests around travel timeline candidate generation.

Recommended cases:

1. Start `23:37`:
   - first candidate `23:37`
   - second candidate `00:00`
   - third candidate `01:00`
   - no `00:37`.

2. Start exactly `23:00`:
   - first candidate `23:00`
   - next candidate is the next whole hour
   - no duplicate first hour.

3. Start `23:56`:
   - first candidate `23:56`
   - next candidate `00:00`
   - labels do not overlap on mobile.

4. Forecast coverage:
   - candidate generation still stops at the same usable forecast limit.

5. Visible compact labels:
   - whole-hour slot `01:00` renders as `1`
   - whole-hour slot `17:00` renders as `17`
   - midnight renders as `00`
   - selected detail and aria labels still use full `hh:mm`.

Commands to run:

- `npm run type-check`
- `npm run test:run` if tests are changed or added
- `npm run build` if the change touches shared weather types/components enough to justify a full build check

## Localhost Checks For Stebbi

Open `/auth-mvp/vedrid` on localhost and calculate a normal one-way route.

Test with no explicit future departure:

1. The first visible scrubber slot is selected by default.
2. First slot represents "now" and is labeled clearly as `Núna` plus the actual current time, or otherwise clearly communicates current departure.
3. Every later visible slot is on a whole hour, but compactly labeled, e.g. `00`, `1`, `2`, `17`.
4. There are no offset hourly slots like `00:37`, `01:37`, unless the first slot itself is the current `23:37`.
5. When a compact slot such as `1` is selected, the "Brottför" detail below still shows the full time, e.g. `kl. 01:00`.
6. Accessibility labels and any selected-slot summary still preserve full `hh:mm`.
7. Selecting later hourly slots updates:
   - map markers,
   - summary box,
   - "Á leiðinni",
   - destination weather,
   - "Allir spápunktarnir á leiðinni".
8. Scroll across midnight and confirm day labels remain inside the scrubber and do not disappear or overlap.
9. Test mobile width. Confirm the first slot label and compact hour labels do not make the scrubber jump or overflow.

If the UI supports explicit user-selected departure times, also test one future explicit departure:

- The first slot should not misleadingly say `Núna` if it is not actually now.
- If this case is unclear, stop and ask Stebbi whether the first explicit slot should be labeled `Valið` or just shown as the normal date/time.

No Supabase, auth, RLS, SQL, secrets, billing, deployment, or production data should be touched for this task.

## Open Question For Codex / Stebbi

Should the first slot label be strictly `Núna` only for implicit current departure, and plain time for explicit future departure?

Recommendation: yes. Use `Núna` only when the app is evaluating the immediate current departure. For an explicit future departure, show the normal time/date or a separate `Valið` label only if Stebbi wants that copy.
