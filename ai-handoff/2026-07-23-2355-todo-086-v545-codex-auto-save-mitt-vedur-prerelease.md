# TODO-086 v545 - Codex handoff: auto-save Mitt veður

Created: 2026-07-23 23:55  
Timezone: Atlantic/Reykjavik

## Skilningur á samþykki

Stebbi explicitly authorized Codex to review
`2026-07-23-2347-todo-086-codex-auto-save-mitt-vedur-plan`, implement the
scoped change, verify it, and create a handoff.

Authorized and performed:

- scoped code and test changes
- local type-check, tests, and production build
- this handoff

Not authorized and not performed:

- commit
- push
- deploy
- migration execution
- Supabase/production action

## Review of the proposed plan

Codex did not follow the proposed SQL-column plan unchanged.

The proposed `visible_hours` JSONB column would have required:

- a migration
- coordinated schema-before-code rollout
- missing-column fallback behavior
- another preference field beside an existing JSONB preference document

The existing `criteria` column is already a JSONB preference document. Codex
therefore stores `visibleHours` inside that JSON object while continuing to
return it as a separate API response/payload field. This is backward-compatible
with existing rows and requires no schema change.

The authenticated prototype route is guarded by `guardTeskeidSession()`.
Therefore an unauthenticated user cannot currently render this component or see
the manual save button. Codex still added an explicit `isAuthenticated`
component contract:

- current guarded page passes `true`
- authenticated users get silent auto-save and no manual button
- a future unauthenticated consumer can omit/false the prop and retain the
  existing manual save → login → return flow

## What was implemented

### Shared visible-hour validation

New file: `lib/weather/chasePreferences.ts`

- Defines the canonical allowed hours: `0, 3, 6, 9, 12, 15, 18, 21`.
- Exports the typed `WeatherChaseVisibleHour`.
- Normalizes unknown input by:
  - keeping only allowed numeric hours
  - removing duplicates
  - sorting ascending
  - falling back to `[12]` if missing/empty/invalid

### API persistence without migration

File: `app/api/teskeid/weather/preferences/chase/route.ts`

GET:

- Continues selecting `selected_items, criteria`.
- Reads `criteria.visibleHours`.
- Returns normalized `visibleHours` as a top-level response field.
- Existing rows without the property return `[12]`.

PUT:

- Validates top-level `input.visibleHours`.
- Stores `{ ...criteria, visibleHours }` in the existing `criteria` JSONB column.
- Returns normalized `visibleHours`.

Existing selected-item and numeric-criteria validation remains unchanged.

### Controlled hour selection

File: `components/weather/WeatherChasePanel.tsx`

- `visibleHours` is now controlled by `RoadMapPrototypeMap`.
- Removed duplicated local visible-hours state.
- Toggle behavior still prevents deselecting the final visible hour.
- Adding an hour still synchronizes the map scrubber through `onHourSelect`.
- Manual-save payload now includes `visibleHours`.
- Exported the existing item-to-preference mapper for reuse by auto-save.

### Authenticated auto-save

File: `components/weather/RoadMapPrototypeMap.tsx`

- Added `isAuthenticated?: boolean`, defaulting to `false`.
- Preference payload now includes `visibleHours`.
- Applying local/API/pending preferences restores:
  - selected places
  - criteria
  - visible comparison/scrubber hours
- Auto-save waits for both:
  - preference hydration to finish
  - the panel selection to initialize
- This prevents an empty/default mount payload from overwriting server
  preferences while GET is still running.
- Changes are debounce-saved after 1.2 seconds.
- Auto-save writes best-effort localStorage and then the existing authenticated
  API.
- Saves are serialized with a latest-queued payload so an older slow PUT cannot
  finish after a newer preference update.
- Auto-save is silent; it does not flash the old manual `saving/saved` status.
- Authenticated users do not receive `onSaveDefault`, so the manual button is
  hidden.

### Guarded page declares auth state

