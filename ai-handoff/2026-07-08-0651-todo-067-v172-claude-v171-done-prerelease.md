# TODO-067 v172 - Claude Code - v171 implemented, prerelease

Created: 2026-07-08 06:51
Timezone: Atlantic/Reykjavik
From: Claude Code
To: Stebbi (localhost review) / Codex (prerelease review)
Status: Implementation complete. Type-check clean. 58 test files pass, 1858 tests passed (2 new tests added).

## What was implemented

Handoff v171 — two high-priority fixes from the Codex prerelease review:

1. Merged the old separate result summary card and departure timeline card into one single combined card.
2. Removed the 48h hardcoded forecast horizon cap.

---

## Change 1: One combined card above the map

### Problem
v170 still rendered two separate cards:
- The old "stada / svar / Af hverju?" summary card
- A separate "Brottfarartíminn þinn í Teskeið" departure timeline card

### Fix (`app/auth-mvp/vedrid/FerdalagidClient.tsx`)

Replaced both with a single `<div>` containing in order:
1. Status dot + status label + "Brottfarartíminn þinn í Teskeið" heading
2. `result.svar` (main result sentence)
3. Ferry context note (if applicable)
4. Best departure window badge (if window mode)
5. Return best window (if applicable)
6. Custom threshold summary (only if overrides active)
7. Active departure + arrival time from `activeOutboundCandidate`
8. Coverage text: "Teskeið hefur metið brottfarartíma á klukkutíma fresti fram til {date}."
9. `DepartureHeatmap` scrubber (when `outboundDisplayCandidates.length > 1`)
10. Next caution line (only when a caution departure was found — `nextCaution.departureIso` is set)
11. "Af hverju?" disclosure toggle + details

No cards inside cards. The "Af hverju?" section uses a border-top divider within the same card.

### `nextCautionNone` removed from UI

The "no caution found in X hours" line was removed from the primary card per v171 decision. The scrubber and coverage text carry this information visually. The translation key was updated to not use `{hours}`:
- IS: "Engin varúð sést á skoðuðu tímabili."
- EN: "No weather caution found in the assessed period."

The `nextCautionLine` (when a caution IS found) is kept as it gives genuinely useful information.

The threshold display in the combined card now only shows when `hasOverrides` is true (custom thresholds). The "Sjálfgefin mörk" line was removed to reduce clutter.

---

## Change 2: Removed 48h forecast cap

### Problem
`lib/weather/travel.ts` had:
```ts
const NEXT_CAUTION_MAX_H = 48
const hardCapMs = startMs + NEXT_CAUTION_MAX_H * 3600 * 1000
const endMs = Math.min(coverageCapMs, hardCapMs)
```
This capped the timeline scrubber and `nextCaution` scan at 48 hours regardless of forecast availability.

### Fix (`lib/weather/travel.ts`)

- Removed `NEXT_CAUTION_MAX_H` constant.
- Removed `hardCapMs` variable.
- Changed `endMs = Math.min(coverageCapMs, hardCapMs)` → `endMs = coverageCapMs`.
- The timeline now extends as far as the returned met.no data allows.
- No separate met.no requests added — existing fetched data is reused.

Also updated:
- Comment in `buildSingleDepartureTimeline`: "coverage/48h cap" → "full forecast coverage limit"
- Comment in single-departure timeline section: same update
- `lib/weather/types.ts` comment on `timelineCandidates` field

---

## New tests (`lib/__tests__/weather-travel.test.ts`)

Added two new tests in the `timelineCandidates` describe block:

1. **"timeline extends beyond 48h when forecast data covers more than 48h"**
   - 10h trip, 80h calm forecast → verifies last timeline candidate is >48h after start.

2. **"nextCaution finds a caution beyond 48h when that is where the first caution occurs"**
   - 5h trip, 50h calm then windy → verifies `nextCaution.departureIso` is >48h after start.

Both tests pass.

---

## Files changed

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `lib/weather/travel.ts`
- `lib/weather/types.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-travel.test.ts`

## Not changed

- No SQL, Supabase, RLS, auth, migration, production data, secrets, billing or deployment changes.
- Return leg scrubber: still out of scope.
- `TravelAuditMap.tsx`, `DepartureHeatmap.tsx`, `travelAuditMap.helpers.ts`: unchanged from v170.

---

## Test results

```
Test Files  58 passed (58)
Tests  1858 passed | 27 skipped | 8 todo
```

TypeScript: clean (no errors).

---

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost.

Use route: **Garðabær → Egilsstaðir** (long route, many points).

1. **One card only.**
   - Expected: exactly one white card above the map.
   - Expected: card heading includes "Brottfarartíminn þinn í Teskeið".
   - Expected: the old separate top result card is gone.
   - Expected: the old separate scrubber card is gone.

2. **Card contents.**
   - Expected: status dot + label, then main result sentence.
   - Expected: departure + arrival time from active candidate.
   - Expected: coverage text with concrete date ("fram til ...").
   - Expected: departure scrubber inside the same card.
   - Expected: "Af hverju?" toggle at the bottom of the card.

3. **No 48h reference.**
   - Expected: no text says "48 klst." or "48 hours" anywhere.

4. **Scrubber horizon.**
   - Expected: the scrubber extends beyond 48h if met.no returns more data.
   - For Garðabær → Egilsstaðir (5-6h trip), met.no typically returns ~66h of data → scrubber should have ~60 slots, not capped at 48.

5. **Next caution.**
   - If current departure is green and a caution exists later in the horizon, "Næst verður varasamt..." still shows.
   - If no caution found in the full horizon, no "next caution" line shows (removed).

6. **Green departure: no negative threshold text.**
   - Select a green slot in the scrubber.
   - Expected: no "-X,X yfir X m/s mörkum" text in the combined card or point detail panel.

7. **Af hverju? inside the card.**
   - Click "Af hverju?" toggle.
   - Expected: facts list expands inside the same card, no new card created.

8. **Mobile checks (360px, 390px, 460px).**
   - No horizontal overflow.
   - Card does not contain nested bordered cards.
   - Scrubber scrolls horizontally.

Also test: **Garðabær → Akranes** (short route) for compact/calm mobile layout.
