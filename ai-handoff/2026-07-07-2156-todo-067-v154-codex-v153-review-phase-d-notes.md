# Codex review: todo-067 v154 - v153 Phase C shipped and Phase D saved places plan

Created: 2026-07-07 21:56:36
Timezone: Atlantic/Reykjavik
Reviewed handoff: `2026-07-07-2150-todo-067-v153-claude-phase-c-shipped-phase-d-plan.md`
Reviewed commit: `33283c1f01540dd8d982eacabb5f9e128c09a403`
Related TODO: todo-067, Ferðalagið / Veðrið

## Findings

1. **Low - Phase C same-port no-op is fixed in code, but still lacks direct automated coverage.**
   `app/auth-mvp/vedrid/FerdalagidClient.tsx:201-203` now returns early when the selected ferry port is clicked again, which addresses v152. The test suite passes, but there is no component/unit test that specifically proves "click selected Landeyjahöfn again keeps route options visible". This is acceptable for prerelease if Stebbi does the manual localhost check, but Claude Code should add a targeted regression test later if this flow keeps growing.

2. **Low - Phase D saved places plan should explicitly cap stored rows per user.**
   v153 correctly summarizes the RLS/API shape from v152, but it does not mention retention. Since every confirmed place selection may be saved, add a server-side cap such as "keep latest 50 places per user" after successful save/upsert. This prevents unbounded table growth and limits the privacy footprint. Displaying only 12 recent places is not the same as limiting stored rows.

3. **Low - Phase D should keep saved places optional inside `PlaceSearch`.**
   `PlaceSearch` is used by both the route wizard and older weather/question flows. Saved places should be added via optional props or a route-specific wrapper so the existing non-route weather flow does not unexpectedly show route saved places unless Stebbi explicitly wants that.

## Phase C review result

No blocking issues found in the committed Phase C state.

What I verified:

- `33283c1` is `HEAD -> main` and `origin/main`.
- Commit includes v148-v152 handoff docs and the Phase C code/tests.
- `handleFerryPortSelected` now has the same-port no-op.
- Ferry destination is sent to route/weather APIs as the selected port, not Vestmannaeyjar.
- Result copy shows that Herjólfur sailing conditions are not assessed.
- `isVestmannaeyjarDestination` is coordinate-only, avoiding mainland text false positives.
- Tests cover bbox positives/negatives and ferry port coordinates.

Remaining product sanity check:

- Stebbi should still visually verify Landeyjahöfn and Þorlákshöfn pins on the map before relying on this in production messaging.

## Phase D review result

The saved places direction is sound, with the additions above:

- Use `public.weather_saved_places`.
- RLS should be the hard boundary: `user_id = auth.uid()` for select/insert/update/delete.
- No anonymous access.
- No service-role in normal user flow.
- API routes should use the authenticated Supabase server client so RLS is exercised.
- `user_id` must always be set server-side and ignored from client input.
- Do not auto-save ferry picker ports unless the user explicitly searched/selected that place as a normal place.
- Add server-side saved-place retention cap.

Important workflow reminder:

- Writing the migration file is a code/schema-file change and needs explicit Phase D execution permission.
- Running the migration against Supabase needs a separate explicit migration/run approval from Stebbi.
- Commit, push, and deploy are also separate approvals.

## Commands run by Codex

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Content -Encoding UTF8 'Design.md' | Select-Object -First 260`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-07-2150-todo-067-v153-claude-phase-c-shipped-phase-d-plan.md'`
- `git status --short`
  - Exit code: 0.
  - Only tracked modification is prior `TODO.md`; v153 handoff is untracked locally.
- `git log --oneline -5`
  - Exit code: 0.
  - Confirms `33283c1` at HEAD.
- `git show --stat --oneline --decorate 33283c1`
  - Exit code: 0.
  - Confirms commit contents.
- `git show --name-only --format=fuller 33283c1`
  - Exit code: 0.
- `git diff --check`
  - Exit code: 0.
  - CRLF warning only for `TODO.md`.
- `npm run type-check`
  - Exit code: 0.
- `npm run test:run`
  - Exit code: 0.
  - 56 passed test files, 1809 passed tests, 27 skipped, 8 todo.
- `npm run build`
  - Exit code: 0.
  - Build succeeded.
  - Existing warnings:
    - `app/s/[sessionId]/page.tsx` hook dependency warnings
    - `components/landing/Avatar.tsx` `img` warning
    - `components/weather/TravelAuditMap.tsx` hook dependency warning
    - Browserslist data is stale

## Files inspected

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `Design.md`
- `ai-handoff/2026-07-07-2150-todo-067-v153-claude-phase-c-shipped-phase-d-plan.md`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `lib/weather/ferryPorts.ts`
- `lib/__tests__/ferryPorts.test.ts`

## Localhost checks for Stebbi

After pulling `33283c1`, Stebbi should test:

1. Open `/auth-mvp/vedrid` signed in with `vedrid` access.
2. Select `Reykjavík -> Vestmannaeyjar`.
3. Verify the Herjólfur ferry-port card appears.
4. Select `Landeyjahöfn`.
5. Verify route options appear and the route/map is now for driving to Landeyjahöfn.
6. Click `Landeyjahöfn` again.
7. Expected: nothing disappears, route options stay visible, and selected route remains stable.
8. Continue to result.
9. Expected: result says weather is for driving to Landeyjahöfn and does not assess Herjólfur sailing.
10. Go back and switch to `Þorlákshöfn`.
11. Expected: old Landeyjahöfn result is gone and route options recalculate for Þorlákshöfn.
12. Regression: `Reykjavík -> Selfoss` and `Garðabær -> Akureyri` show no ferry UI.

For Phase D, before implementation:

1. Do not run any Supabase migration until Stebbi explicitly approves it.
2. Treat saved places as private address/location data.
3. When implemented later, test with two different signed-in users to confirm one user cannot see or delete the other user's saved places.

## Files changed by Codex

- `ai-handoff/2026-07-07-2156-todo-067-v154-codex-v153-review-phase-d-notes.md`

Codex did not change app code, SQL, migrations, env vars, Supabase settings, Vercel settings, commits, pushes, or deployment.

## Óvissa / þarf að staðfesta

1. I did not independently verify the real-world ferry terminal coordinates against a live map during this review.
2. I did not inspect Vercel deployment status; local `npm run build` passed.
