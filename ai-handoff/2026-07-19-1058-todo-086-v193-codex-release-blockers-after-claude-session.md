# 2026-07-19 10:58 - TODO 086 - Release blockers after Claude session handoff

Created: 2026-07-19 10:58
Timezone: Atlantic/Reykjavik

## Context

This handoff follows:

- `2026-07-19-1050-todo-086-claude-session-handoff.md`
- Codex review of that handoff and current code state

Goal: fix the remaining release blockers before Stebbi asks for commit/push/deploy.

Do not treat this file as permission to commit, push, deploy, run SQL, or change production. If Stebbi sends this with `Workflow`, Claude Code may implement the scoped repo changes only, but migrations and deploy still require separate explicit approval.

## Highest-priority fixes before release

### 1. Fix threshold save side effect on `/vedrid`

Current issue:

- `WeatherOverviewClient.tsx` passes `onApply` that both applies local thresholds and calls `handleSaveAsDefault`.
- `WeatherThresholdBar.tsx` in `alwaysOpen` mode calls `onApply` automatically while the user types, once values are valid.
- Result:
  - public users can be redirected to login just by typing a threshold value
  - authenticated users can write to `weather_user_preferences` repeatedly while typing
  - the button label says "Vista sem sjálfgefin vindmörk", but the save is not limited to a deliberate click

Desired behavior:

- Editing `Óþægilegt` / `Hættulegt` updates the current `/vedrid` map thresholds automatically when the input is valid.
- Saving defaults happens only when the user explicitly clicks the save-default button.
- Public users must never be redirected while typing. Redirect to `/innskraning?...` only after clicking the save-default button.
- Authenticated users must not write to Supabase on every valid keystroke.

Suggested implementation:

- Split the threshold bar contract:
  - local threshold apply: existing `onApply`
  - explicit save default: new optional prop such as `onSaveDefault`
- In `WeatherThresholdBar` `alwaysOpen` mode:
  - input `onChange` keeps calling `onApply` for valid values only
  - the bottom button validates draft values and then calls `onSaveDefault` if provided
  - for backward compatibility, collapsible/default mode can keep existing apply behavior unless this split is easy to make shared
- In `WeatherOverviewClient`:
  - `onApply` should only call `setOverrides`
  - pass `onSaveDefault={handleSaveAsDefault}`

Acceptance criteria:

- Typing valid values changes the map immediately.
- Typing does not call `/api/teskeid/weather/preferences/thresholds`.
- Typing does not redirect a public user.
- Clicking "Vista sem sjálfgefin vindmörk" or "Uppfæra sjálfgefin vindmörk" is the only path that saves or redirects.

### 2. Add production Vegagerðin cron to `vercel.json`

Current issue:

- Production is showing Vegagerðin as gray/stale.
- `app/api/cron/warm-vegagerdin/route.ts` exists.
- `vercel.json` currently schedules only:
  - `/api/cron/cleanup-chats`
  - `/api/cron/warm-vedurstofan`
- It does not schedule `/api/cron/warm-vegagerdin`.

Required repo change:

```json
{
  "path": "/api/cron/warm-vegagerdin",
  "schedule": "*/3 * * * *"
}
```

Important release notes:

- This repo change does not activate cron until a production deploy happens.
- Confirm production `CRON_SECRET` exists before deploy.
- Confirm the active Vercel plan supports a 3-minute cron schedule. If not, use the fastest supported schedule and document the tradeoff.
- Confirm `sql/83_vegagerdin_measurements_history.sql` has been run in production if history fallback is expected.
- Vercel cron has no retry guarantee and can overlap, so the endpoint must stay idempotent. It already appears guarded by cache freshness, but re-check before release.

### 3. Make saved wind thresholds behave like real defaults or change the copy

Current issue:

- The code loads `savedDefaultThresholds` from `/api/teskeid/weather/preferences/thresholds`.
- Loaded values currently affect the button label only.
- They do not auto-fill or auto-apply the visible threshold controls after page load.

Stebbi has been asking for default values, so the preferred fix is:

- When authenticated GET returns saved thresholds, call `setOverrides({ cautionWindMs, redWindMs })`.
- The visible inputs should update to the saved values because `WeatherThresholdBar` syncs draft values from `thresholds` in `alwaysOpen` mode.

