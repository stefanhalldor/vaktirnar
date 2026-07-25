# TODO-091 v029: Public default hydration fix

**Created:** 2026-07-25 06:51 (Atlantic/Reykjavik)  
**Agent:** Codex  
**Status:** Implemented locally; review this together with v028 before release

## 1. Plan

Fix the state transition that prevented the five v028 defaults from being
selected for public users, add regression coverage, and validate the build.

## 2. What was actually done

The preferences request correctly returned no usable payload for a public
user, but the component only marked hydration complete. It left
`weatherChasePreferenceItems` as `null`, whose meaning is “still loading”.
Consequently `weatherChaseInitialSelectedIds` also remained `null` forever.

For a public user, the hydration effect now sets
`weatherChasePreferenceItems` to `[]` before finishing when:

- the preferences request returns `401` or another non-OK response;
- the response is absent or malformed;
- `hasPreferences` is not true;
- normalization unexpectedly fails;
- the request throws.

An empty array means “hydrated, with no saved selection” and therefore
activates the five v028 defaults. A valid saved server payload is unchanged and
still takes precedence. For an authenticated user, a failed or malformed read
does not become `[]`; only an explicit `hasPreferences: false` response
activates defaults. This prevents a transient read failure from being
misinterpreted and autosaved over an existing server selection.

## 3. Files inspected

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- `ai-handoff/2026-07-25-0058-todo-091-v028-codex-public-metno-defaults-and-recovery.md`

## 4. Files changed

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- `ai-handoff/2026-07-25-0651-todo-091-v029-codex-public-default-hydration-fix.md`

This is additive to all v028 files. Unrelated dirty-tree changes were not
modified or reverted.

## 5. Commands run

- `npm run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-metno-point-route.test.ts`
  - Exit 0; 2 files and 7 tests passed.
- `npm run type-check`
  - Exit 0.
- `npm run build`
  - Exit 0; existing lint warnings remain.
- `git diff --check`
  - Exit 0; existing line-ending warnings only.

## 6. Results

The public no-preferences path now leaves loading state and applies:

1. Hella
2. Reykjavík
3. Vestmannaeyjabær
4. Egilsstaðir
5. Ísafjörður

The new regression test verifies that `WeatherChasePanel` applies defaults
when hydration transitions from `null` to a resolved default selection.

## 7. What failed or was skipped

- No command failed.
- The full test suite was not rerun because v028 had already established the
  unrelated `unstable_cache` failures. Focused tests, type-check, and production
  build were rerun after this correction.
- No browser automation was run; Stebbi owns the localhost server.
- No commit, push, deploy, SQL, migration, Supabase, or production action was
  performed.

## 8. Decisions taken

- Preserved the semantic distinction:
  - `null` = preferences are still loading;
  - `[]` = preferences finished loading and there is no saved selection.
- Applied the same terminal empty state to malformed and temporarily failed
  reads so the UI does not remain unusable. This does not persist defaults or
  overwrite server data.

## 9. Remaining risk

- A temporary preferences API failure for an authenticated user leaves the
  selection unresolved rather than risking an overwrite. The UI may therefore
  show no selected places until a reload succeeds; a dedicated retry state can
  improve this later.
- Production behavior still needs manual verification in a signed-out browser.
- v028's unrelated full-suite `unstable_cache` failure remains open.

## 10. Suggested next step

Claude Code should review v028 and v029 as one release unit, pay particular
attention to the authenticated temporary-failure/autosave risk, then request
Stebbi's separate permission before commit, push, or deployment.

## 11. Questions for Claude Code review

1. Confirm that the authenticated failure branch now leaves
   `weatherChasePreferenceItems === null`, preventing selection initialization
   and autosave.
2. Should non-OK responses distinguish `401` from transient `5xx` for signed-in
   users, while still guaranteeing a usable public screen?

## 12. Supabase / data / auth impact

- No SQL, migration, RLS, grants, policies, auth records, or data writes.
- No public data persistence or localStorage was added.
- This changes only client interpretation of an absent/failed preferences read.
- Valid authenticated server preferences remain authoritative.

## Localhost checks for Stebbi

Use the existing localhost server.

### Public default opening

1. Open a new private/incognito browser with no Teskeið session.
2. Visit `/auth-mvp/vedrid/road-map-prototype`.
3. Open `Spágögn`.
4. Expected: Hella, Reykjavík, Vestmannaeyjabær, Egilsstaðir and Ísafjörður
   appear without selecting anything manually.
5. Expected: the first three show Veðurstofa Íslands and the last two show
   Yr / met.no; met.no values load progressively as described in v028.

### Authenticated regression

1. Sign in with a user who has a different saved station selection.
2. Open and reload `Spágögn`.
3. Expected: the user's saved selection appears, not the five defaults.
4. Temporarily block the preferences GET only if using a disposable/local test
   account; confirm the UI remains usable, then unblock it before changing any
   selection.

Do not deliberately test failed preference reads with an important production
account until Claude Code has reviewed the autosave edge case. Do not deploy,
change Supabase, auth, production data, secrets, or billing without separate
explicit permission.
