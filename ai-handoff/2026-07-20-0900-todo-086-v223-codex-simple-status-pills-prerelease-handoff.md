# TODO 086 / v223 - Codex pre-release handoff - simple status pills

**Created:** 2026-07-20 09:00 Atlantic/Reykjavik  
**Agent:** Codex  
**Related files:** `/vedrid`, status filter pills, overview weather UI  
**Purpose:** Handoff for Claude Code to review and, if acceptable, release.

## Summary

Stebbi asked for a simpler `/vedrid` view for normal users. The current detailed status pills are useful for data-heavy users, but the intermediate states such as `Nálgast óþægindi` and multiple forecast/status distinctions make the page feel too complex.

Implemented a small UI change:

- `/vedrid` defaults to `Einfalt`.
- `Einfalt` shows exactly three status filter pills:
  - `Innan marka`
  - `Óþægilegt`, grouping `nalgast-othaegindi` + `othaegilegt`
  - `Hættulegt`, grouping `nalgast-haettumork` + `haettulegt`
- `Nákvæmt` restores the previous detailed pill list.
- The selected view is saved in `localStorage`, not Supabase.

No SQL, migration, auth, RLS, service-role, cron, commit, push, deploy, or production change was performed by Codex.

## What Was Already In The Worktree

Claude's previous v222 work was already present before Codex started:

- `components/weather/WeatherOverviewClient.tsx`
  - `findNearestStations` import.
  - Nearby Vegagerðin rows inside Veðurstofan station detail.
  - `NearbyVegagerdinEntry` and `NearbyVegagerdinRow`.
- `messages/is.json`
- `messages/en.json`
  - nearby Vegagerðin translation keys.

Codex did not revert or intentionally modify those changes, but this handoff includes them because they are in the same files and will be part of the release unless separated.

## What Codex Changed

### `components/weather/WindStatusFilterPills.tsx`

Added:

- `WindStatusFilterMode = 'simple' | 'detailed'`
- Simple pill groups:
  - `innan-marka`
  - `nalgast-othaegindi + othaegilegt`
  - `nalgast-haettumork + haettulegt`

Behavior:

- `mode="detailed"` preserves existing behavior for shared callers.
- `mode="simple"` always renders the three main pill groups, even when count is 0.
- Clicking a grouped pill toggles every underlying status in that group.
- Counts are summed across the grouped statuses.
- The pill's visual metadata comes from the main status:
  - `Innan marka` uses green metadata.
  - `Óþægilegt` uses orange metadata.
  - `Hættulegt` uses red warning metadata.

### `components/weather/WeatherOverviewClient.tsx`

Added:

- `STATUS_FILTER_MODE_STORAGE_KEY = 'teskeid:vedrid:status-filter-mode'`
- `statusFilterMode` state, defaulting to `simple`
- `localStorage` read on mount
- `handleStatusFilterModeChange()` with localStorage persistence
- Small segmented control above the status pills:
  - `Einfalt`
  - `Nákvæmt`
- `WindStatusFilterPills mode={statusFilterMode}`

Important product note:

- This only changes pill grouping. It does not change the existing `visibleStatuses` default.
- Current default still starts from `DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES`, which excludes `innan-marka`, `no_data`, and `no_wind_data`.
- Therefore, in simple mode the `Innan marka` pill is visible, but may appear inactive/dim until selected or until `Sýna allt` is used.
- Claude should explicitly decide whether this is acceptable, or whether simple mode should default to all three categories active.

### `messages/is.json`

Added:

- `statusFilterModeAriaLabel`: `Veldu sýn fyrir veðursíur`
- `statusFilterModeSimple`: `Einfalt`
- `statusFilterModeDetailed`: `Nákvæmt`

### `messages/en.json`

Added:

- `statusFilterModeAriaLabel`: `Choose weather filter view`
- `statusFilterModeSimple`: `Simple`
- `statusFilterModeDetailed`: `Detailed`

