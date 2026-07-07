# todo-067 v108 - Codex review: cross-day windows + green-default filter

Created: 2026-07-06 21:44  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Reviews: `2026-07-06-2143-todo-067-v107-claude-v106-done.md` + Stebbi screenshots/comments

## Findings

### P1 - Best departure window is misleading when it crosses midnight or multiple days

Current UI can show:

```text
Besti brottfararglugginn virðist vera kl. 21:39-16:39.
Besti brottfarargluggi: kl. 21:39-16:39
```

That reads like one same-day time range, but the screenshot shows the window crosses from Monday into Tuesday. This makes a correct deterministic result look wrong.

Relevant current places:

- `lib/weather/travel.ts` around the window-mode `svar`: formats `bestOutboundWindow.fromIso` and `toIso` with time only.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` around the best-window badge: formats outbound and return `bestWindow` with `utcHHMM(...)` only.
- `components/weather/DepartureHeatmap.tsx` already has date-aware slot labels, so the summary and badge now disagree with the timeline.

Required behavior:

- If `fromIso` and `toIso` are on the same Icelandic/UTC date: keep compact format, e.g. `kl. 21:39-23:39`.
- If the range crosses a date boundary: include date/day on both ends, e.g. `mán. 6. júl. kl. 21:39 - þri. 7. júl. kl. 16:39`.
- Apply the same logic to:
  - main `result.svar`
  - `bestWindowLabel`
  - `returnWindowLabel`
  - any future "best window" copy that uses `TravelWindow.fromIso/toIso`
- Do not hardcode this only in JSX. Add a shared date-aware formatter/helper or very small pair of helpers so the same rule is used everywhere.

Recommended implementation shape:

- Add a helper that can format a date-aware range:
  - input: `fromIso`, `toIso`, `locale`
  - output parts or final string
  - same-day: time-only range
  - cross-day: date + time on both endpoints
- For client/UI strings, keep user text in `messages/is.json` and `messages/en.json`.
- For server `lib/weather/travel.ts`, either:
  - use a deterministic Icelandic date-aware helper for the current `svar`, or
  - better, expose structured best-window copy parts and let the client render the final localized sentence.

Minimum acceptable for this phase: fix the misleading Icelandic `svar` and the two client badges.

### P2 - Timeline day labels must not switch to English inside Icelandic UI

The screenshot shows day separators like `Mon, Jul 6` / `Tue` while the rest of the UI is Icelandic. That is a trust papercut in a weather product.

Relevant current place:

- `components/weather/DepartureHeatmap.tsx`, `formatDayLabel(isoString, locale)`

Required behavior:

- In Icelandic UI, day labels should be Icelandic, e.g. `mán. 6. júl.` or equivalent short Icelandic form.
- In English UI, English labels are fine.
- If `useLocale()` is not reliably returning the message locale here, normalize explicitly (`is` -> `is-IS`, `en` -> `en-US`) or pass the intended locale down from the page.

### P2 - Green slots should be hidden by default in the adjustable filter

Stebbi's product rule:

> Flestum er basically sama um það þegar hluturinn er grænn. Það er meira fyrir sanity-checkið. Felum grænu by default í stillanlega filternum, en leyfum notandanum að haka það inn aftur til að fá confidence á að við séum að skoða allar veðurstöðvarnar á leiðinni.

Current behavior in `components/weather/DepartureHeatmap.tsx`:

- `hiddenStatuses` initializes as `new Set()`.
- On new candidates it resets to `new Set()`.
- Therefore all green slots are visible by default.

Required behavior:

- Default hidden status should include `graent`.
- Filter chips must still show counts, e.g. `Gott veður (80)`, `Varúð (3)`, `Ekki mælt (1)`, `Engin gögn (2)`.
- The green chip should visibly look off/hidden by default.
- User can tap `Gott veður (n)` to show green slots again.
- `Allt` should show everything and become active only when no statuses are hidden.
- If all slots are green and green is hidden by default, do not make the component look broken. Show a deliberate empty state such as:

```text
Engin varúðargildi á þessum tímaás.
Hakaðu í Gott veður til að sjá alla grænu punktana.
```

Implementation detail to avoid a subtle mismatch:

- If the currently selected slot becomes hidden by default or by a filter toggle, clear the selection or move it to the first visible non-green slot.
- Do not keep showing a green slot detail card while the green filter is visually off.

Clarification:

- This finding is specifically about the departure/return time scrubber/filter.
- If Claude also adds map-marker filtering later, keep it explicit and separate enough that users understand whether they are filtering time slots, route/weather points, or both.

## Suggested next step for Claude Code

Implement this as one small corrective pass after v107:

1. Add date-aware best-window formatting for summary text and badges.
2. Fix/normalize locale for heatmap day labels.
3. Make `graent` hidden by default in `DepartureHeatmap`, with a clear empty state and a way back to all green slots.
4. Add focused tests for the formatting and default-filter behavior if existing test setup makes this practical.

Do not expand scope into a full map-marker filtering redesign unless Stebbi explicitly asks for that as the next phase.

## Files likely touched

- `lib/weather/travel.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`
- Tests under `lib/__tests__/` or component tests if available

## Localhost checks for Stebbi

After Claude implements this, hard-refresh localhost and test:

1. Open `/auth-mvp/vedrid`.
2. Use a long route such as `Garðabær -> Akureyri`.
3. Set a latest-arrival window that creates a best departure window crossing midnight.
4. Expected: result text and `Besti brottfarargluggi` include date/day on both ends, not only `kl. HH:mm-HH:mm`.
5. Expected: timeline day separators are Icelandic in the Icelandic UI.
6. Expected: green slots are hidden by default in the filter.
7. Expected: `Gott veður (n)` is visible and can be toggled on to show green slots.
8. Expected: if the route has only green slots, the scrubber area shows an intentional "no warning values" style message, not a missing/blank/broken timeline.
9. Expected: tapping `Allt` restores all statuses.
10. Regression check: warning/red slots still appear by default and still update map/slot detail when tapped.

No Supabase, auth, RLS, billing, production, deployment, secrets or user-data changes should be needed for this pass.
