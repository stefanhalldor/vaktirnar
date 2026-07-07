# todo-067 v098 - Codex review: v097 route timeline Phase A plan

Created: 2026-07-06 20:24
Timezone: Atlantic/Reykjavik
Author: Codex
Reviews: `2026-07-06-2015-todo-067-v097-claude-v096-phase-a-plan.md`
Relevant TODO: `todo-067` Ferðalagið weather work

## Findings

### P1 - "Worst point only" is too half-way for the route timeline milestone

v097 correctly identifies the main data gap: the current payload can highlight the worst point for a selected slot, but it cannot recolor all route weather points for that selected slot. The proposed MVP path A says to leave all other points default/gray and only highlight the worst point.

That is not enough for the next milestone Stebbi asked for. The whole trust upgrade is that the map becomes the explanation, not just a proof image with one highlighted point. Current code confirms the risk:

- `TravelAuditMap` colors markers from `pt.summaryForWindow?.status`, not from the selected heatmap slot: `components/weather/TravelAuditMap.tsx:134-138` and `components/weather/TravelAuditMap.tsx:226-232`.
- `summaryForWindow` is calculated from one `summaryCandidate`, usually the best/default candidate, not every selected heatmap candidate: `lib/weather/travel.ts:622-634`.
- When a heatmap slot is selected, the map can update the highlighted point, but the rest of the route markers remain colored from the old/default summary.

Codex recommendation: do **not** accept path A as Phase C scope. Use v097's path B now, but keep it compact and server-side:

- no new met.no calls
- no raw met.no forecast JSON sent to client
- add normalized per-candidate/per-point summaries, e.g. `candidatePointSummaries[candidateIdx][pointIdx]`
- include only `status`, `metric`, `value`, `threshold`, `unit`, `timeIso`, and maybe `routeIndex`
- compute it from the already fetched `pointForecasts`

This is the smallest version of "alla leið": every marker can answer "how is this point on the route at the selected time?"

### P1 - Green slot behavior still cannot be audited honestly

v097 treats the green-slot fallback as solved because `candidateToIssue()` returns `undefined` and `FerdalagidClient` falls back to the result default highlighted issue. Current code does exactly that: `app/auth-mvp/vedrid/FerdalagidClient.tsx:166-174`, then shows a note at `app/auth-mvp/vedrid/FerdalagidClient.tsx:518-520`.

That is better than stale red/yellow state, but it still does not satisfy the route-timeline goal. If the user selects a green slot, the map should show the route state for that green slot. Falling back to the default highlighted issue means the map can visually point to a different time than the selected slot.

Required direction:

- selected green slot should clear "worst point" language
- all point markers should be colored for the selected green slot
- the detail panel can select a neutral representative point, e.g. destination-nearest or the highest-but-still-green point
- copy should say the selected slot is green and no point exceeds thresholds, not "map cannot update"

This falls out naturally if P1 above adds per-candidate/per-point summaries.

### P2 - v097 is stale about `nextCaution`; UI already exists and should not be duplicated

v097 says `nextCaution` is in payload but not displayed. Current code already renders it at `app/auth-mvp/vedrid/FerdalagidClient.tsx:421-457`.

Claude Code should re-read current files before implementation and avoid adding a second next-caution line.

There is still useful work here:

- add date/day to the text, not only `kl. HH:mm`, because next caution can be tomorrow or later
- keep metric/value/threshold/location as current code already attempts
- ensure the copy reads naturally in both Icelandic and English

### P2 - Hardcoded Icelandic `kl.` remains in heatmap arrival text

`DepartureHeatmap` uses localized `heatmapSlotDateTime` for departure, but hardcodes `kl.` for arrival at `components/weather/DepartureHeatmap.tsx:153-158`.

This directly conflicts with v096/v097 localhost checks about English locale. Fix it as part of the same i18n pass:

- use a message key for arrival datetime
- or reuse `heatmapSlotDateTime` with the arrival date/time
- do not render `kl.` directly in TSX

### P2 - Day/date is not actually persistent while horizontally scrolling

v097 says the heatmap already has day separators. It does, but the separators are inline items: `components/weather/DepartureHeatmap.tsx:69-87`.

That helps at day boundaries, but it does not fully satisfy Stebbi's request that the user can always see which day is active while horizontally scrolling. Once the separator is off-screen, the visible chips again only show `HH:mm`.

Recommended Phase C behavior:

- keep a compact selected/current day label above the scroll row, updated from selected slot or first visible slot
- optionally keep inline separators too
- if "first visible slot" is hard to observe robustly, start with selected slot day plus separators

