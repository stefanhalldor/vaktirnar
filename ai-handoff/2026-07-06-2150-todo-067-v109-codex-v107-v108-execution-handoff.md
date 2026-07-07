# todo-067 v109 - Codex execution handoff: v107 follow-up + v108 merge

Created: 2026-07-06 21:50  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Relevant TODO: todo-067 weather / Ferðalagið  
Inputs reviewed:

- `2026-07-06-2143-todo-067-v107-claude-v106-done.md`
- `2026-07-06-2144-todo-067-v108-codex-v107-cross-day-green-filter-review.md`
- Current code in `TravelAuditMap.tsx`, `DepartureHeatmap.tsx`, `FerdalagidClient.tsx`, `lib/weather/travel.ts`

## Findings

### P1 - Cross-day best departure windows are still rendered as time-only

v107 fixed scrubber placement, but the result text and badges can still show a best window like:

```text
Besti brottfararglugginn virðist vera kl. 21:39-16:39.
Besti brottfarargluggi: kl. 21:39-16:39
```

That is misleading when the window crosses midnight or multiple days. It reads like a same-day range where the end time is earlier than the start time.

Current code references:

- `lib/weather/travel.ts:619-626` builds `bestWindowNote` and `svar` with `formatUtcTime(...)` only.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:416-427` renders outbound and return best-window badges with `utcHHMM(...)` only.
- `components/weather/DepartureHeatmap.tsx:152-156` already shows date separators, so the timeline can imply the correct date while the summary text remains ambiguous.

Required behavior:

- Same Icelandic/UTC date: compact range is fine, e.g. `kl. 21:39-23:39`.
- Different dates: include date/day on both ends, e.g. `mán. 6. júl. kl. 21:39 - þri. 7. júl. kl. 16:39`.
- Apply this to:
  - main server `svar`
  - outbound `bestWindowLabel`
  - return `returnWindowLabel`
  - any future `TravelWindow.fromIso/toIso` display.

Implementation guidance:

- Add a small date-aware formatter rather than duplicating ad hoc JSX formatting.
- Use the same date-boundary rule in server and client code.
- Iceland has no DST, and the existing code is using UTC for these timestamps, so keep the current UTC/Iceland convention consistent unless there is already a better project helper.
- Keep translatable user text in `messages/is.json` and `messages/en.json` where text belongs.

Minimum acceptable implementation for this pass: `svar`, outbound badge and return badge no longer show cross-day windows as time-only.

### P2 - Green slots should be hidden by default in the adjustable time filter

Stebbi's product decision:

> Flestum er basically sama um það þegar hluturinn er grænn. Það er meira fyrir sanity-checkið. Við ættum því bara að fela grænu by default í stillanlega filternum en leyfa notandanum að haka það inn aftur.

Current code references:

- `components/weather/DepartureHeatmap.tsx:64` initializes `hiddenStatuses` with `new Set()`.
- `components/weather/DepartureHeatmap.tsx:67` resets filters to `new Set()` when candidates change.
- `components/weather/DepartureHeatmap.tsx:75-82` therefore shows green slots by default.

Required behavior:

- Initialize hidden statuses with `graent`.
- Reset to that same default when a new result/candidate list arrives.
- Still show the green chip with count, e.g. `Gott veður (80)`, but visually mark it as hidden/off.
- User can tap `Gott veður (n)` to show green slots again.
- `Allt` should clear all hidden statuses and show every slot.
- If all slots are green and green is hidden, the scrubber must not look missing or broken. Show a deliberate empty state, for example:

```text
Engin varúðargildi sjást á þessum tímaás.
Hakaðu í Gott veður eða veldu Allt til að sjá grænu tímana.
```

Important detail:

- Do not keep showing a selected green slot detail card while `graent` is hidden. If the selected slot is filtered out, clear selection or move selection to the first visible slot.
- This is about the time scrubber/filter. Do not expand into a full map-marker filtering redesign in this pass.

### P2 - Timeline day labels must follow the active UI language

Stebbi's screenshot showed day labels like `Mon, Jul 6` / `Tue` in an Icelandic UI.

Current code reference:

- `components/weather/DepartureHeatmap.tsx:13-16` formats day labels using `toLocaleDateString(locale, ...)`.
- `components/weather/DepartureHeatmap.tsx:61-63` gets `locale` from `useLocale()`.

Required behavior:

- Icelandic UI should show Icelandic day/month labels, e.g. `mán. 6. júl.` or equivalent short Icelandic form.
- English UI can show English labels.
- If `useLocale()` gives a short app locale such as `is`, normalize explicitly to an Intl-safe locale such as `is-IS`; likewise `en` -> `en-US`.
- Apply the same normalization anywhere in this weather UI that formats a date label with `toLocaleDateString`, including next-caution date formatting in `FerdalagidClient.tsx:453-459`.

### P3 - v107 scrubber placement itself looks acceptable; do not rework it

v107 moved the scrubber into `TravelAuditMap` via `belowMap`.

Current code references:

- `components/weather/TravelAuditMap.tsx:36-37` defines `belowMap?: ReactNode`.
- `components/weather/TravelAuditMap.tsx:299-323` renders map, then `{belowMap}`, then point details.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:517-540` passes outbound `DepartureHeatmap` as `belowMap`.

