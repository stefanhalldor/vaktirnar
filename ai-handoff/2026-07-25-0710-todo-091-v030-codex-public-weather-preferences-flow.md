# TODO-091 v030: Public weather-preferences flow

**Created:** 2026-07-25 07:10 (Atlantic/Reykjavik)  
**Agent:** Codex  
**Status:** Implemented locally; review together with v028–v029 before release

## 1. Plan

Improve the public first-use flow by opening settings, unifying place selection
and weather criteria, and providing a contextual save action after a place is
added without changing authenticated autosave behavior.

## 2. What was actually done

- Public users receive the settings drawer expanded by default.
- Authenticated users retain the previous collapsed default and autosave.
- Changed copy:
  - `Leita að stað` → `Bæta við stað`
  - criteria heading → `Stilla mínar veðurvæntingar`
  - `Vista mínar veðurstillingar` → `Vista mínar veðurvæntingar`
- Added the weather-preferences heading at the top of the drawer and above the
  three criteria controls so adding a place and defining criteria read as one
  flow.
- After a user explicitly adds a place:
  - the search closes rather than refocusing and reopening the mobile keyboard;
  - a secondary `Vista mína veðurspá` action appears directly below the
    comparison table;
  - the panel smoothly scrolls to that table-end action after React has added
    the new final row;
  - the action calls the exact same save handler and payload as the primary
    `Vista mínar veðurvæntingar` action.
- The drawer being initially open does not itself trigger smooth scrolling.
  Scroll only follows a user add action or a later manual drawer opening.
- Added equivalent English translations.

## 3. Files inspected

- `Design.md`
- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`

## 4. Files changed

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- `ai-handoff/2026-07-25-0710-todo-091-v030-codex-public-weather-preferences-flow.md`

All v028–v029 changes remain part of the same uncommitted release unit.
Unrelated dirty-tree changes were preserved.

## 5. Commands run

- `npm run type-check`
  - Exit 0.
- Focused tests:
  - `npm run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-metno-point-route.test.ts`
  - Initial post-change run: exit 0; 8 tests passed.
  - Final equivalent `npm.cmd` run: exit 0; 8 tests passed.
- First `npm run build`, launched concurrently with tests:
  - Exit 1 after successful compile/type validation due intermittent `.next`
    `PageNotFoundError` for `/_not-found`, `/admin`, and `/contacts`.
- `npm run build`, rerun alone with no code changes:
  - Exit 0.
- `git diff --check`
  - Exit 0; only existing line-ending warnings.
- One combined PowerShell command invoked `npm` after shell policy state had
  changed and PowerShell blocked `npm.ps1`; exit for the shell command was
  still 0 because later read-only commands completed. It was immediately
  replaced by the successful explicit `npm.cmd` test run above.

## 6. Results

- TypeScript passes.
- Focused behavior tests pass: 2 files, 8 tests.
- Production build passes when run alone.
- The new test verifies:
  - settings can start expanded;
  - adding a place produces the secondary save action;
  - scrolling is requested;
  - the secondary action sends both selected places through the same save
    callback.

## 7. What failed or was skipped

- The first build attempt hit the project's known `.next` concurrency failure;
  an unchanged standalone rerun passed.
- The full suite was not rerun. v028 records the unrelated
  `unstable_cache` Vitest failures.
- No browser automation was run because Stebbi owns the localhost server.
- No commit, push, deploy, SQL, migration, Supabase, auth, or production
  mutation was performed.

## 8. Decisions taken

- Used an explicit `defaultSettingsOpen` prop instead of inferring public state
  inside the reusable panel.
- The prop is passed as `!isAuthenticated`; save actions still depend on
  `onSaveDefault`, preserving the current auth boundary.
- The secondary save action is not shown on initial load. It appears only
  after a user adds a place, matching the requested contextual prompt.
- Smooth scrolling targets the action immediately below the comparison table.
  This keeps the newly appended last row and its save action together.
- Search is not refocused after add because that would compete with scrolling,
  reopen the mobile keyboard, and violate the intended app-like mobile flow.

## 9. Remaining risk

- Actual scroll positioning depends on the nested panel/overlay scroll
  container and must be verified on desktop and mobile.
- The same heading appears at the drawer top and directly over the criteria
  controls by request; visual review should confirm the repetition is useful
  rather than heavy.
- `saveStatus` is shared, so success/error feedback can appear beside both save
  locations when both are visible. Functionally correct, but visual review may
  prefer one feedback location.
- Existing unrelated hook/lint warnings remain in the build.

## 10. Suggested next step

Claude Code should review v028–v030 as one unit, then Stebbi should complete the
localhost checks below. Commit/push/deploy require separate explicit
permission.

## 11. Questions for Claude Code review

1. Does the nested desktop and mobile overlay honor `scrollIntoView` at the
   intended table end without scrolling the whole document unexpectedly?
2. Is the duplicated `Stilla mínar veðurvæntingar` heading visually desirable
   at both requested positions?
3. Should save feedback be rendered once even though two equivalent actions
   are now visible?

## 12. Supabase / data / auth impact

- No SQL, migration, RLS, grants, policies, auth records, or production data.
- Both public save actions use the existing `handleSaveWeatherChaseDefault`
  flow and identical payload.
- Public users are still directed through authentication for persistence.
- Authenticated users still use server-side autosave and do not receive the
  manual save actions.
- No localStorage persistence was introduced.

## Localhost checks for Stebbi

Use the existing localhost server.

### Public desktop

1. Open a private window at
   `/auth-mvp/vedrid/road-map-prototype`.
2. Open `Spágögn`.
3. Expected:
   - the five default places from v028–v029 appear;
   - `Breyta stöðum og stilla veðurvæntingar` is already expanded;
   - the page has not automatically jumped down merely because it opened;
   - `Stilla mínar veðurvæntingar` connects the add-place and criteria flow;
   - labels read `Bæta við stað` and
     `Vista mínar veðurvæntingar`.
4. Add a sixth place.
5. Expected:
   - it becomes the last comparison row;
   - the view smoothly moves to the bottom of the comparison;
   - `Vista mína veðurspá` appears below the table.
6. Click `Vista mína veðurspá`.
7. Expected: it behaves exactly like the existing primary save action and
   begins the sign-in/persistence flow.

### Public mobile

1. Repeat the flow at a narrow mobile viewport.
2. Expected:
   - no horizontal page overflow or browser zoom;
   - the keyboard closes after selecting a suggestion;
   - scrolling is smooth and ends with the final row/save action visible;
   - controls remain at least comfortably tappable.

### Authenticated regression

1. Sign in with a disposable/local test user with saved preferences.
2. Expected:
   - the settings drawer starts collapsed;
   - the user's saved places remain authoritative;
   - neither manual save action is shown;
   - changing places or criteria still autosaves.

Do not test production deployment, Supabase writes with important accounts,
auth changes, billing, secrets, or provider load without separate explicit
permission.