File: `app/auth-mvp/vedrid/road-map-prototype/page.tsx`

- Passes `<RoadMapPrototypeMap isAuthenticated />` after the existing session
  and feature-access guards.

### Tests

New file: `lib/__tests__/weather-chase-preferences.test.ts`

Three focused tests cover:

- filtering, deduplication, and sorting
- invalid values
- noon fallback

## Files inspected

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-23-2347-todo-086-codex-auto-save-mitt-vedur-plan.md`
- `app/api/teskeid/weather/preferences/chase/route.ts`
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- relevant auth guards, middleware, tests, and package scripts

## Files changed by this implementation

- `app/api/teskeid/weather/preferences/chase/route.ts`
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `lib/weather/chasePreferences.ts` (new)
- `lib/__tests__/weather-chase-preferences.test.ts` (new)
- `ai-handoff/2026-07-23-2355-todo-086-v545-codex-auto-save-mitt-vedur-prerelease.md` (new)

## Existing uncommitted work preserved

The worktree already contained uncommitted changes from Stebbi/Claude Code,
including:

- `.obsidian/workspace.json`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `messages/is.json`
- `messages/en.json`
- multiple untracked Claude handoffs from the current UI iteration
- the input auto-save plan

Codex layered the implementation onto the current component versions and did
not revert or overwrite the unrelated UI/message/handoff work. Because the two
weather components were already modified, their full `git diff` contains both
the prior work and this implementation.

## Commands and results

1. Scoped searches and file inspection
   - read-only, exit code 0.
2. `git diff --check`
   - exit code 0.
3. `npm.cmd run type-check`
   - exit code 0.
4. `npm.cmd run test:run -- lib/__tests__/weather-chase-preferences.test.ts`
   - exit code 0.
   - 1 file, 3 tests passed.
5. First parallel full-test/build attempt:
   - build compiled and passed type/lint, then failed during page-data collection
     because `.next/server/webpack-runtime.js` could not find temporary chunk
     `./5611.js`.
   - This was an artifact/race from running build concurrently, not a source
     compile error.
   - No files were deleted or cleaned.
6. `npm.cmd run test:run` rerun alone
   - exit code 0.
   - 130 test files passed.
   - 3580 tests passed, 27 skipped, 8 todo.
7. `npm.cmd run build` rerun alone without code or artifact cleanup
   - exit code 0.
   - production compile, type/lint, page generation, and build traces completed.
   - Existing lint warnings remain in unrelated files and older hooks, including
     existing `RoadMapPrototypeMap` dependency warnings.
8. Final scoped `git diff --check`
   - exit code 0.

No dev server was started or restarted.

## Supabase / SQL / auth / production impact

### SQL and migration

- No SQL file written.
- No migration written.
- No migration run.
- No schema change.

### Data

- On user interaction after release, the existing preference row is upserted
  through the existing endpoint.
- `criteria` JSON changes from, for example:

```json
{
  "minTemperatureC": null,
  "maxWindMs": 12,
  "maxPrecipitationMmPerHour": null
}
```

to:

```json
{
  "minTemperatureC": null,
  "maxWindMs": 12,
  "maxPrecipitationMmPerHour": null,
  "visibleHours": [6, 12, 18]
}
```

- Existing rows are not bulk-updated.
- Old rows remain readable and default to `[12]`.

### RLS, grants, auth, functions

- No RLS policy change.
- No grants change.
- No auth/session behavior change.
- No database function change.
- API continues resolving the current user and writing only that user's
  preference key through the existing server path.
- No secrets, email addresses, or user preference values are logged.

### Production

- No commit, push, deploy, production write, or external service action was
  performed.

## Design.md check

The change does not add a new screen or alter the current visual layout. It
removes the manual save action for authenticated users and reuses the existing
controls. Existing mobile input sizing, panel layout, keyboard handling, and
pending navigation behavior are unchanged.

No new loader is required because auto-save is background persistence rather
than navigation, and the user can continue interacting while it runs.

## Route intelligence check

- No route, segment, region, route-family, station-matching rule, control point,
  caution, cache key, or route fixture changed.
- Visible hours affect only weather comparison/scrubber presentation.
- No route history or precise origin/destination is stored.
- No update belongs in `IcelandRoadmap.md` or `lib/iceland-routes/`.

## Remaining risks

- There is no browser-level network test asserting the exact debounce/PUT
  sequence; localhost Network-tab verification remains important.
- Auto-save failure is intentionally silent for authenticated users. The latest
  payload remains in localStorage, but the UI does not currently show an offline
  or retry badge.
- The unauthenticated manual-save path is preserved in the component, but the
  current route is session-guarded, so that path cannot be exercised without a
  future public consumer or a product decision to expose the route.
- Multiple changes within the same 1.2-second window collapse into the latest
  payload by design.

## Localhost checks for Stebbi

Page:

`http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Setup:

