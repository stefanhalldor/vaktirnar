# TODO 086 - v049 Codex handoff: Elta veðrið gating and source coverage

Created: 2026-07-12 22:40
Timezone: Atlantic/Reykjavik
Author: Codex
Type: Handoff / scope correction for Claude Code
Related prior handoffs:

- `ai-handoff/2026-07-12-2215-todo-086-v047-claude-phase2b0-prerelease.md`
- `ai-handoff/2026-07-12-2229-todo-086-v048-codex-v047-phase2b0-review.md`

## Context

Stebbi tried opening `http://localhost:3004/auth-mvp/elta-vedrid` and got a 404.

Current v047 route is nested at:

```text
/auth-mvp/vedrid/elta-vedrid
```

That explains the screenshot 404, but Stebbi also raised two bigger product/source issues that must be treated as release blockers before Phase 2B0 goes further.

## Updated verdict

Do not release/commit v047 with only the v048 i18n fix.

The Phase 2B0 station explorer is useful, but before it goes further Claude Code needs to address or explicitly hand back decisions on:

1. dedicated per-user feature access for Elta veðrið;
2. whether the canonical URL should stay nested or move/redirect;
3. whether `29` stations is only a curated road-route seed rather than the full Veðurstofan/road-weather station set;
4. whether the explorer should show current observations/gusts, not only `type=forec` station forecasts.

## Stebbi's latest product requirements / concerns

### 1. Elta veðrið must be per-user feature flagged

Stebbi does not want this to open for every user who has generic `vedrid` access.

Current v047 guards:

- page: `guardFeatureAccess(user.email!, 'vedrid')`
- API: `checkFeatureAccess(user.id, user.email, 'vedrid')`

That is too broad.

The desired model is narrower:

- user must be authenticated;
- user should still satisfy the weather kill-switch / `vedrid` baseline if that is the product model;
- user must also have a dedicated Elta veðrið access gate.

### 2. The 29-station set needs source verification

Current local code has a curated route-road seed, not obviously "all weather stations":

- `lib/weather/providers/vedurstofanStations.ts`
- comment says: "Coverage status: verified curated road-route seed."
- v018 review confirmed `VEDURSTOFAN_STATIONS` contains 29 stations.

Stebbi is explicitly questioning whether 29 is enough and whether the web service itself exposes the real station count.

Do not call the current 29-item list "all stations" unless Claude Code verifies that against an official source or live XML response.

### 3. Current station weather and gusts are missing

Stebbi compared the explorer to `umferðin.is`, where the map shows current station-like weather boxes with wind and apparent gust values, e.g. wind with a value in parentheses.

The current implementation fetches:

```text
type=forec&time=3h&params=F;D;T;R;W
```

That is a forecast service, not necessarily the same as current road-weather observations.

Local parser notes in `lib/weather/providers/vedurstofanXml.ts` already say:

- `FG` / `FX` gust-ish fields are parsed if present;
- live forecast probes showed those fields absent for sampled forecast stations;
- they must not be used for route scoring yet.

So it is not surprising that v047 does not show "weather right now" or hviður like the screenshot. But that means the validation tool is not yet validating the thing Stebbi expected to inspect.

## Important implementation caveat: feature key may require SQL

This is not just a one-line string swap.

Local code shows:

- `lib/loans/guard.ts` explicitly branches known feature keys.
- `app/api/admin/feature-access/route.ts` has `ALLOWED_FEATURES`.
- existing SQL migrations use `feature_access_feature_key_check`, for example `sql/68_feature_access_vedrid.sql`, which only allows specific feature keys.

Therefore a new key such as `elta-vedrid` or `vedrid-elta-vedrid` likely requires:

- guard support;
- admin feature-access API support;
- admin UI support if Stebbi should grant it from the admin page;
- SQL migration to widen the `feature_access` CHECK constraint;
- tests for guard, admin API, and station explorer API.

Do not write or run a migration unless Stebbi explicitly approves migration work. If Claude Code thinks a migration is required, stop and ask Stebbi for scoped approval before writing SQL.

## Recommended feature key

Preferred key shape:

```text
elta-vedrid
```

Rationale:

- user-facing product name is "Elta veðrið";
- it avoids overloading `vedrid` or `ferdalagid`;
- it keeps this validation/internal tool independent from normal route weather access.