## Files Changed In Worktree

Application files currently modified:

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `messages/is.json`
- `messages/en.json`

Other unrelated worktree state:

- `.obsidian/workspace.json` is modified and unrelated. Codex did not touch it.
- Several older `ai-handoff/*.md` files are untracked from previous collaboration steps.

New handoff file added by Codex:

- `ai-handoff/2026-07-20-0900-todo-086-v223-codex-simple-status-pills-prerelease-handoff.md`

## Commands Run

Read/context commands:

- `Get-Content -Encoding UTF8 "ai-handoff/2026-07-20-0851-todo-086-v222-claude-v221-done-prerelease.md"` - exit 0
- `git status --short` - exit 0, with warnings about inaccessible global git ignore under `C:\Users\Lenovo/.config/git/ignore`
- `rg -n "Nálgast|Nalga|Innan marka|Óþægilegt|Hættulegt|Engar vindmælingar|visibleStatuses|outboundVisibleStatuses|returnVisibleStatuses|status" components app lib messages/is.json messages/en.json` - exit 0, output was large/truncated
- `Get-Content` snippets from:
  - `components/weather/WindStatusFilterPills.tsx`
  - `components/weather/windStatusUi.ts`
  - `components/weather/WeatherOverviewClient.tsx`
  - `lib/weather/windDisplayStatus.ts`
  - `messages/is.json`
  - `messages/en.json`
  - `components/weather/WeatherOverviewShell.tsx`
- `rg -n "WindStatusFilterPills|DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES|visibleStatuses" lib components app --glob "*.test.ts" --glob "*.test.tsx"` - exit 0
- `git diff -- components/weather/WindStatusFilterPills.tsx components/weather/WeatherOverviewClient.tsx messages/is.json messages/en.json` - exit 0
- `Get-ChildItem -File ai-handoff | Sort-Object LastWriteTime -Descending | Select-Object -First 10 Name,LastWriteTime,Length` - exit 0
- `Get-Date -Format "yyyy-MM-dd HH:mm"` - exit 0

Validation commands:

- `npm run type-check` - exit 0
- `npm run build` - exit 0
- `npm run test:run` - exit 1

## Validation Results

### Passing

`npm run type-check`

- Exit 0
- `tsc --noEmit` passed.

`npm run build`

- Exit 0
- Next.js production build completed successfully.
- Existing lint warnings remain, including dependency warnings in `WeatherOverviewClient.tsx`, `TravelAuditMap.tsx`, and image/ref warnings elsewhere.
- No new build-blocking issue from the simple/detailed status pill change.

### Failing

`npm run test:run`

- Exit 1
- 118 test files ran.
- 116 passed.
- 2 failed.
- 7 tests failed total.

Failures seen:

1. `lib/__tests__/log-safety.test.ts`
   - Fails on existing `console.error(..., error.code)` style in:
     - `app/api/teskeid/weather/preferences/thresholds/route.ts`
   - Lines reported:
     - 39
     - 92
     - 108
   - This does not appear related to the simple status pill change.

2. `lib/__tests__/weather-conditions-feed-preview-api.test.ts`
   - 6 failures.
   - Tests expect repository call target types to be only:
     - `['vegagerdin_station']`
   - Actual includes:
     - `['vegagerdin_station', 'vedurstofan_station']`
   - This appears related to recent conditions-feed/Veðurstofan pulse changes, not to simple status pill grouping.

Claude should decide whether to fix those tests before release or accept that they are known pre-existing failures.

## Review Notes For Claude

### 1. Confirm Simple Mode Default Semantics

Current implementation:

- Default view mode is `simple`.
- Default status filter remains action-focused via `DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES`.
- Green `Innan marka` pill is shown in simple mode, but is not active by default unless the user selects it or clicks `Sýna allt`.

Potential product question:

- Should simple mode instead default to all three groups active so normal users see green/orange/red as a complete map view?

Codex left existing filter behavior unchanged to keep blast radius small.