If Claude Code sees a reason not to auto-apply, stop and ask Stebbi before implementing. Do not silently keep a "default" that is only a stored preset.

Dependency:

- Requires `sql/82_weather_user_preferences.sql` in any environment where this should work.

### 4. Refetch exact route-memory lookup when returning from `/ferdalagid`

Current issue:

- `RouteMemoryPicker` refetches available places/destinations on focus/visibility.
- But `WeatherOverviewClient` route-memory lookup for the selected pair runs only when `fromMemoryPlace?.key` or `toMemoryPlace?.key` changes.
- If Stebbi has `/vedrid` open, goes to `/ferdalagid`, warms a new route variant for the same pair, and returns, `/vedrid` may still show stale variants until the pair changes or the page hard reloads.

Desired behavior:

- When both from/to are selected, refetch `/api/teskeid/weather/route-memory/lookup` on:
  - `window.focus`
  - `document.visibilitychange` when visible
  - ideally `pageshow` as well, to catch browser back/forward cache cases
- Keep selected variant stable if it still exists after refetch.
- If selected variant no longer exists, fall back to `all`.
- Reset to `all` only on actual pair change, not every focus refetch.
- Avoid event listener leaks and avoid overwriting newer pair data with stale fetches.

This is the fix that should make route-variant pills show up after Stebbi creates a new route on localhost and returns to `/vedrid`.

## Not release blockers unless Stebbi explicitly asks

### Varasöm leið metadata

This still needs a new migration, likely `sql/87_weather_route_memory_route_cautions.sql`, before `/vedrid` route pills can show `Varasöm leið` truthfully.

Do not fake caution pills from labels alone.

Expected future shape:

- Add `route_caution_ids text[] not null default '{}'` to `weather_route_memory_routes`.
- Update route-memory writer to persist caution IDs from route options.
- Update lookup API and UI types to return caution IDs.
- Show caution state in route variant pills only when DB metadata says so.
- Add SQL/static tests and UI/manual checks.

This is valuable, but not required for the immediate release if Stebbi wants to stop feature creep.

### `/ferdalagid` threshold buttons

Claude handoff says `/ferdalagid` threshold step buttons were deferred. Keep deferred unless Stebbi explicitly asks.

## Files likely involved

- `components/weather/WeatherThresholdBar.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `vercel.json`
- Possibly `messages/is.json`
- Possibly `messages/en.json`
- Existing API route to verify, probably no change needed:
  - `app/api/teskeid/weather/preferences/thresholds/route.ts`
  - `app/api/cron/warm-vegagerdin/route.ts`
  - `app/api/teskeid/weather/route-memory/lookup/route.ts`

Do not edit `sql/86_weather_route_memory.sql` if it has already been run anywhere. If caution metadata is implemented later, create a new numbered migration.

## Commands Codex already ran during review

These passed locally:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts
```

Results:

- TypeScript: pass
- Vitest targeted suite: 3 files passed, 69 tests passed

Claude Code should rerun relevant checks after any changes.

## Migration guidance for Stebbi

Do not run SQL from this handoff automatically.

For the current release:

- `sql/82_weather_user_preferences.sql`: required before relying on saved user wind thresholds.
- `sql/83_vegagerdin_measurements_history.sql`: required for Vegagerðin history fallback.
- `sql/86_weather_route_memory.sql`: required for route-memory picker/filtering.
- `sql/85_route_observation_aggregate.sql`: do not run. It was previously marked draft/not ready.
- `sql/87`: does not exist yet. Only needed if Stebbi explicitly asks for `Varasöm leið` metadata now.

If any production migration is needed, Claude Code must state exact order, effects on schema/data/RLS/auth/grants, rollback, and whether it is safe to run before Stebbi approves.

## Route intelligence check

- Route-family affected: all `/vedrid` route-memory pairs and `/ferdalagid` warmed variants.
- Provider-neutrality: route-memory should continue storing normalized place keys/labels plus provider station IDs only. No raw Google geometry, no raw Google place IDs, no user IDs.
- Google cost: this handoff should not add new Google calls. The route-memory refetch should hit only Teskeið/Supabase-backed APIs.
- IcelandRoadmap: no `IcelandRoadmap.md` update is required for the immediate hotfixes because they do not add new road/domain knowledge. If caution metadata is implemented, update/verify the relevant IcelandRoadmap route caution story and tests.
- Privacy: keep aggregate route memory, not personal trip history.

