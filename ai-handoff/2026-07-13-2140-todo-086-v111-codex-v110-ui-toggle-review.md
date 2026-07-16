# TODO 086 v111 - Codex review of v110 Veðurstofan UI toggle

Created: 2026-07-13 21:40
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviewed handoff: `2026-07-13-2135-todo-086-v110-claude-ui-toggle-done.md`

## Verdict

v110 is technically close and the overall direction is right: the toggle is additive, hidden unless the API returns `vedurstofanLayer`, client-side only, and does not add Google/met.no calls.

I found two UI/accessibility issues that should be patched before commit/release. They are small fixes, but they matter because this is a mobile-first control that can change the visible weather assessment.

## Findings

### Medium - Switch has no accessible name and touch target is too small

`app/auth-mvp/vedrid/FerdalagidClient.tsx:1175-1192`

The `button` with `role="switch"` has only a visual knob inside it. The nearby text label is not programmatically associated with the switch, so assistive tech may announce an unlabeled switch. Also, the actual button hit area is `h-5 w-9` (20 x 36 px), below the Design.md target of generally at least 40 x 40 px for touch controls.

This is especially important because Stebbi explicitly wants an app-like mobile experience and this control changes the displayed assessment.

Recommended fix:

- Add `aria-label={tf('vedurstofanLayerToggleLabel')}` or wire the visible label with `aria-labelledby`.
- Make the clickable target at least 40 x 40 px. Keep the visual track small if desired, but put it inside a larger button.
- Ideally let tapping the visible label/row toggle too, or make the whole row a properly labeled switch-like control.

Design.md relevance:

- Touch targets should generally be at least 40 x 40 px.
- Controls need visible focus and accessible labels.
- Binary settings should use a toggle.

### Medium - Forecast drawer can show stale baseline rows after switching to Veðurstofan

`app/auth-mvp/vedrid/FerdalagidClient.tsx:407-410`, `1156-1166`, `1278-1286`

Forecast drawer data is copied into `forecastDrawerData` when the drawer opens. When `toggleVedurstofan()` swaps `result` between `baselineResult` and `vedurstofanLayer.augmentedResult`, it does not clear or recompute `forecastDrawerData`.

That means this user flow can show inconsistent data:

1. Open a route-point forecast drawer on the MET/Yr baseline.
2. Turn on `Veðurstofan (í prófun)`.
3. Main page/map/heatmap now uses augmented result, but the already-open drawer can still show the old baseline rows.

Recommended fix:

- In `toggleVedurstofan`, close stale contextual UI:
  - `setForecastDrawerData(null)`
  - probably `setCompareDrawerOpen(false)` as a defensive cleanup
- Consider also bumping `mapSelectionSignal` or clearing map selection if manual point selection is tied to old result state.

This keeps the UI honest: after switching the data source layer, users reopen details from the currently displayed result.

## Non-blocking notes

- `setBaselineResult(travelData)` stores the top-level `vedurstofanLayer` field inside the baseline object. This is not breaking anything now, but if the code grows, consider storing a stripped baseline object or introducing a clearer local type.
- `showVedurstofan`, `baselineResult`, and `vedurstofanLayer` are not cleared in every place where `setResult(null)` is called. It is mostly hidden by `result && !loading`, but clearing them together on new submit/input-change would reduce stale hidden state.
- The UI currently does not display `partial`, `available`, or `unavailable` status/counts. That is acceptable for the first toggle, but the next polish pass should expose at least a compact status when data is partial.

## What looks good

- Toggle is only visible when `vedurstofanLayer` exists.
- Toggle is instant/client-side and does not trigger network calls.
- New search resets `showVedurstofan` to false.
- Text is in `messages/is.json` and `messages/en.json`, not hardcoded.
- MET/Yr baseline remains the default.
- Disclaimer wording is clear that MET/Yr remains baseline and Vegagerðin is not included yet.
- `withLayerTimeout` now clears the timeout timer.
- Count names are now point-based rather than station-based.

## Commands run by Codex

```powershell
git status --short
git diff -- app/auth-mvp/vedrid/FerdalagidClient.tsx messages/is.json messages/en.json app/api/teskeid/weather/travel/route.ts lib/weather/providers/vedurstofanBlend.ts lib/__tests__/weather-travel-api.test.ts
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
npm run build
npm run type-check
npm run test:run
```

Results:

- Targeted tests: 2 files passed, 24 tests passed.
- Build: exit 0. Existing unrelated warnings remain in `app/s/[sessionId]/page.tsx`, `components/landing/Avatar.tsx`, and `components/weather/TravelAuditMap.tsx`.
- First `type-check` attempt failed because I ran it in parallel with `next build`, which rebuilt `.next/types` while `tsc` was reading them. Re-running after build completed succeeded.
- Type-check re-run: exit 0.
- Full test suite: 81 files passed, 2400 passed, 27 skipped, 8 todo.
- Full suite printed the known jsdom `Not implemented: navigation to another Document` lines, but exit code was 0.

## Recommended next step for Claude Code

Do a small v112 UI accessibility/consistency patch:

1. Give the Veðurstofan switch an accessible name.
2. Enlarge the clickable switch target to at least 40 x 40 px.
3. Clear `forecastDrawerData` when toggling between baseline and Veðurstofan.
4. Consider clearing `compareDrawerOpen` and hidden stale layer state on new result/input changes.
5. Run targeted tests, type-check, and ideally build.

After that, this is ready for Stebbi's localhost UI pass.

## Localhost checks for Stebbi

After Claude Code patches v112:

1. With layer disabled:
   - Run normal ferðaveður.
   - Expected: no Veðurstofan toggle, UI behaves exactly like before.

2. With all three gates enabled:
   - `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`
   - `WEATHER_ELTA_VEDRID_FLAG=true`
   - Stebbi has per-user `elta-vedrid` access
   - Run a route with nearby Veðurstofan points.
   - Expected: `Veðurstofan (í prófun)` toggle appears after the map.

3. Toggle behavior:
   - Turn toggle on/off.
   - Expected: no new Google/met.no/API call from the toggle itself, disclaimer appears only when on, result switches instantly.

4. Drawer consistency:
   - Open a point forecast drawer.
   - Toggle Veðurstofan.
   - Expected after patch: drawer closes or refreshes so it cannot show stale rows from the previous layer.

5. Mobile:
   - Check widths 360, 390, 460 px.
   - Expected: no horizontal overflow, switch is easy to tap, focus state is visible, label/disclaimer wrap cleanly.

Do not test production cron, Vercel env vars, production Supabase, or production feature grants without explicit approval.

## Confidence / uncertainty

Confidence is high on the review findings. I did not inspect unrelated dirty files (`TODO.md`, `WORKFLOW.md`, `app/auth-mvp/vedrid/page.tsx`, or the separate trip files). This review is scoped to v110.
