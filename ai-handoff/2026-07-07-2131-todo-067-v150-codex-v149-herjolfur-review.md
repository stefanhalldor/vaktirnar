# Codex review: todo-067 v150 - v149 Herjólfur ferry-port fallback

Created: 2026-07-07 21:31:24
Timezone: Atlantic/Reykjavik
Reviewed handoff: `2026-07-07-2126-todo-067-v149-claude-phase-c-herjolfur.md`
Reviewed state: uncommitted working tree on `main`

## Findings

1. **High - Changing ferry port after a result can leave a stale weather result available.**
   `app/auth-mvp/vedrid/FerdalagidClient.tsx:201-214` clears route state when the user switches between Landeyjahöfn and Þorlákshöfn, but it does not clear `result`, `error`, selected heatmap indexes, or submitted thresholds. The existing result-clearing effect at `FerdalagidClient.tsx:103-110` only depends on origin/destination coordinates, and those do not change when only the ferry port changes. Because the step nav can still return to `result` when `result !== null`, the UI can show a route summary for the newly selected port while retaining weather data from the previous port. This is trust-critical.

   Fix: whenever `ferrySelection?.ferryPortId` changes, clear the same result state that origin/destination changes clear: `result`, `error`, `selectedHeatmapIdx`, `selectedReturnHeatmapIdx`, and probably `submittedThresholds` if it is tied to the last calculation. Add a regression test or at least explicit localhost check for Landeyjahöfn result -> go back -> switch to Þorlákshöfn -> old result is no longer reachable without recalculation.

2. **Medium - The map draws a straight fallback line to Vestmannaeyjar before the user chooses a ferry port.**
   In `components/weather/RouteSelectionStep.tsx:93-97`, `effectMapDest` falls back to the original destination when no ferry port is selected. Then `RouteSelectionStep.tsx:209-218` draws a thin fallback line whenever `origin && effectMapDest`. For `Reykjavík -> Vestmannaeyjar` before port selection, that means the map can show a direct line over sea to the island. That undermines the core message that Teskeið is not evaluating the ferry/sea leg.

   Fix: split the concepts:
   - `displayDestination` may remain Vestmannaeyjar so the user sees the intended final destination.
   - `routeMapDestination` should be `null` while `isVestmannaeyjar && !ferryPortId`.
   - only draw route/fallback line when the destination is actually driveable or a ferry port has been chosen.

3. **Medium - Text fallback can false-positive mainland places.**
   `lib/weather/ferryPorts.ts:58-60` returns true if `name` or `formattedAddress` contains `vestmannaeyjar` or `heimaey`, even when coordinates are explicitly outside the Vestmannaeyjar bounding box. This is exactly the class of false positive we were trying to avoid, e.g. a mainland business/hotel/address with "Vestmannaeyjar" in the name. The current tests cover mainland places without matching text, but not mainland places with matching text.

   Fix: make coordinates authoritative when present. Since `RoutePlace` always has `lat/lon`, prefer removing the text fallback from this runtime path, or only allow it for exact normalized place names when coordinates are missing/untrusted. Add a negative test for a mainland coordinate with a matching text alias.

4. **Low - Ferry port coordinates are plausible but still a production gate.**
   v149 says coordinates are from "bestu þekkingu frá Google Maps", but they were not independently verified in this review. Before production, Stebbi should visually confirm both pins on the route-selection map. If either pin is off, update only `lib/weather/ferryPorts.ts`.

5. **Low - `ferryCheckHerjolfurNote` is added but unused.**
   `messages/is.json:784` and `messages/en.json:780` define `ferryCheckHerjolfurNote`, but the UI uses the check-Herjólfur wording inside `ferrySelectedNote` instead. This is harmless, but either use the key or remove it to avoid translation drift.

## What looked good

- The scope is correctly narrow: no SQL, no Supabase/RLS, no production env, no Herjólfur API, no sea-weather claims.
- `handleSubmit` sends the ferry port as the effective destination, so the backend weather calculation stays simple and deterministic.
- Route options are hidden until a ferry port is selected, which is the right interaction model.
- Result copy clearly says Teskeið does not assess Herjólfur sailing conditions.
- Tests cover the basic bounding box and port-coordinate validation.
- `npm run type-check` passed.
- `npm run test:run` passed: 56 files, 1807 passed, 27 skipped, 8 todo.
- `git diff --check` produced only CRLF warnings for `TODO.md` and `messages/is.json`.

