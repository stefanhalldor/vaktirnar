# TODO-067 v168 - Claude Code review of v166 - clarifying questions before implementation

Created: 2026-07-08 06:12
Timezone: Atlantic/Reykjavik
From: Claude Code
To: Stebbi
Status: Waiting for answers. No code changed.

## Context

Stebbi asked to review v166 (`2026-07-08-0532-todo-067-v166-codex-weather-point-detail-card-language.md`) in one round before implementing, to prevent misunderstandings.

The handoff is a large UI/content pass covering 13 items. This document captures what is clear, what is ambiguous, and proposes a sequencing.

## What is clear and ready to implement

These items are straightforward and have no open questions:

| Item | Description |
|------|-------------|
| 2 | Scrubber shows green by default: change `new Set(['graent'])` to `new Set()` |
| 3 | No negative threshold deltas: hide `aboveThresholdWithExcess` when `value <= thresholdValue` |
| 7 | Keep `Punktur x/y` in all lower cards: translation/copy change |
| 8 | Consistent info order on all lower cards: reorder fields |
| 13 | `frá leiðinni` → `frá veginum` in translation keys and usage |

## Open questions - need Stebbi's answers

### A. Does the return-leg scrubber also move above the map?

The outbound scrubber is currently the `belowMap` prop inside `TravelAuditMap`. The return scrubber is a separate `<div>` after `TravelAuditMap`.

v166 says to put the combined card above the map. Does this apply to:
- Outbound only, and the return scrubber stays where it is?
- Both outbound and return?

### B. Independent map-visibility controls: two separate state objects?

Currently `mapHiddenStatuses = outboundHiddenStatuses` (same state, so scrubber filters and map filters are coupled).

v166 asks for independent controls. My plan would be:
- Keep `outboundHiddenStatuses` for the departure scrubber
- Add a new `mapOutboundHiddenStatuses` (separate state, default empty = show all) for the map pills

Both default to empty (show everything), so on first load they behave identically. They only diverge when the user explicitly changes one.

Is this the right model, or should the map visibility be a different concept entirely?

### C. "Næstu X daga" - where does X come from?

v166 says do not hardcode 9 days, use the actual forecast horizon from the candidate data.

Is this correct: `X = Math.round((last candidate departureIso - first candidate departureIso) / ms_per_day)`?

Or is there a `coverageDays` field somewhere on `travelPlan` / `outbound` that I should use instead?

If the fraction is awkward (e.g. 7.3 days), should we round to whole days or fall back to `á skoðuðu tímabili`?

### D. Lower detail panel (items 6, 9, 10) - same commit or separate?

Items 6, 9 and 10 require reading and editing `TravelAuditMap.tsx` and `travelAuditMap.helpers.ts`, which are large files I have not read in this session. The changes include:

- Two-mode panel (default worst/most-relevant vs. manual selection)
- `Brottfarartími` and `Áætlað á leið` explicit in default panel
- Auto-detect whether the default point is a real worst or a fallback, and adjust title accordingly

This is a meaningful chunk of logic that could go wrong if rushed. My recommendation is to do this in a separate commit after the simpler items above are verified on localhost.

Is that OK, or does Stebbi want all 13 items in one release?

## Proposed sequencing

### Commit 1 - straightforward items (ready now)

- Item 2: scrubber shows green by default
- Item 3: no negative threshold deltas
- Item 7: `Punktur x/y` preserved (already true; confirm or adjust wording)
- Item 8: consistent info order
- Item 13: `frá leiðinni` → `frá veginum`
- Items 12 (new translation keys needed for items above)

### Commit 2 - combined card above map (after Stebbi answers A, C)

- Item 1: move scrubber above map into combined card with coverage line
- Item 4: selected departure updates whole result screen (result copy + arrival time)
- Remove `næstu 48 klst.` phrasing from result copy

### Commit 3 - independent map controls + lower panel (after Stebbi answers B, D)

- Item 5: independent map-point visibility pills
- Items 6, 9, 10: lower detail panel two-mode logic, departure time in panel

## Current code state

Last commit: `c1dab54` (feat: wizard nav context, result loader, threshold tiers, UI polish). Working tree is clean.

No code has been changed for v166.
