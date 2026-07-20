# Codex Review: v234 prerelease

Created: 2026-07-20 12:08
Timezone: Atlantic/Reykjavik
Agent: Codex
Relevant TODO: 086
Reviewed handoff: `2026-07-20-1205-todo-086-v234-claude-v233-done-prerelease.md`
Review type: prerelease / release gate

## Findings

1. **No release-blocking code findings found for the v234 fix itself.**  
   Claude Code's v234 claim matches the code: `components/weather/WeatherOverviewClient.tsx:1004` and `components/weather/WeatherOverviewClient.tsx:1026` now classify the selected marker and return `null` when current status-filter hides it. `components/weather/IcelandOverviewMap.tsx:263` now closes the InfoWindow when the marker is missing or `!anchor.getVisible()`. This addresses the v233 medium finding.

2. **Medium / release hygiene - `.obsidian/workspace.json` is modified and should not ride along accidentally.**  
   `git status --short` shows `.obsidian/workspace.json` as modified. This looks like local editor state, unrelated to `/vedrid`. If Claude Code commits/pushes for release, this file should be excluded unless Stebbi explicitly wants it committed.

3. **Medium / repo-history gate - `sql/88_weather_user_preferences_status_filter_mode.sql` is still untracked locally.**  
   v234 says Stebbi has run SQL88 on production. The SQL file should still be included in the release commit for schema history, otherwise production DB and repo history drift. This is not a runtime blocker if SQL88 is truly already applied, but it is important release hygiene.

4. **Product-scope caveat - the unauthenticated `Nánar` -> login -> save preference flow is still not implemented.**  
   `components/weather/WeatherOverviewClient.tsx:141` to `components/weather/WeatherOverviewClient.tsx:155` updates local state/localStorage for everyone and only sends a DB `PUT` when `menuVariant === 'authenticated'`. There is no redirect to `/innskraning` and no pending sessionStorage save flow for public users. This was explicitly marked as "Ekki gert" in v227.  
   If Stebbi expects that flow in this release, hold release. If Stebbi accepts it as a follow-up, it is not a blocker for v234.

5. **Low - v234 handoff timestamp metadata is inconsistent.**  
   The handoff filename is `1205`, but the file says `Created: 2026-07-20 12:10`. During this review, local `Get-Date` returned `2026-07-20 12:08`, so the handoff appears to have an impossible/future timestamp. This is not a code blocker, but it violates the workflow timestamp rule and should be tightened for future handoffs.

## Release recommendation

**Release is acceptable for the v234 code path if Stebbi accepts the `Nánar` unauthenticated-login-save flow as a follow-up.**

Before commit/push/deploy:

- include `sql/88_weather_user_preferences_status_filter_mode.sql` in the commit if SQL88 has been run on production
- exclude `.obsidian/workspace.json` unless intentionally committing editor state
- do the quick localhost smoke checks below

If the release definition includes "public user clicks `Nánar` and gets sent through login so the preference saves to account", then do **not** release yet; ask Claude Code to implement that missing flow first.

## Commands run by Codex

- `Get-Content -Encoding UTF8 ai-handoff/2026-07-20-1205-todo-086-v234-claude-v233-done-prerelease.md` - exit 0
- `Get-Content -Encoding UTF8 ai-handoff/README.md` - exit 0
- `git status --short` - exit 0, with permission warnings for user-level git ignore
- `git diff --stat` - exit 0
- `git diff --check` - exit 0, only LF/CRLF warnings for `.obsidian/workspace.json` and `components/weather/WindStatusFilterPills.tsx`
- `npm run type-check` - exit 0
- `npm run test:run` - exit 0, 118 test files passed, 3428 tests passed, 27 skipped, 8 todo
- targeted `Get-Content` / `rg` inspections for `WeatherOverviewClient`, `IcelandOverviewMap`, `WeatherSourceTimeSelector`, `WindStatusFilterPills`, `windDisplayStatus`, `types`, SQL88, and messages
- `Get-Date -Format "yyyy-MM-dd HH:mm"` - exit 0, used for this filename and `Created`

## Files reviewed

- `ai-handoff/2026-07-20-1205-todo-086-v234-claude-v233-done-prerelease.md`
- `ai-handoff/2026-07-20-1015-todo-086-v227-claude-v226-done-prerelease.md`
- `ai-handoff/2026-07-20-1115-todo-086-v230-claude-v229-done-prerelease.md`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/IcelandOverviewMap.tsx`
- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `app/api/teskeid/weather/preferences/thresholds/route.ts`
- `lib/weather/windDisplayStatus.ts`
- `lib/weather/types.ts`
- `messages/is.json`
- `messages/en.json`
- `sql/88_weather_user_preferences_status_filter_mode.sql`
- `Design.md`
- `IcelandRoadmap.md`

## Files changed by Codex

- `ai-handoff/2026-07-20-1208-todo-086-v235-codex-v234-prerelease-review.md`

Codex did not change app code, SQL, production data, git, or deployment state.

## SQL / Supabase review

v234 states that SQL88 has been run by Stebbi. Codex did not verify production DB directly and did not run SQL.

`sql/88_weather_user_preferences_status_filter_mode.sql`:

- adds nullable `status_filter_mode text`
- constrains values to `null`, `simple`, or `detailed`
- does not alter RLS
- does not alter grants
- does not alter auth
- does not alter policies
- does not alter functions/triggers

The API has 42703 fallback, so code remains robust if a lower environment does not yet have SQL88.

## Design.md check

The v234 fix is aligned with the mobile/map guidance because it prevents disconnected overlays after filter changes. Remaining low design debt: the InfoWindow `Nánar` link still uses hardcoded `#2563eb` in `components/weather/IcelandOverviewMap.tsx:297`.

## Route intelligence check

This release does not add route intelligence or route-memory data. It changes `/vedrid` map filtering, marker callouts, weather-status display mode, and a user UI preference. No canonical route family, route segment, provider-station matching rule, caution ID, or cache key needs to be added to `IcelandRoadmap.md`. Privacy remains acceptable: SQL88 stores only a per-user display preference, not locations, routes, or station history.

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid` as an authenticated user with Veðurstofan and Vegagerðin access.
2. Select a marker so the InfoWindow opens.
3. Toggle filter pills so the selected marker becomes hidden.
4. Expected: InfoWindow closes immediately and does not float disconnected from a hidden point.
5. Toggle `Einfalt` / `Nánar`, reload, and confirm the choice persists after SQL88.
6. Open `/auth-mvp/vedrid/puls/stod/{vedurstofanStationId}`, click `Nánar` on a nearby Vegagerðin station, then use the back link.
7. Expected: the Vegagerðin pulse opens and returns to the original Veðurstofan pulse page.
8. Test mobile widths around 360, 390, and 460 px: no horizontal overflow, no awkward overlap with map controls, and scrubber arrow buttons move between slots.

## Open follow-up

Implement the public/unauthenticated `Nánar` preference save flow if Stebbi still wants that as product behavior:

- public user clicks `Nánar`
- app stores pending status-filter-mode preference
- app routes to `/innskraning?next=...`
- after successful login, authenticated `/auth-mvp/vedrid` consumes pending preference and saves it to `/api/teskeid/weather/preferences/thresholds`

This should mirror the already-existing pending/default wind-threshold flow.