Suggested guard semantics if Stebbi approves the required code/SQL/admin scope:

```text
WEATHER_ENABLED must be true
WEATHER_ELTA_VEDRID_FLAG must be true
feature_access row must exist for feature_key = 'elta-vedrid'
```

Do not make this feature "open to everyone when flag is unset". This is an internal validation tool.

## URL decision

Current v047 URL:

```text
/auth-mvp/vedrid/elta-vedrid
```

Stebbi tried:

```text
/auth-mvp/elta-vedrid
```

Claude Code should not silently add a second route without deciding the product shape.

Recommended short-term:

- keep `/auth-mvp/vedrid/elta-vedrid` because this is a weather sub-tool;
- update handoff/local checks so the exact URL is unmistakable;
- optionally add a redirect from `/auth-mvp/elta-vedrid` only if Stebbi explicitly wants that route to work.

No public navigation link should be added yet unless Stebbi asks for it.

## Required source-discovery step before expanding station UI

Before claiming "all stations" or implementing current observations, Claude Code should do a source-discovery pass and hand it back to Codex/Stebbi.

Goal: answer these questions with evidence from official docs or a small read-only live probe:

1. Does `xmlweather.vedur.is` expose a station-list response or a no-ids response that returns all stations?
2. How many stations are available for `type=forec`?
3. Is there a separate current observation endpoint, likely `type=obs` or equivalent?
4. How many stations are available for current observations?
5. Which fields are present in current observations, especially wind, wind direction, temperature, gusts / max wind, precipitation, road conditions if any?
6. Is `umferðin.is` using Veðurstofan XML data, Vegagerðin road-weather data, or a different service entirely?
7. Are Vegagerðin-owned stations in our current list the same station IDs/data model as the stations on `umferðin.is`?

Important:

- Do not hammer Veðurstofan or Vegagerðin.
- If a live external probe is needed from the terminal and requires network approval, ask Stebbi with the full permission explanation required by `WORKFLOW.md`.
- Preserve a small sample response or summary in a handoff, but do not commit large live XML dumps.
- Do not scrape or depend on `umferðin.is` internals unless Stebbi explicitly approves that direction and terms are reviewed.

## Recommended next sequence for Claude Code

### Step A - Stop the current release path

Treat v047 as not releasable yet.

Keep v048 i18n fix in the backlog, but do not make it the only patch.

### Step B - Source discovery, no app behavior changes

Inspect official docs / run at most tiny read-only probes to determine:

- full forecast station count;
- full current-observation station count;
- endpoint names and params;
- presence of gust/current wind fields;
- relation to `umferðin.is` / Vegagerðin road-weather data.

Output a handoff, not a commit.

### Step C - Feature flag implementation plan

After discovery, propose exactly how to gate Elta veðrið.

Claude Code should explicitly state whether this requires a migration. If yes, do not write SQL until Stebbi approves migration scope.

Likely files if full feature-key implementation is approved:

- `lib/loans/guard.ts`
- `app/api/admin/feature-access/route.ts`
- `app/(admin)/admin/page.tsx`
- `lib/__tests__/guard.test.ts`
- `lib/__tests__/feature-access-api.test.ts`
- possibly `lib/__tests__/admin-page.test.tsx`
- a new SQL migration widening `feature_access_feature_key_check`

Likely files if only the station explorer gate is patched after the feature key exists:

- `app/auth-mvp/vedrid/elta-vedrid/page.tsx`
- `app/api/teskeid/weather/vedurstofan/stations/route.ts`
- `lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts`

### Step D - Station explorer product correction

Until full source coverage is verified:

- UI should say "curated stations" / "selected road-weather stations", not "all stations".
- If current observations are not implemented yet, UI should clearly say it is showing 3-hour station forecasts, not current station weather.
- If current observations are implemented, keep them separate from forecast rows:
  - "Núna" / current observation panel;
  - "Spá" / forecast rows panel.
- Do not feed current observation gusts into route scoring or public verdicts yet.

## Tests Claude Code should plan after any actual implementation

For feature access:

- `vedrid` only user cannot access Elta veðrið page/API.
- user with `elta-vedrid` can access page/API.
- guest cannot access.
- unknown feature keys still fail closed.
- admin feature-access route accepts only allowed keys.

For station source:

