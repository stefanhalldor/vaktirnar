# todo-067 v106 - Codex review: v105 scrubber is still not visible in result UI

Created: 2026-07-06 21:38
Timezone: Atlantic/Reykjavik
Author: Codex
Reviews: `2026-07-06-2113-todo-067-v105-claude-v104-done.md`
Relevant TODO: `todo-067` Ferðalagið weather work

## Findings

### P1 - Scrubber is not visible in Stebbi's actual single-departure result

Stebbi tested Garðabær → Akureyri after v105 and still sees:

- result card
- next-caution text
- interactive map
- point detail panel
- no visible scrubber/timeline

This blocks the product goal from v104. The experience still reads as a static green result plus a map, not as a timeline-driven route forecast.

Current code suggests two likely causes:

1. **Placement issue:** `FerdalagidClient` renders `<TravelAuditMap />` first and the scrubber after it. But `TravelAuditMap` includes both the map canvas and the selected `PointDetailsPanel`. So "scrubber below map" currently means "scrubber below map + point details", which can easily push it out of view. Relevant code:
   - `app/auth-mvp/vedrid/FerdalagidClient.tsx:508-533`
   - `components/weather/TravelAuditMap.tsx` returns map plus point details in one section.

2. **Data/loaded-bundle issue:** The screenshot shows `nextCaution`, which should imply future timeline data exists in v105. If `nextCaution` exists but `outboundDisplayCandidates.length <= 1`, the UI should not silently omit the scrubber.

Required fix:

- The scrubber must be visible directly next to the map experience, without requiring the user to discover it below a point detail card.
- Preferred order:
  1. Result card
  2. Map canvas
  3. Timeline scrubber/filter chips
  4. Selected point detail panel
  5. Explainer/details

Implementation options:

- Split `TravelAuditMap` into map canvas + detail panel, so `FerdalagidClient` can insert the scrubber between them.
- Or add a render prop/slot to `TravelAuditMap` so timeline controls can render between map and point panel.
- Or move the point detail panel out of `TravelAuditMap` and control selected point state from parent.

Do not leave scrubber below the entire map+detail section.

### P1 - If `nextCaution` exists, missing timeline should be treated as a diagnostic bug

In single-departure mode, v105 says `nextCaution` is derived from `timelineCandidates`. Therefore this should hold:

```ts
if (nextCaution?.departureIso) {
  timelineCandidates.length > 1
}
```

If that invariant fails, something is wrong:

- API response did not include `timelineCandidates`
- client is not using the new result shape
- old bundle/dev server is still serving stale client code
- timeline candidates are being dropped/filtered unexpectedly

Required:

- Add a developer-safe diagnostic in the UI or console during localhost if `nextCaution` exists but no scrubber can render.
- Do not silently show only the next-caution text.
- At minimum, render a fallback warning line in dev/debug:
  - `Timeline data missing despite next caution`

This helps Stebbi and Claude Code distinguish "UI placement bug" from "server data bug" quickly.

### P2 - Filter chips appear only when non-green exists, but the timeline itself must always render

It is okay if filter chips are hidden when every slot is green. But the time scrubber row should still render whenever there are multiple timeline candidates.

In Stebbi's screenshot, next-caution says a future slot is non-green, so filters should eventually appear too. But the first blocker is that the whole timeline is missing from the visible experience.

### P2 - Current manual check list is inconsistent with implementation

v105 handoff says:

> On an all-green route, hide "Gott" → "Engin varúð..." + "Sýna allt"

But the handoff also says filter chips only appear when non-green slots exist. With current implementation, an all-green route will not show the `Gott` filter at all, so this manual check cannot be performed.

Either:

- always show filter chips, including all-green, or
- update manual checks and product expectation.

Codex recommendation:

- Show a compact status summary/filter row whenever the timeline is visible.
- Even all-green can show `Gott (n)` and `Allt`.
- This is more consistent and helps users understand the timeline state.

## Verification already run by Codex

Codex ran:

- `npm run type-check` → exit 0
- `npm run test:run` → exit 0
  - 53 files passed
  - 1725 tests passed
  - 27 skipped
  - 8 todo

So this is not a TypeScript/test failure. It is a product/UX visibility and invariant issue.

## Concrete expected UI after fix

For Garðabær → Akureyri, no latest-arrival time:

1. Result card says current departure is green.
2. Map shows route and weather points.
3. Immediately below the map canvas, user sees:
   - title: `Veðurþróun á næstu klukkustundum`
   - filter chips with counts, e.g. `Allt`, `Gott (n)`, `Varúð (n)`
   - horizontally scrollable time slots
4. User can hide `Gott`.
5. Scrubber then shows only non-green future slots.
6. Tapping a warning slot recolors the map and updates the selected point detail.

## Localhost checks for Stebbi

After Claude Code fixes this:

1. Hard-refresh localhost after dev rebuild.
2. Open `/auth-mvp/vedrid`.
3. Run Garðabær → Akureyri with no latest-arrival time.
4. Confirm scrubber is visible without scrolling past a point detail card.
5. Confirm scrubber sits visually with the map, ideally between map canvas and point detail.
6. Confirm `nextCaution` and timeline agree on the first warning time.
7. Hide `Gott`.
8. Confirm only warning/no-data slots remain.
9. Tap warning slot.
10. Confirm map recolors and point detail updates.
11. Test all-green route:
    - either filters still show `Gott (n)`, or manual checks no longer claim you can hide green.
12. Check 360/390/430 px mobile widths for no page-level horizontal overflow.

## Guardrails

- No new met.no calls for scrubber interactions.
- No browser calls to met.no.
- No raw met.no JSON in client payload.
- Do not duplicate next-caution logic.
- Do not start Iceland-wide map in this pass.
- No SQL/migration.
- No production env/config changes.
- No commit/push/deploy unless Stebbi explicitly asks.

## Codex conclusion

v105 may have the underlying data and tests in place, but Stebbi's actual localhost result still does not show the core interaction. That is a blocker.

The next fix should make the scrubber visible at the map level, not buried after the map's selected point panel, and should add a diagnostic if `nextCaution` exists without renderable timeline candidates.

No code changes were made in this review.
