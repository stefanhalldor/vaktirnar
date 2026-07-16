# 2026-07-16 08:10 — Codex review of v309 prerelease

Created: 2026-07-16 08:10  
Timezone: Atlantic/Reykjavik  
Review target: `2026-07-16-0804-todo-086-v309-claude-v308-done-prerelease`  
Relevant TODO: `todo-086`

## Findings

### High — route restore can be immediately wiped by the existing origin/destination clear effect

`app/auth-mvp/vedrid/FerdalagidClient.tsx:209-253` restores `origin`, `destination`, `result`, provider toggles and selected state from `sessionStorage` on mount.

But `app/auth-mvp/vedrid/FerdalagidClient.tsx:321-329` is a separate effect that clears `result`, `error`, selected heatmap indices and `userExplicitSlot` whenever origin/destination coordinates change. That effect also runs on initial mount. Because it is declared after the restore effect, it can run after restore has scheduled state updates and clear the restored `result` back to `null`.

This means the main promise from v309 — refresh or login-return keeps the route result and calculations — may be flaky or fail outright.

Recommended fix:

- Add an explicit restore guard for the route-clear effect, not just validation in the restore effect.
- The guard needs to skip both the initial clear pass and the immediate coordinate-change pass caused by restoring origin/destination.
- Do not solve this with a timeout.
- Prefer a small ref-based contract, for example:
  - restore effect stores the restored route coordinates in a ref;
  - route-clear effect skips the first mount pass;
  - route-clear effect skips once when current coords match restored coords, then clears the ref;
  - genuine later route changes still clear `result`.

Also add a unit/component-level regression test if feasible, or at minimum a manual localhost check that proves: calculate route -> refresh page -> result card, map, selected slot, provider filters and pulse links are still present.

### Medium — stale restore state can survive route edits before a new result is calculated

The route edit effect clears in-memory `result` when origin/destination changes, but I did not see it removing `ROUTE_RESTORE_KEY` from `sessionStorage` for legitimate route edits.

Risk: user changes the route, has no new result yet, refreshes, and the previous route result comes back from storage.

Recommended fix:

- When the user intentionally changes origin, destination, ferry port, route option, or threshold state in a way that invalidates the current result, either remove `ROUTE_RESTORE_KEY` or mark it invalid.
- Be careful not to remove it during the restore hydration itself.

### Medium — remove the header back arrow next to “Veðrið”

Stebbi’s product decision after seeing v309: remove the back arrow in the upper-left next to the `Veðrið` title. Users can use the hamburger/menu; the arrow can be misleading in this flow.

Current location:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1105-1119`
- `ChevronLeft` import at `app/auth-mvp/vedrid/FerdalagidClient.tsx:6`

Recommended change:

- Remove the `Link` containing `ChevronLeft`.
- Remove the unused `ChevronLeft` import.
- Keep the `CloudSun + Veðrið` title and `TeskeidMenu`.
- Verify spacing stays balanced on mobile.

Consider checking whether the older non-trip weather shell has the same back arrow. If yes, align the behavior there too unless there is a clear reason not to.

### Medium — loader copy should become a responsibility disclaimer, not process steps

Stebbi wants the `Reikna ferðaveðrið...` loader box to stop showing the current process copy and instead explain the important user-facing contract.

Current locations:

- `components/weather/WeatherResultLoader.tsx:1-39`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1367-1381`
- `messages/is.json:639-643`
- `messages/en.json:635-639`

Replace the current subtitle/steps with roughly:

- `Öll spágildi Veðurstofunnar og met.no (Yr) eru nú sett niður á þann tíma sem þú verður á hverjum stað.`
- `Athugaðu að útreikningurinn er byggður á spá og er alfarið á þinni ábyrgð hvenær eða hvort aksturinn á sér stað.`

Implementation guidance:

- Keep all user-facing text in `messages/is.json` and `messages/en.json`.
- It is fine to keep the title `Reikna ferðaveðrið...`.
- Do not hardcode this text in the component.
- The loader component can stay reusable, but should accept generic `bullets` or `items` rather than being semantically locked to three process steps.
- Keep text compact on mobile. This is a loader, not a long legal text.

### Low — restore validation is still shallow

`isValidRouteRestorePayload()` validates schema version, step, required top-level objects and TTL, but not the shape of `result`, `origin`, `destination`, arrays or selected status values.