- parser tests for current observation sample if implemented.
- cache key tests must distinguish `forec` vs `obs` and param sets.
- station explorer API tests should verify it labels/counts curated vs source-total correctly.

For existing v048 issue:

- hardcoded forecast table labels and parse error summary must move to `messages/is.json` and `messages/en.json`.

Suggested validation commands after implementation:

```powershell
npm.cmd run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/weather-vedurstofan-server.test.ts lib/__tests__/weather-vedurstofan-stations.test.ts
npm.cmd run test:run -- lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts
npm.cmd run type-check
npm.cmd run lint
npm.cmd run build
```

## Files Codex inspected for this handoff

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-12-2215-todo-086-v047-claude-phase2b0-prerelease.md`
- `ai-handoff/2026-07-12-2229-todo-086-v048-codex-v047-phase2b0-review.md`
- `lib/weather/providers/vedurstofanStations.ts`
- `lib/weather/providers/vedurstofanXml.ts`
- `lib/loans/guard.ts`
- `app/api/admin/feature-access/route.ts`
- `app/(admin)/admin/page.tsx`
- relevant grep results across `app`, `lib`, `sql`, `TODO.md`, and prior TODO 086 handoffs

## Commands Codex ran

Read-only inspection commands only. No tests were rerun in this handoff turn.

Commands included:

```powershell
Get-Content -Encoding UTF8 'WORKFLOW.md'
Get-Content -Encoding UTF8 'ai-handoff/README.md'
Get-ChildItem -File 'ai-handoff' | Where-Object { $_.Name -like '*todo-086-v047*' -or $_.Name -like '*todo-086-v048*' } | Select-Object Name,Length,LastWriteTime | Sort-Object Name
Test-Path 'ai-handoff/2026-07-12-2330-todo-086-v047-claude-phase2b0-prerelease.md'
Select-String -Path 'ai-handoff\2026-07-12-*.md' -Pattern 'xmlweather|op_w|observ|athug|hvið|gust|station|stöð|veðurstöð|umferðin|Vegagerð' -Context 1,3 -Encoding UTF8
rg -n "feature_key|featureAccess|ferdalagid|vedrid|umonnun|tengsl|minnid" app lib sql TODO.md .env.example
Get-Date -Format 'yyyy-MM-dd HH:mm'
```

Notable local findings:

- The actual v047 file in the worktree is `2026-07-12-2215-todo-086-v047-claude-phase2b0-prerelease.md`, even though its `Created:` line says `2026-07-12 23:30`.
- `ai-handoff/2026-07-12-2330-todo-086-v047-claude-phase2b0-prerelease.md` does not exist locally.
- `lib/weather/providers/vedurstofanStations.ts` has 29 station entries in the exported list, plus one `stationId` in the type definition.

## Localhost checks for Stebbi

For the current v047 state, the expected direct URL is:

```text
/auth-mvp/vedrid/elta-vedrid
```

The URL Stebbi tried:

```text
/auth-mvp/elta-vedrid
```

is expected to 404 unless Claude Code adds a route or redirect.

After Claude Code implements the eventual gated version, Stebbi should test:

1. User with only `vedrid` access cannot open Elta veðrið.
2. User with both `vedrid` and the dedicated Elta veðrið access can open it.
3. Guest cannot open it.
4. The exact intended URL is documented and works.
5. The page clearly distinguishes between curated station set vs full source station catalog.
6. If current observations are not implemented, the page must not imply it shows "weather right now".
7. If current observations are implemented, compare one or two known stations against the screenshot/source manually and confirm wind/gust semantics are clear.

Before opening the page, confirm `.env.local` points to the intended Supabase project. The existing fetch/cache path can write to `weather_cache` when live data is fetched.

Do not casually test by repeatedly refreshing a page that triggers live Veðurstofan/Vegagerðin calls. The validation page should remain cache-aware and respectful of public services.

## Óvissa / þarf að staðfesta

- Codex did not verify the live Veðurstofan station count in this turn.
- Codex did not verify whether `umferðin.is` data comes from Veðurstofan XML, Vegagerðin, or another service.
- Codex did not verify the exact current-observation endpoint/params.
- The recommended `elta-vedrid` feature key likely requires SQL/admin changes because of the existing `feature_access` CHECK constraint, but Claude Code should verify against current migrations and actual agreed scope before proposing implementation.