- Sign in as a user with `road-intelligence-v1` access.
- Open browser DevTools Network and filter for
  `/api/teskeid/weather/preferences/chase`.
- Use a test account/preferences where overwriting the existing Mitt veður
  choices is acceptable.
- Do not test against another person's account or production data.

### Initial load safety

1. Reload the page.
2. Confirm GET completes before the first auto-save PUT.
3. Confirm existing selected places, criteria, and visible hours load without
   briefly being replaced by defaults.
4. Confirm the manual “Vista mitt veðurkort” button is absent.

Expected:

- no empty/default PUT before hydration
- saved state restored
- no manual save button for the authenticated route

### Selected places and ordering

1. Add a place.
2. Wait at least 1.2 seconds.
3. Confirm one PUT occurs.
4. Remove a place and wait again.
5. Reorder selected places and wait again.
6. Reload.

Expected:

- add/remove/order all restore after reload
- rapid changes within 1.2 seconds produce one latest-state PUT

### Criteria

1. Change temperature, wind, and precipitation criteria.
2. Make several rapid stepper changes.
3. Wait at least 1.2 seconds.
4. Reload.

Expected:

- one latest-state PUT after the rapid sequence
- all three criteria restore
- weather-row dimming still reflects the restored criteria

### Visible comparison and scrubber hours

1. Select a non-default combination such as `6`, `12`, and `18`.
2. Confirm the comparison table and lower map scrubber show the same chosen
   hours.
3. Wait for auto-save.
4. Reload.

Expected:

- `6`, `12`, and `18` restore in the settings
- comparison columns restore
- map scrubber slots restore
- attempting to remove the final selected hour remains blocked

### Queue/order check

1. Change a criterion and wait until its PUT starts.
2. Immediately change a selected place or visible hour.
3. Wait for requests to finish and reload.

Expected:

- the newest combined state wins
- an older slow request does not overwrite the newer state

### Failure behavior

1. If safe locally, use DevTools offline mode after the page has loaded.
2. Change preferences and wait.
3. Return online and reload.

Expected/current limitation:

- UI remains usable and does not navigate away
- latest state is retained in localStorage
- server sync is not visibly reported or automatically retried until another
  change triggers save

Do not casually alter Supabase, RLS, auth, migrations, production data, secrets,
billing, or deployment settings for these checks. No such action is needed.

## Suggested next step

Stebbi should complete the localhost checks, especially Network ordering and
reload restoration. Then send this handoff plus observations to Codex/Claude
Code for a final prerelease diff review.

Commit, push, and deploy require separate explicit permission.

## Óvissa / þarf að staðfesta

- Confidence: high for static correctness, validation, backward compatibility,
  and queue ordering.
- Confidence: medium-high for the React hydration timing until the localhost
  Network test confirms no default PUT precedes restored selection state.
- Product decision still needed if Stebbi wants unauthenticated users to reach
  Mitt veður today; the current route intentionally requires authentication, so
  hiding/showing a button alone cannot create that journey.