This solves the previous "scrubber is below the point detail panel" problem. Keep this structure unless a new manual test proves it still fails.

## Execution plan for Claude Code

1. Keep the v107 `belowMap`/scrubber placement.
2. Add a shared or near-shared helper for date-aware time-window labels.
3. Use that helper in `lib/weather/travel.ts` for window-mode `svar` and `bestWindowNote`.
4. Use the same date-aware behavior in `FerdalagidClient.tsx` for outbound and return best-window badges.
5. Normalize date-label locale in `DepartureHeatmap.tsx` and any matching date formatting in `FerdalagidClient.tsx`.
6. Change `DepartureHeatmap` default filter state so `graent` is hidden by default and resets that way on new candidates.
7. Add/update messages for the intentional "only hidden green slots" empty state if the current `timelineEmptyFilter` copy is not clear enough.
8. Add focused tests where practical:
   - same-day range stays compact
   - cross-day range includes date/day on both ends
   - default heatmap filter hides `graent`
   - selecting a hidden slot does not leave stale detail visible
9. Run `npm run type-check`.
10. Run `npm run test:run`.

## Files likely touched

- `lib/weather/travel.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`
- Relevant tests under `lib/__tests__/` or existing component test area

No Supabase, auth, RLS, SQL migration, billing, production, deployment, secrets or user-data changes are expected.

## Localhost checks for Stebbi

After Claude Code implements this, Stebbi should hard-refresh localhost and test `/auth-mvp/vedrid`.

1. Test long route with a latest-arrival window:
   - Example: `Garðabær -> Akureyri`.
   - Choose a latest-arrival time that makes the best departure window cross midnight.
   - Expected: result text and `Besti brottfarargluggi` show date/day on both ends, not only `kl. HH:mm-HH:mm`.

2. Test same-day best window:
   - Choose a route/window where best departure is same-day.
   - Expected: compact `kl. HH:mm-HH:mm` format still looks clean.

3. Test timeline day language:
   - In Icelandic UI, day separators should be Icelandic, not `Mon`, `Tue`, `Jul`.

4. Test default filter:
   - Expected: green slots are hidden by default.
   - Expected: `Gott veður (n)` chip is visible and appears off/hidden.
   - Expected: yellow/red/no-data slots still show by default if they exist.

5. Test all-green route:
   - Expected: scrubber area does not look broken.
   - Expected: it explains that no warning values are visible and lets Stebbi show green slots via `Gott veður` or `Allt`.

6. Test interaction:
   - Toggle `Gott veður` on.
   - Expected: green slots appear.
   - Toggle it off again.
   - Expected: green slot detail does not remain visible as stale selected state.

7. Regression check:
   - Map remains above scrubber.
   - Point detail remains below scrubber.
   - Tapping a warning time still updates map marker coloring and the detail card.

## Óvissa / þarf að staðfesta

- Codex did not run tests for this v109 handoff because it is a planning/review artifact only.
- The exact best location for a shared date-range helper depends on current project preferences. Keep it small and local if no established weather display-helper module exists.