This is not a security issue by itself because the data is tab-local `sessionStorage`, but it can still turn a corrupt payload or old shape into a render crash.

Recommended minimum:

- Validate `origin.lat/lon`, `destination.lat/lon`, and `result.id` or the smallest fields required to render the result safely.
- Keep the schema version and bump it whenever persisted shape changes.

### Low — v309 fixed the prior pulse access blocker

Confirmed good:

- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx:16-19` now uses `guardTeskeidSession()` plus `checkChatAccess(user)`.
- The old `guardFeatureAccess(user.email!, 'vedrid')` / `guardFeatureAccess(user.email!, 'elta-vedrid')` blockers are gone from that page.

This matches the intended contract: full pulse requires logged-in Teskeið chat access, not the old weather feature gates.

## Design.md alignment

Relevant design constraints:

- Navigation should be predictable and avoid dead/misleading controls.
- Loading states should be visible, stable, and mobile-safe.
- Form and text controls should not cause mobile overflow or awkward zoom.
- User-facing copy belongs in message files.

The requested header/back-arrow removal aligns with these constraints because the menu remains the stable navigation affordance. The loader-copy change also aligns, as long as it stays short, localized, and does not expand the loader into a bulky text panel.

## Commands run by Codex

Read-only inspection only:

- `Get-Content -LiteralPath 'WORKFLOW.md'`
- `Get-Content -LiteralPath 'ai-handoff/README.md'`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- `rg -n "ROUTE_RESTORE|restore|sessionStorage|vedurstofanReturnTo|ChevronLeft|resultLoading|WeatherResultLoader" ...`
- Targeted `Get-Content` reads of:
  - `ai-handoff/2026-07-16-0804-todo-086-v309-claude-v308-done-prerelease.md`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`
  - `components/weather/WeatherResultLoader.tsx`
  - `lib/auth/loginNext.ts`
  - `lib/__tests__/loginNext.test.ts`
  - `messages/is.json`
  - `messages/en.json`

No product code, SQL, env, Supabase, commit, push or deploy changes were made by Codex.

## Suggested next step for Claude Code

Do a focused v311 patch before release:

1. Fix the route restore vs route-clear race.
2. Clear or invalidate persisted route state on real route edits.
3. Remove the header back arrow from the weather trip shell.
4. Change the result loader to show the two responsibility/disclaimer bullets from translations.
5. Run targeted tests plus type-check.

Do not broaden this into new pulse features or provider behavior. Keep it scoped to v309 correctness and Stebbi’s two UI/copy requests.

## Localhost checks for Stebbi

After Claude Code fixes v309/v310 findings, test on localhost:

1. Open `/vedrid` as public and calculate a route.
   - Expected: loader shows the new two disclaimer bullets, not the old “Sæki leið...” process steps.
   - Expected: no horizontal overflow on mobile width.

2. Open `/auth-mvp/vedrid` as logged-in user and calculate a route with Veðurstofan visible.
   - Expected: no back arrow next to the `Veðrið` title.
   - Expected: hamburger/menu remains.

3. With a calculated result visible, refresh the page.
   - Expected: same route result returns without re-entering origin/destination.
   - Expected: map, worst point, selected slot, provider filters, Veðurstofan cards and pulse links still match the previous result.

4. From a route result, open a station pulse, log in if needed, then return/back.
   - Expected: user lands back in the same route result context, not a blank/new `/auth-mvp/vedrid`.

5. Change origin or destination after a restored result, then refresh before recalculating.
   - Expected: old route result does not reappear.

6. Regression check:
   - Public met.no-only weather still works.
   - Logged-in users without Veðurstofan access still get normal met.no weather.
   - Logged-in users with Veðurstofan access see Veðurstofan layer and station cards.

No casual production/Supabase testing is needed for this patch; it should be frontend/sessionStorage/copy only.

## Uncertainty / needs confirmation

- I did not run the full test suite or browser-test the React effect ordering. The restore-vs-clear issue is based on code inspection and React effect semantics, so Claude Code should verify it with a small reproduction/manual check.
- I did not inspect every weather shell route for duplicate header back arrows. Claude Code should search for `ChevronLeft` around weather headers and apply the product decision consistently where appropriate.