## Design check

Relevant `Design.md` constraints:

- Mobile-first app feel.
- Inputs must remain at least 16px to avoid iOS zoom.
- Buttons should be deliberate, clear actions, not surprising side effects.
- Navigation/login redirect needs to be visibly caused by a user action, not typing.
- Avoid layout shift and keep controls stable.

The threshold fix is mostly a behavior/accessibility issue, not a visual redesign. Keep styling changes minimal.

## Suggested implementation order

1. Fix `WeatherThresholdBar` / `WeatherOverviewClient` split between local threshold apply and explicit save default.
2. Make saved thresholds auto-apply on authenticated load, or stop and ask Stebbi if Claude Code disagrees.
3. Add route-memory lookup refetch for same selected pair on focus/visibility/pageshow.
4. Add `/api/cron/warm-vegagerdin` schedule to `vercel.json`.
5. Run type-check and relevant tests.
6. Hand off to Codex/Stebbi before commit, push, deploy, or migration.

## Localhost checks for Stebbi

### Threshold typing and saving

Setup:

- Open `/auth-mvp/vedrid`.
- Test once logged out/public and once logged in.

Steps:

1. Change `Óþægilegt` and `Hættulegt`.
2. Expected: map/pills update immediately when the pair is valid.
3. Expected: no login redirect while typing.
4. Expected: no save request is made while typing.
5. Click `Vista sem sjálfgefin vindmörk` as public user.
6. Expected: only then redirect to login with return to `/vedrid`.
7. After login, expected: values are saved, applied, and URL cleanup happens.
8. Logged-in refresh expected: saved values load into the visible fields and apply to map statuses automatically.

Regression to watch:

- Invalid values, equal values, or reversed values should not save.
- iOS/mobile should not zoom on input focus.
- Button should not jump width while labels change.

### Route-memory variants refresh

Setup:

- Have `/auth-mvp/vedrid` open with a known route pair, for example Reykjavík -> Egilsstaðir.
- In another tab or flow, use `/auth-mvp/vedrid/ferdalagid` to calculate/warm an additional variant for the same pair.

Steps:

1. Return/focus `/auth-mvp/vedrid`.
2. Expected: route-memory lookup refreshes without hard reload.
3. Expected: `Allar leiðir` plus per-route pills appear if more than one stored variant exists.
4. Select each variant.
5. Expected: map narrows to that variant's exact Veðurstofan and Vegagerðin station IDs.
6. Select `Allar leiðir`.
7. Expected: map returns to the union across all variants.

Regression to watch:

- Variant selection should not reset on every focus if the selected variant still exists.
- Single-place filtering should still work when only `Frá` is chosen.
- No station card should open just because a pill was clicked.

### Vegagerðin production readiness

Localhost cannot fully prove Vercel cron.

Before production deploy:

1. Confirm `vercel.json` contains `/api/cron/warm-vegagerdin` on `*/3 * * * *`.
2. Confirm `CRON_SECRET` exists in production Vercel env.
3. Confirm Vercel plan supports this cron frequency.
4. Confirm `sql/83` has been run if history fallback is expected.

After approved deploy:

1. Watch Vercel cron/logs for `/api/cron/warm-vegagerdin`.
2. Open production `/vedrid`.
3. Expected after a few minutes: Vegagerðin is not gray/stale when upstream/cache are healthy.

Do not manually hammer `/ferdalagid` route calculations in production for testing; Google cost is real.

## Questions for Claude Code to answer in the next handoff

1. Was the threshold save side effect fully removed?
2. Do saved authenticated thresholds auto-apply on `/vedrid` page load?
3. Does route-memory lookup refetch for the same selected pair after focus/visibility/pageshow?
4. Was `warm-vegagerdin` added to `vercel.json` only, with no deploy?
5. Which migrations are required before Stebbi can safely test this in production?
6. What exact tests were run, with exit codes?

## Óvissa / þarf að staðfesta

- Codex did not inspect network traces, so the "save request while typing" issue is inferred from component code, not browser devtools.
- Codex did not verify which SQL migrations have already been run in production.
- Codex did not deploy or inspect Vercel production settings.