### P2 - Map fallback is still too thin if Google JS and static map are unavailable

`TravelAuditMap` falls back to a static image if `staticMapUrl` exists, otherwise only a short unavailable text: `components/weather/TravelAuditMap.tsx:250-267`.

v096 required fallback details to still explain route weather. If Google Maps JS fails and static map URL is also unavailable, the user should still see a useful list/panel of route weather points and selected slot details. A single unavailable line is not enough for the auditability goal.

## Answers to v097 questions

### 1. Is path A acceptable for Phase C?

No, not as the main Phase C result.

Path A is acceptable only as an intermediate implementation checkpoint while Claude Code is wiring the UI, but the handoff should not call Phase C complete until selected-slot point summaries exist and the map can recolor all route points for the selected time.

### 2. Is "næsta varasama brottför" enough for Phase C?

No. It is useful and should stay, but it is not a substitute for the timeline-controlled map.

The next-caution line answers one question. The timeline map answers the trust question: "show me exactly what happens on the chosen route over time."

### 3. Should full per-point coloring go into this phase?

Yes. Use compact server-generated summaries, not raw forecasts and not extra met.no calls.

This is the pragmatic middle:

- better than "one worst point only"
- much safer than client recompute with raw forecast data
- small payload: roughly `candidates × routeWeatherPoints`, likely around 48 × 15 in normal cases
- reusable foundation for the later Iceland model-lab map

## Proposed revised Phase B/C scope

### Phase B - Route candidate point summaries

Add a shared helper that evaluates every sampled route weather point for a specific candidate and leg.

Output should be compact, deterministic and client-safe:

```ts
type CandidatePointSummary = {
  routeIndex: number
  status: WeatherStatus | 'no_data'
  metric?: 'wind' | 'gust' | 'precipitation' | 'data'
  value?: number
  thresholdValue?: number
  unit?: 'm/s' | 'mm/klst'
  timeIso?: string
}
```

Attach summaries to outbound and return candidates, or expose parallel arrays keyed by candidate index. Prefer the smaller/cleaner shape after inspecting current API serialization.

Important:

- compute from existing `pointForecasts`
- preserve outbound vs return ETA direction
- return distances must be leg-relative where displayed
- do not increase route sample count
- do not add met.no calls

### Phase C - Timeline-controlled map

When a heatmap slot is selected:

- map markers use that candidate's point summaries
- the selected/worst point is highlighted
- green slots show green route markers and no stale warning point
- point detail panel uses selected candidate summary, not `summaryForWindow` from a different candidate
- return timeline uses return leg semantics and labels

Keep the static/default `summaryForWindow` only as fallback/default before any slot is selected.

## Tests to require

Add or update tests around:

1. Per-candidate point summaries produce expected green/yellow/red point statuses without extra fetches.
2. Selecting a yellow/red candidate highlights the matching `routeIndex` and displays the selected candidate's metric/time.
3. Selecting a green candidate clears warning copy and does not keep a stale highlighted issue.
4. Return candidate point summaries calculate ETA and displayed distance from destination.
5. `nextCaution` UI does not duplicate and includes date/day when not same day.
6. English heatmap arrival text has no hardcoded `kl.`.
7. Map fallback without Google JS/static image still renders useful route point details.

## Localhost checks for Stebbi

After implementation, Stebbi should test:

1. Open `/auth-mvp/vedrid`.
2. Test Garðabær → Akranes and Reykjavík → Selfoss.
3. Use a latest-arrival window so many outbound slots appear.
4. Tap a yellow/red slot and confirm **all map markers recolor** for that selected time, not just one point.
5. Tap a green slot after a yellow/red slot and confirm the map shows green route state without stale warning text.
6. Confirm the selected point detail uses the selected slot's time, metric and threshold.
7. Add return trip and confirm outbound and return timelines remain separate.
8. In return timeline, confirm distances are from destination/return start, not from outbound origin.
9. Horizontally scroll the timeline and confirm day/date context remains visible.
10. Confirm next-caution line, if shown, includes enough date/time context to avoid ambiguity.
11. Switch to English locale and confirm no `kl.` appears in heatmap slot details.
12. Temporarily test missing/broken Google map behavior only locally; it must not expose secrets or require production config changes.

## Review conclusion

Route timeline first is correct. v097's strongest point is that no new met.no calls are needed and the current architecture is close.

But Codex does **not** recommend accepting the "worst point only" MVP as the next completed experience. Stebbi explicitly chose "alla leið"; the smallest honest version of that is compact per-candidate/per-point status summaries so the map and timeline always show the same selected-time truth.

No code changes were made in this review.
