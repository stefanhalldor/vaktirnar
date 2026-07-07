# Codex review: todo-067 v146 - v144 route alternatives + public top nav addendum

Created: 2026-07-07 20:37:35  
Timezone: Atlantic/Reykjavik  
Reviewed handoff: `2026-07-07-2027-todo-067-v144-claude-phase-b-route-alternatives-handoff`  
Also carries forward: `2026-07-07-2032-todo-067-v145-codex-public-top-nav-handoff`

## Findings

1. **High - Selected route identity is unstable and can silently evaluate the wrong route.**  
   `lib/weather/google.server.ts:162-170` creates route ids as `google-${idx}`. `app/api/teskeid/weather/travel/route.ts:170-176` then re-fetches alternatives and matches only by that id. If Google returns the same alternatives in a different order between the route-selection call and the final weather calculation, `google-1` can become a different route. That is trust-critical for Ferðaveðrið because the user may confirm one visible route but get weather calculated for another.  
   Fix before shipping this phase: make route ids stable from the route itself, or use a short-lived server-side/signed route selection token. Minimum acceptable route fingerprint should include enough geometry and metrics to avoid index drift, for example normalized distance, duration, labels, first/last coordinates, and a hash/sample of the decoded polyline. The final `travel/route` endpoint must match by this stable identity and return `selected_route_unavailable` if it cannot confidently match.

2. **High - The route list is labeled as “Stysta leið” but sorted by driving time.**  
   `app/api/teskeid/weather/travel/routes/route.ts:81-82` sorts by `durationS`, while `components/weather/RouteSelectionStep.tsx:359-363` labels index 0 as `routeOptionShortest`, and `messages/is.json:768` says `Stysta leið`. Stebbi asked for the shortest route first because Reykjavík -> Selfoss was not returning the expected shortest route. Current implementation returns the fastest route first, then calls it shortest.  
   Fix: either sort by `distanceM` ascending and keep `Stysta leið`, or explicitly change the product decision and label to `Fljótlegasta leið`. For this handoff, use Stebbi's stated requirement: shortest by distance first.

3. **Medium - Route-option fetch failure blocks the user from continuing, even though the old single-route flow may still work.**  
   In `app/auth-mvp/vedrid/FerdalagidClient.tsx:123-139`, route option failures set an error, and `FerdalagidClient.tsx:512` disables confirm when `selectedRouteId` is missing. That means a transient alternatives endpoint failure blocks the whole weather calculation. Since this phase is partly about resilience, the user should be able to retry or continue with a clearly-labeled fallback such as “Nota sjálfgefna leið án leiðavals”, which submits without `selectedRouteId` and lets `travel/route.ts` use the existing `getRouteGeometry` fallback.

4. **Medium - Tests currently encode the wrong product rule and do not cover selected-route stability.**  
   `lib/__tests__/weather-routes-api.test.ts:143-167` asserts `durationS` sorting. Once the requirement is corrected to shortest route first, these tests need to assert `distanceM` ordering. Add a final endpoint regression test that proves a selected non-default route is preserved by stable identity when `travel/route.ts` re-fetches alternatives.

## What looked good

- Auth and feature gating on the new `/api/teskeid/weather/travel/routes` endpoint follows the weather API pattern: unauthenticated returns JSON 401, no `vedrid` access returns 404.
- Google `computeAlternativeRoutes: true` is the right API direction for this phase. It returns the default route plus alternatives, not every possible road in Iceland. That is acceptable as long as copy does not promise “allar mögulegar leiðir”.
- `npm run type-check` passed.
- `npm run test:run` passed: 55 files, 1792 passed, 27 skipped, 8 todo.
- `git diff --check` passed except the existing CRLF warning for `messages/is.json`.

## Required route-alternatives fixes for Claude Code

1. Replace route ids based on array index with stable route identities.
2. Sort route options by `distanceM` ascending unless Stebbi explicitly chooses fastest-route-first later.
3. Keep the first card labeled `Stysta leið` only when the list is actually sorted by distance.
4. Preserve and display Google default status separately when useful, for example as metadata on the card rather than replacing “Stysta leið”.
5. Let the user retry route alternatives and, if alternatives fail, continue with the old default route fallback instead of being hard-blocked.
6. Update tests so they cover:
   - route options sorted by `distanceM`
   - stable selected route matching in final weather calculation
   - selected route unavailable when the stable route cannot be matched
   - route-options failure fallback behavior, if implemented

