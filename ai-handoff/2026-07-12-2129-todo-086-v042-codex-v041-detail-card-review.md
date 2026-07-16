# TODO 086 - v041 detail card layout Codex review

Created: 2026-07-12 21:29
Timezone: Atlantic/Reykjavik
Author: Codex
Type: Prerelease review
Input reviewed: `ai-handoff/2026-07-12-2130-todo-086-v041-claude-detail-card-vedur-layout.md`
Scope: Review only. No source code changes, no commit, no push, no deploy, no migration.

## Findings

No blocking findings found in the v041 detail-card patch.

The implementation matches Stebbi's requested UI direction:

- The Vedurstofan block is now below the link row in `components/weather/RouteWeatherPointDetailCard.tsx`.
- It clearly labels Vedurstofan as reference-only.
- It shows nearest station distance on its own line.
- It shows station name, selected forecast time, stale state, wind, precipitation, temperature, and weather text when available.
- The active ETA row-selection helper from Phase 2A is reused, so changing departure slot should keep changing the Vedurstofan row.
- No verdict, route recommendation, heatmap, API, Supabase, or weather-cache behavior changed.

## Non-blocking notes

1. **v041 handoff says "4 skrár", but the actual v041-specific diff is 3 files.**

   The diff reviewed here is:

   - `components/weather/RouteWeatherPointDetailCard.tsx`
   - `messages/is.json`
   - `messages/en.json`

   This is only a handoff wording mismatch, not a code issue.

2. **"Oll faanleg vedurgildi" is implemented as all available fields for the selected nearest forecast row, not all time rows.**

   Codex thinks this is the right choice for the compact detail card. Showing every Vedurstofan time row belongs in the future "Elta vedrid" station explorer or a dedicated drawer, not this small point card. But if Stebbi literally meant all forecast rows, v041 does not do that.

3. **`mm/klst` remains hardcoded in English UI too.**

   This already exists throughout the current weather route UI, so it is not a new v041 regression. It can be handled later as an i18n/unit polish pass if Stebbi cares about English wording.

4. **Manual browser check is still needed.**

   Automated checks prove TypeScript and the relevant weather helpers/API tests, but not mobile wrapping or whether the extra Vedurstofan line feels too dense in the actual card.

## Files reviewed

- `ai-handoff/2026-07-12-2130-todo-086-v041-claude-detail-card-vedur-layout.md`
- `components/weather/RouteWeatherPointDetailCard.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/weather/types.ts`
- `components/weather/travelAuditMap.helpers.ts`
- Relevant grep context for existing weather units and Vedurstofan row fields

## Commands run

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-12-2130-todo-086-v041-claude-detail-card-vedur-layout.md'`
  - Exit code: 0
- `git status --short`
  - Exit code: 0
  - Result: repo is dirty; TODO086 files and unrelated files are modified/untracked. Existing permission warning for `C:\Users\Lenovo/.config/git/ignore` appeared.
- `git diff -- components/weather/RouteWeatherPointDetailCard.tsx messages/is.json messages/en.json`
  - Exit code: 0
  - Result: reviewed v041 UI/i18n diff.
- `Get-Content` with line numbers for `components/weather/RouteWeatherPointDetailCard.tsx`
  - Exit code: 0
- `Select-String` for `vedurStofan` keys in `messages/is.json` and `messages/en.json`
  - Exit code: 0
- `rg -n "VedurstofanForecast|forecastRows|precipitationMmPerHour|weatherText|vedurstofanStation" lib components app`
  - Exit code: 0
- `Get-Content` with line numbers for relevant `lib/weather/types.ts` section
  - Exit code: 0
- `Get-Content` with line numbers for relevant `components/weather/travelAuditMap.helpers.ts` section
  - Exit code: 0
- `rg -n "mm/klst|mm/h|metricPrecip|precipUnit|thresholdUnit|unit" components app lib messages`
  - Exit code: 0
- `Select-String` for weather metric/point message keys in `messages/is.json` and `messages/en.json`
  - Exit code: 0
- `npm.cmd run type-check`
  - Exit code: 0
  - Result: passed.
- `npm.cmd run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts lib/__tests__/weather-travel-api.test.ts`
  - Exit code: 0
  - Result: 2 files passed, 83 tests passed.
- `git diff --stat -- components/weather/RouteWeatherPointDetailCard.tsx messages/is.json messages/en.json`
  - Exit code: 0
  - Result: 3 files changed, 44 insertions, 22 deletions.
- `git diff --check -- components/weather/RouteWeatherPointDetailCard.tsx messages/is.json messages/en.json`
  - Exit code: 0
  - Result: no whitespace errors.
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
  - Exit code: 0
  - Result: `2026-07-12 21:29`

## Supabase / RLS / Production

- No SQL changes in v041.
- No migration written or run.
- No RLS, grants, auth, or production schema change.
- No change to `weather_cache`.
- Localhost route testing may still write usage/cache data depending on `.env.local`, same caveat as Phase 2A.

## Localhost checks for Stebbi

Before commit/push, Stebbi should manually check:

1. Open `/vedrid` locally.
2. Calculate a real route, for example Reykjavik to Akureyri.
3. Click a route point in the map or route point list.
4. Confirm the normal links still appear first: Spa, Yr, Google Maps, raw met.no.
5. Confirm the Vedurstofan block appears below those links.
6. Confirm it reads naturally:
   - `Vedurstofa Islands (eingongu til vidmidunar ad svo stoddu)`
   - nearest point distance
   - station name and `kl. HH:mm`
   - wind, precipitation, temperature, and weather description when available
7. Change the selected departure slot and confirm the Vedurstofan time/value row updates.
8. Check 360-460px mobile width for wrapping, no horizontal overflow, and no cramped/overlapping text.
9. If `.env.local` points at production Supabase, remember that route/weather checks may write cache/usage rows.

Do not commit, push, deploy, run migrations, or touch Supabase console unless Stebbi explicitly approves those actions.

## Recommendation

Codex considers v041 ready for Stebbi's manual localhost check.

If Stebbi approves commit/push for TODO086 Phase 2A plus this v041 UI polish, Claude Code should stage only the intended TODO086 files and exclude unrelated dirty files such as `TODO.md`, `.env.example`, admin changes, loan guard changes, `.claude/`, `.obsidian/`, and unrelated trip files unless Stebbi explicitly includes them.

Expected TODO086 commit scope after v041 likely includes the v038 Phase 2A files plus:

- `messages/is.json`
- `messages/en.json`

## Files changed by Codex in this review

- Added `ai-handoff/2026-07-12-2129-todo-086-v042-codex-v041-detail-card-review.md`

No source code, tests, SQL, env, TODO/DONE, commit, push, deploy, or Supabase state was changed by Codex.

## Óvissa / þarf að staðfesta

- Whether Stebbi is happy with showing all available Vedurstofan fields for the selected nearest row, rather than every forecast row.
- Whether the compact 10-11px text feels readable enough on actual mobile devices.
- Whether English unit polish should be handled now or left for a later weather copy cleanup.