### 2. Check Group Toggle Behavior

In simple mode:

- Clicking `Óþægilegt` toggles both `nalgast-othaegindi` and `othaegilegt`.
- Clicking `Hættulegt` toggles both `nalgast-haettumork` and `haettulegt`.

If the underlying `visibleStatuses` set is partially grouped due to a previous detailed-mode selection, the pill is considered active if any child status is active. Clicking it then clears all child statuses. This is simple and predictable enough, but Claude should sanity-check it.

### 3. Check Interaction With `Sýna allt`

Current semantics are unchanged:

- Empty `visibleStatuses` means no filter, show all.
- `Sýna allt` still resets to `new Set()`.

In simple mode that means all markers are shown, while all three grouped pills are visually in the no-filter state rather than individually active. This is existing component behavior, but it may be worth reviewing visually.

### 4. Check Shared Callers

`WindStatusFilterPills` is shared beyond `/vedrid`.

Codex set `mode = 'detailed'` as the component default, so existing shared callers should keep old detailed behavior unless they explicitly pass `mode="simple"`.

Claude should verify no other caller unintentionally needs the new simple mode.

### 5. Mobile/UI Review

The segmented control is intentionally tiny and placed directly above the pills.

Review on 390 px mobile:

- It should not cause horizontal overflow.
- It should not visually compete too much with the route pills or map controls.
- It should feel like a display preference, not another weather status pill.

## Supabase / Auth / RLS / Production Impact

No Supabase schema, SQL, RLS, auth, grants, service-role function, cron, or production data behavior was changed.

The only persistence added is browser `localStorage`:

- Key: `teskeid:vedrid:status-filter-mode`
- Values: `simple` or `detailed`
- Scope: local browser only.
- No network request.
- No user data.
- No privacy-sensitive value.

No migration is required.

## Localhost Checks For Stebbi

Before release, Stebbi should test locally.

Page:

- `/vedrid`
- Also check `/auth-mvp/vedrid` if using the authenticated path.

Setup:

- Use a normal desktop viewport and a mobile viewport around 390 px.
- Test both Vegagerðin `Núna` and Veðurstofan forecast mode if available.
- If route-memory filter is active, also test with no selected route.

Checks:

1. Open `/vedrid`.
2. Expected:
   - `Einfalt` is selected by default unless localStorage already has `detailed`.
   - Exactly three status pills are visible:
     - `Innan marka`
     - `Óþægilegt`
     - `Hættulegt`
   - No `Nálgast óþægindi` or `Nálgast hættumörk` pill is visible in simple mode.
3. Click `Nákvæmt`.
4. Expected:
   - Detailed status pills return, including `Nálgast óþægindi` and `Nálgast hættumörk` when they have counts.
5. Reload page.
6. Expected:
   - Last selected mode persists via localStorage.
7. Switch back to `Einfalt`.
8. Click `Óþægilegt`.
9. Expected:
   - Map filters both near-discomfort and uncomfortable stations together.
   - Count equals the sum of those two detailed statuses.
10. Click `Hættulegt`.
11. Expected:
   - Map filters both near-danger and dangerous stations together.
   - Count equals the sum of those two detailed statuses.
12. Click `Sýna allt`.
13. Expected:
   - Map shows all statuses.
   - The three simple pills remain visible.
14. Mobile check at 390 px:
   - No horizontal overflow.
   - Segmented control and pills wrap cleanly.
   - Map and source selector do not overlap the pills.

Do not test production SQL, cron, RLS, or deployment from this change. None of that is required.

## Suggested Next Step

Claude Code should review:

1. The grouped pill behavior in `WindStatusFilterPills`.
2. The `/vedrid` placement and localStorage persistence in `WeatherOverviewClient`.
3. The product question: should simple mode default to all three groups active?
4. The unrelated failing tests and whether to fix them before release.

If Claude finds no issues and Stebbi approves, this can be released together with the existing v222 work.