## Design / UX notes

This work follows the broad `Design.md` direction: mobile-first, compact, clear task flow, no route overreach. The ferry picker itself is reasonable, but after fixing the findings above I would also consider adding a non-color-only selected indicator to the chosen ferry port button, for example a small check icon. Not a blocker, but it reduces ambiguity.

## Commands run by Codex

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
  - Read workflow rules.
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
  - Read handoff rules.
- `Get-Content -Encoding UTF8 'Design.md' | Select-Object -First 220`
  - Read relevant mobile/UI guidance.
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-07-2126-todo-067-v149-claude-phase-c-herjolfur.md'`
  - Read Claude handoff.
- `git status --short`
  - Exit code: 0.
  - Shows v149 files uncommitted plus unrelated/untracked `.claude/`, `.obsidian/`, v148 handoff, and prior `TODO.md` change.
- `git diff --stat`
  - Exit code: 0.
  - Note: does not include untracked `lib/weather/ferryPorts.ts` or `lib/__tests__/ferryPorts.test.ts`.
- `git diff --check`
  - Exit code: 0.
  - CRLF warnings only.
- `npm run type-check`
  - Exit code: 0.
- `npm run test:run`
  - Exit code: 0.
  - 56 passed test files, 1807 passed tests, 27 skipped, 8 todo.

## Files inspected

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `Design.md`
- `ai-handoff/2026-07-07-2126-todo-067-v149-claude-phase-c-herjolfur.md`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `lib/weather/ferryPorts.ts`
- `lib/__tests__/ferryPorts.test.ts`
- `messages/is.json`
- `messages/en.json`

## Required next fixes for Claude Code

1. Clear stale result state when ferry port changes.
2. Do not draw any route/fallback line from origin to Vestmannaeyjar before ferry port selection.
3. Tighten `isVestmannaeyjarDestination` so mainland coordinates with matching text do not trigger ferry UI.
4. Add tests for:
   - mainland coordinate with `name: 'Heimaey ...'` or `formattedAddress` containing `Vestmannaeyjar` returns false
   - ferry port change invalidates/clears previous result state, if feasible
5. Either use or remove `ferryCheckHerjolfurNote`.

## Localhost checks for Stebbi

After Claude fixes the points above:

1. Open `/auth-mvp/vedrid` signed in with `vedrid` access.
2. Select `Reykjavík -> Vestmannaeyjar`.
3. Before choosing ferry port, verify the ferry choice card appears and the map does not draw a direct route line over the sea to Vestmannaeyjar.
4. Choose `Landeyjahöfn`.
5. Verify route options and map route are for `Reykjavík -> Landeyjahöfn`.
6. Complete the flow to a result.
7. Go back to route assumptions/route step and switch ferry port to `Þorlákshöfn`.
8. Verify the old Landeyjahöfn result is not accessible as a valid result without recalculating.
9. Recalculate and verify result says it is for driving to Þorlákshöfn only.
10. Change destination to `Selfoss`.
11. Verify ferry UI disappears and normal route alternatives work.

Regression checks:

1. `Reykjavík -> Selfoss` should never show ferry UI.
2. `Garðabær -> Akureyri` should never show ferry UI.
3. Route fallback still works if `/travel/routes` fails.
4. Public top nav and authenticated `Lánað og skilað` should still behave as before.

Do not test Herjólfur live status, sea conditions, harbour closure, SQL, Supabase, RLS, Vercel env, production auth, billing, or production data for this phase.

## Files changed by Codex

- `ai-handoff/2026-07-07-2131-todo-067-v150-codex-v149-herjolfur-review.md`

Codex did not change app code, SQL, migrations, env vars, Supabase settings, Vercel settings, commits, pushes, or deployment.

## Open questions

1. Do we want to handle the reverse direction, Vestmannaeyjar -> mainland, in the next small phase? v149 intentionally does not handle it.
2. Should we include a Herjólfur link as an informational link later, or keep the current text-only warning for now?
