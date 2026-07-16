# Codex review: TODO #75 v013 — Phase 1 committed/release status review

Created: 2026-07-08 22:07
Timezone: Atlantic/Reykjavik
Agent: Codex
Review target: `2026-07-08-2210-todo-075-v012-claude-phase1-released.md`
Related commit: `b205a9f`
Related TODO: #75

---

## Findings fyrst

1. **No code-blocking findings from this review.**
   The v010 major blocker appears fixed in commit `b205a9f`: route-point `Spá 🥄` now uses `activeCandidate.displayPoint.forecastTimeIso` for the active decisive point, nearest forecast row to active ETA for other points, and only falls back to `summaryForWindow` without an active slot.

2. **Release-state wording is inconsistent.**
   The file name says `phase1-released`, but v012 says “committed, ready to push” and “Veifaðu Vercel build log áður en þú lýsir þetta released.” Local git shows `b205a9f (HEAD -> main, origin/main)`, so the commit appears pushed to the tracked remote, but Codex did not verify Vercel build/deploy. Do not call this production-released until Vercel has completed successfully.

3. **TODO hygiene needs a small follow-up.**
   `TODO.md` now contains #75 with `Staða: Lokið (Phase 1)`. Project workflow says `TODO.md` should contain open items only. Better options:
   - move Phase 1 result to `DONE.md` and create/keep a separate TODO for Phase 2, or
   - change #75 status to something like `Bíður Phase 2` if it intentionally remains open.

4. **Untracked local files remain.**
   `git status --short` shows many untracked `ai-handoff/*` files plus `.claude/` and `.obsidian/`. They are not part of commit `b205a9f`. Do not accidentally include local/private/editor files in later release commits.

5. **Known deferred product items are acceptable as follow-up, not blockers.**
   Raw met.no links remain visible, v011 screenshot-proof dates/threshold summary is not in this commit, and Phase 2 items are deferred. That is fine if Stebbi accepts Phase 1 as shipped scope.

---

## What was verified locally by Codex

- `git show --stat b205a9f` confirms the expected nine files changed:
  - `TODO.md`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `components/weather/ForecastDrawer.tsx`
  - `components/weather/TravelAuditMap.tsx`
  - `lib/__tests__/weather-travel.test.ts`
  - `lib/weather/travel.ts`
  - `lib/weather/types.ts`
  - `messages/en.json`
  - `messages/is.json`
- `git show b205a9f:app/auth-mvp/vedrid/FerdalagidClient.tsx` confirms `nearestForecastIso(...)` is used for active slot route-point drawer highlighting.
- `git show b205a9f:lib/weather/travel.ts` confirms temperature tone is now neutral and gust severity is threshold-relative.
- `git log --oneline --decorate -5` shows `b205a9f` at `HEAD -> main, origin/main`.

Codex did not run tests in this review turn. v012 reports type-check clean and 1958 tests pass.

---

## Recommendation

If Vercel build/deploy is green, Phase 1 can be considered releasable/released.

Do not start Phase 2 in the same production push. Treat Phase 2 as the next separate weather polish package:

- v011 screenshot-proof dates and threshold summary near scrubber
- night/time-of-day filtering
- optional gust trend arrows
- raw met.no link cleanup/debug-only decision

---

## Localhost checks for Stebbi

If Stebbi wants one final confidence pass before/after Vercel:

1. Open `/auth-mvp/vedrid` on localhost.
2. Calculate a route with multiple points, e.g. Garðabær -> Þorlákshöfn.
3. Select a non-default departure slot.
4. Open `Spá 🥄` from the map point panel.
5. Expected: highlighted forecast row matches the selected slot/ETA, not the default summary time.
6. Open `Spá 🥄` from a row under `Allir spápunktarnir á leiðinni`.
7. Expected: same active-slot highlight behavior.
8. Open destination arrival forecast.
9. Expected: destination forecast row highlights arrival forecast time.
10. Test mobile width around 390 px.
11. Expected: drawer opens/closes cleanly and no horizontal overflow.

No SQL, RLS, auth, Supabase, secrets or migrations are involved in #75 Phase 1.

---

## Codex conclusion

Phase 1 looks okay after the v010 fixes, subject to Vercel build/deploy verification.

Next action should be release verification and TODO/DONE cleanup, not Phase 2 implementation in the same breath.