## Public top nav addendum from v145

Add this to the current implementation list after the route-alternatives fix. Do not let it disappear into the route work.

For unauthenticated/public users:

- Remove the hamburger menu from the public/unauthenticated shell.
- Reuse the public bottom bar concept as a sticky top bar instead.
- The sticky public top bar must appear on:
  - `/`
  - `/senda-hugmynd`
  - `/innskraning`
- Items in MVP:
  - `Hugmyndir`
  - `Ný hugmynd`
  - `Innskráning`
- Keep it compact, mobile-first, and app-like. It should not feel like a marketing navbar.
- It must have clear active state and pending/navigation feedback when a user taps between these pages.
- It must not cause mobile zoom, horizontal overflow, or layout jump at 360px, 390px, or 460px widths.

Do not weaken or redesign the authenticated app navigation as part of this small shell change unless Stebbi explicitly asks. This public-nav addendum follows `Design.md`: mobile-first, clear next action, stable sticky controls, 40px-ish touch targets, no horizontal overflow, and no dead-feeling route transitions.

## Files inspected

- `ai-handoff/2026-07-07-2027-todo-067-v144-claude-phase-b-route-alternatives-handoff.md`
- `ai-handoff/2026-07-07-2032-todo-067-v145-codex-public-top-nav-handoff.md`
- `ai-handoff/README.md`
- `Design.md`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `lib/weather/google.server.ts`
- `lib/weather/provider.types.ts`
- `lib/__tests__/weather-routes-api.test.ts`
- `messages/is.json`
- `messages/en.json`

## Commands run

- `git status --short`
  - Exit code: 0
  - Showed v144 route-alternative files modified/untracked, plus existing `.claude/` and `.obsidian/` untracked.
- `git diff --check`
  - Exit code: 0
  - Warning only: `messages/is.json` LF will be replaced by CRLF next time Git touches it.
- `npm run type-check`
  - Exit code: 0
- `npm run test:run`
  - Exit code: 0
  - Result: 55 passed test files, 1792 passed tests, 27 skipped, 8 todo.

## Files changed by Codex

- `ai-handoff/2026-07-07-2037-todo-067-v146-codex-v144-route-alternatives-review-plus-public-nav.md`

No app code, SQL, env variables, commits, pushes, deploys, Supabase data, or production data were changed by Codex.

## Localhost checks for Stebbi

After Claude Code fixes the points above, test this on localhost while signed in with `vedrid` access:

1. Open `/auth-mvp/vedrid`.
2. Choose `Reykjavík` -> `Selfoss`.
3. Confirm that route options appear before the trailer/weather-threshold/result steps.
4. Confirm the first option is truly shortest by km, not merely fastest by minutes.
5. Select a non-first route and verify the highlighted map line changes without jumping the map around.
6. Continue through the flow and calculate the weather result.
7. Confirm the result map and weather points follow the same route you selected, not a different Google alternative.
8. Repeat with a longer route such as `Garðabær` -> `Akureyri` and verify cards stay readable on mobile width.

For the fallback behavior:

1. If Claude adds a fallback button for route-options failure, simulate the unavailable state only on localhost and do not touch production keys casually.
2. Confirm the user can retry.
3. Confirm the user can continue with the default route fallback and gets either a weather result or a clear route error, not a disabled dead-end.

For the public top nav:

1. Test logged out or in an incognito window.
2. Open `/`, `/senda-hugmynd`, and `/innskraning`.
3. Confirm no hamburger menu is shown for unauthenticated users.
4. Confirm the sticky top bar is visible on all three pages, has active state, and navigates both forward and backward without feeling dead.
5. Test at 360px, 390px, and 460px widths. No mobile zoom, no horizontal overflow, no controls hidden under browser chrome.

Regression checks:

1. Sign in and verify authenticated app navigation still behaves as before.
2. Check that `Lánað og skilað` still opens and its key actions are not redirected incorrectly.
3. Do not test Supabase, production auth, billing, Vercel env, or production deployment changes casually as part of this localhost pass.
