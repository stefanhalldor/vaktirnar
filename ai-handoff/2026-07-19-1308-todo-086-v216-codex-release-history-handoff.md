# TODO 086 / v216 - Codex release-history handoff

Created: 2026-07-19 13:08
Timezone: Atlantic/Reykjavik

## Status

Codex release-gate result: release-ready from code/test/build perspective after Claude Code v215.

This handoff is intentionally historical and detailed. It records the full late-stage story around route memory, route filtering, Safnpuls, Vegagerdin freshness/history, default wind thresholds, auth-shell canonicalization, and the final v214 -> v215 blocker closure.

Codex did not commit, push, deploy, run migrations, change production data, or touch Supabase. This is a handoff/review record only.

## Short release answer

Yes, Stebbi can ask Claude Code to push/deploy the current committed HEAD if Stebbi is satisfied with the manual product checks below.

The final release gate is green locally:

- `npm run type-check` -> exit 0
- `npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/vegagerdin-history.test.ts lib/__tests__/warm-vegagerdin-cron.test.ts` -> exit 0, 4 files, 126 tests
- `npm run build` -> exit 0

Known non-blockers:

- Build still reports pre-existing lint warnings in unrelated and weather files.
- `components/weather/WeatherOverviewClient.tsx` still has hook-dependency warnings around route filter IDs. Build passes, but this deserves cleanup after release.
- `lib/iceland-routes/routeMemory.server.ts` had a minor duplicated Phase 2 comment noted earlier. Not release-blocking.
- No automated test was added for the browser `sessionStorage` threshold-save handoff after login. Manual check remains required.

## Current HEAD context

Latest commits reviewed:

- `b88c5c6` - `test: update vegagerdin-history tests for no-age-cutoff history fallback (#86)`
- `07f311d` - `fix: canonicalize authenticated users from /vedrid to /auth-mvp/vedrid in middleware (#86)`
- `e315d52` - `fix: blank map with multi-variant routes, Vegagerdin always-show-history (#86)`
- `2eb9c75` - `fix: sessionStorage backup for threshold save before login redirect (#86)`
- `6d8e9a8` - `fix: profile FK guard for threshold save, route-memory sql/87 fallback (#86)`
- `6733e95` - `fix: restore Safnpuls drawer on /vedrid overview (#86)`
- `33875c6` - `feat: route-variant dominance, caution IDs, threshold save-button fix (#86)`
- `c084041` - `feat: save default wind thresholds on /vedrid, attention box for banner`
- `c7fe5fa` - `feat: route-variant pills on /vedrid with weather-sorted selection (#86)`
- `eaa23ac` - `fix: union all route-memory variants in /vedrid overview, raise lookup cap to 20 (#86)`

Working tree note at review time:

- Modified but not release-relevant: `.obsidian/workspace.json`
- Untracked handoff/review docs in `ai-handoff/`, including this late release chain.
- If Claude Code commits or pushes, it should avoid accidentally including `.obsidian/workspace.json` unless Stebbi explicitly wants that.

## The story so far

### 1. Product pressure: Google cost and route-memory goal

Stebbi flagged that Google cost must stay visible. The route-memory direction exists to avoid using Google-style address autocomplete and repeated route calculations for the quick `/vedrid` experience.

The desired model became:

- `/ferdalagid` remains the deeper Google-backed route calculation flow.
- Successful real trip calculations populate route memory.
- `/vedrid` uses known route memory for fast route weather lookup.
- `/vedrid` should not rely on Google dropdowns for "Fra" and "Til".
- The quick picker should be simple, mostly pills, and live around the main weather map rather than adding a second map.

### 2. Route picker UX moved toward pills

Stebbi clarified the UX:

- Put "Skoda vedrid a akvedinni leid" above/near the main map context, not as a separate map-heavy flow.
- Show available origin pills immediately.
- After selecting one place, show reachable destination pills.
- In Iceland, direction should be treated bidirectionally for route matching: Reykjavik -> Akureyri and Akureyri -> Reykjavik are the same practical route for this use case.
- If a user selects only one place, the map should filter to the nearest station/stations for that place, not keep the whole country visible.
- The UI should hint that if the destination is missing, the user can choose a nearby place or use Ferdalagid for a more detailed calculation.

This pushed the feature away from Google autocomplete and toward self-registering route-memory places.

### 3. Map/filter behavior was corrected in rounds

Several practical map issues came up and were fixed across the v180-v215 chain:

- Clicking a place pill should not auto-open the station detail card. It was distracting.
- Vegagerdin needed to respect the selected place/route just like Vedurstofan.
- Station labels on the pulse/map needed to be small labels by markers, not a large overlay covering the map.
- Safnpuls was accidentally removed from the top area of `/vedrid` and later restored.
- Safnpuls should filter by selected route when a route is active, and otherwise remain available on the overview.

### 4. Route memory moved from single route to multiple variants

Stebbi noticed that Reykjavik -> Egilsstadir could have more than one useful route option, and that showing the union of every variant can look like the whole ring road in some cases.

The product direction became:

- If multiple route variants exist, show route-variant pills.
- Default can show "Allar leidir" to avoid hiding context.
- Variant pills should allow choosing one route.
- Route pills should be sorted by weather quality where possible.
- Route cautions such as "Varasom leid" should be represented in the UI.
- There should be cleanup/dominance logic so older or poorer duplicate variants do not crowd the route list.

This led to:

- `sql/87_weather_route_memory_route_cautions.sql`
- route caution IDs/metadata support
- route-variant dominance logic
- fallback and cap changes in `lib/iceland-routes/routeMemory.server.ts`
- route-variant UI changes in `components/weather/WeatherOverviewClient.tsx`
- test coverage in `lib/__tests__/weather-route-memory-migration.test.ts`

### 5. Blank map with multiple variants became a release blocker

After multiple variants were introduced, Stebbi found cases where `/vedrid` showed no markers when there were multiple routes, e.g. Dalvik -> Gardabaer.

The important implementation correction in `e315d52`:

- In `WeatherOverviewClient`, if the current active provider has zero route-visible markers but the alternate provider has matching route-visible markers, the UI auto-switches provider context instead of leaving the map blank.
- In `routeMemory.server.ts`, zero-station variants are dropped when sibling variants with stations exist.

This kept multi-variant route memory from producing an empty map when the data was present under the other provider.

### 6. Vegagerdin freshness/history was changed to favor availability

Production showed Vegagerdin gray/unavailable when cron/cache timing was bad.

The system already had `sql/83_vegagerdin_measurements_history.sql`, intended to preserve the newest successful Vegagerdin batch so `/vedrid` could keep showing Vegagerdin even when short-lived cache expires.

The product decision implemented in the reviewed branch:

- If fresh cache is missing, return the newest Vegagerdin history batch.
- Do not apply a hard age cutoff in the history lookup.
- Return it as `status: stale` / `cacheStatus: history_fallback`.

Why this matters:

- It avoids the "Vegagerdin is just gray on production" failure mode.
- It may show old measurements if cron/upstream has been dead for a long time.

Codex flagged this as a product safety decision in v214. Claude Code v215 added explicit test coverage proving the intended no-age-cutoff behavior. That resolves the test/product-contract mismatch, but the UI should still make stale/old data unmistakable over time.

### 7. Cron/manual warm notes

Stebbi manually called production cron:

```powershell
curl.exe -i -H "Authorization: Bearer <CRON_SECRET>" "https://www.teskeid.is/api/cron/warm-vegagerdin"
```

Important details from the session:

- Use `https://www.teskeid.is/...`, not `https://teskeid.is/...`, because the naked domain returns a `308 Permanent Redirect`.
- The successful response included `stationCount: 201`, fresh timestamps, and at one point `historyStatus: failed`.
- That `historyStatus: failed` was consistent with `sql/83` not being present yet or not accepting writes.
- After `sql/83` was discussed/run, a later cron response skipped as `alreadyFresh`, which does not necessarily backfill history rows. Stebbi checked history rows and saw `rows: 0`, `newest_batch: null` at that moment.

Open operational note:

- If history rows remain zero in production, the next non-skipped successful upstream fetch should populate them.
- If it still does not, inspect the cron route logs and Supabase write error for `vegagerdin_measurements_history`.

### 8. Default wind threshold preferences

`sql/82_weather_user_preferences.sql` introduced saved user thresholds:

- `weather_user_preferences`
- per-user row keyed by `profiles(id)`
- RLS: authenticated users can manage only their own row
- API routes:
  - `GET /api/teskeid/weather/preferences/thresholds`
  - `PUT /api/teskeid/weather/preferences/thresholds`

Late issues:

- Public users clicking "Vista sem sjalfgefin vindmork" needed to be sent through login.
- The selected values needed to survive the login flow.
- If the authenticated user did not yet have a `profiles` row, the preference save could fail due to FK.
- The hamburger/auth shell could think the user was logged out after redirecting back to public `/vedrid`.

Fixes:

- `6d8e9a8` added a profile FK guard in the preferences route.
- `2eb9c75` added `sessionStorage` backup for pending thresholds before login redirect.
- `07f311d` canonicalizes authenticated users from public `/vedrid` routes to `/auth-mvp/vedrid` routes in middleware, preserving query params.

Remaining check:

- The `sessionStorage` handoff flow still needs manual browser testing, especially for new users going through profile setup.

### 9. Auth-shell canonicalization bug

Stebbi observed:

- The value saved correctly.
- But the hamburger/menu still behaved like the user was not logged in until Stebbi manually went through login again.

Root cause:

- Authenticated users could land on the public `/vedrid` shell after login or save-defaults redirect.

Fix in `middleware.ts`:

- Authenticated `/vedrid` redirects to `/auth-mvp/vedrid`.
- Authenticated `/vedrid/ferdalagid` redirects to `/auth-mvp/vedrid/ferdalagid`.
- Query string is preserved with `request.nextUrl.clone()`.
- Exact paths only, so station/pulse subpaths are not swept into the redirect.

Test coverage:

- `lib/__tests__/middleware.test.ts` added/updated coverage.
- Middleware targeted tests pass.

## v214 blocker and v215 resolution

Codex v214 found two high release blockers:

1. Vegagerdin history tests were failing after the no-age-cutoff implementation changed the Supabase mock chain.
2. The no-age-cutoff product rule needed explicit coverage if it was the intended behavior.

v215 resolution:

- `lib/__tests__/vegagerdin-history.test.ts` was updated.
- The mock chain now matches implementation:
  - old chain: `.select().gte('last_fetched_at', cutoff).order().limit().maybeSingle()`
  - new chain: `.select().order().limit().maybeSingle()`
- Assertions no longer expect `.gte`.
- Exact batch matching via `.eq('last_fetched_at', newestBatch)` remains tested.
- New explicit test added:
  - `returns history_fallback even for very old history batches (no age cutoff)`

Codex re-ran the release gate after v215 and confirmed green.

## Files and areas touched by this release chain

Runtime/product files in the reviewed commit chain include:

- `middleware.ts`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherThresholdBar.tsx`
- `app/api/teskeid/weather/preferences/thresholds/route.ts`
- `app/api/teskeid/weather/vedurpuls/feed-preview/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `lib/iceland-routes/routeMemory.server.ts`
- `lib/weather/providers/vegagerdinCurrent.server.ts`
- `messages/is.json`
- `messages/en.json`
- `vercel.json`

SQL/migration files in the broader TODO 086 story:

- `sql/82_weather_user_preferences.sql`
- `sql/83_vegagerdin_measurements_history.sql`
- `sql/86_weather_route_memory.sql`
- `sql/87_weather_route_memory_route_cautions.sql`

Test files:

- `lib/__tests__/middleware.test.ts`
- `lib/__tests__/weather-route-memory-migration.test.ts`
- `lib/__tests__/vegagerdin-history.test.ts`
- `lib/__tests__/warm-vegagerdin-cron.test.ts`

Handoff/review docs were also added through the release cycle under `ai-handoff/`.

## Supabase, SQL, RLS, auth, and production data

Codex did not run SQL and did not verify production Supabase state directly.

Important SQL expectations:

- `sql/82_weather_user_preferences.sql`
  - Needed for persisted authenticated wind thresholds.
  - Uses RLS by user_id = auth.uid().
  - Grants authenticated CRUD only on own row through RLS.
  - Depends on `profiles(id)` and `teskeid_set_updated_at()`.

- `sql/83_vegagerdin_measurements_history.sql`
  - Needed for Vegagerdin current-measurement history fallback.
  - Service-role only. No anon/authenticated policies.
  - Cron writes rows after successful upstream fetches.
  - If table is absent or grants are wrong, cron history write can fail while current cache may still be fresh.

- `sql/86_weather_route_memory.sql`
  - Route memory table pair for route/station sets.
  - Service-role only.
  - Privacy model: no user ID, no raw addresses, no raw Google geometry, no raw Google place IDs.

- `sql/87_weather_route_memory_route_cautions.sql`
  - Adds route caution metadata needed by route variant UI.
  - Should be treated as schema change and only run with explicit Stebbi approval.

Production caution:

- Do not casually test destructive cleanup SQL, message deletion SQL, or route-memory cleanup on production during this release verification.
- If a migration is missing in production, deploy may build but runtime API behavior can fail or silently degrade. Verify migration state before relying on that feature.

## Findings

No release-blocking code/test/build findings remain after v215.

### Medium - no-age-cutoff Vegagerdin history is intentionally permissive

This is now tested and therefore not a hidden bug, but it remains a product-risk tradeoff.

If cron/upstream dies for days, `/vedrid` can still show the newest historical Vegagerdin batch as stale/history fallback. That is better than gray/unavailable for short outages, but it must not mislead users into thinking very old wind observations are current.

Recommended post-release follow-up:

- Add visible stale-age copy/badge in the Vegagerdin selector/card when history fallback age exceeds a threshold.
- Consider a product cap such as 24-72 hours if the UI cannot communicate age clearly enough.

### Medium - browser login/sessionStorage threshold flow needs manual verification

The code path depends on browser state and redirect sequencing:

- logged-out user on `/vedrid`
- set thresholds
- click save defaults
- pending values stored in `sessionStorage`
- login/profile flow
- redirect/canonicalization into `/auth-mvp/vedrid`
- client consumes pending values and saves preferences

This is plausible and type/build/test green, but not covered by automated tests.

### Low - route-filter hook dependency warnings remain

Build warnings mention route filter ID conditionals in `WeatherOverviewClient.tsx`. They do not block build, but they are worth cleaning after release because route filtering is now a high-value area.

### Low - untracked docs and `.obsidian` workspace file

Before any commit/push:

- Do not include `.obsidian/workspace.json` unless Stebbi explicitly wants personal workspace state committed.
- Decide whether the untracked `ai-handoff/` docs should be committed as project history or left local.

## Recommended deploy sequence for Claude Code

Only if Stebbi explicitly asks Claude Code to push/deploy:

1. Confirm current HEAD is the intended commit:
   - `b88c5c6`
2. Confirm no accidental staged files:
   - especially `.obsidian/workspace.json`
3. Push the intended commit.
4. Watch Vercel until build is terminal green.
5. If Vercel fails, stop and report the exact failing log section.
6. After production deploy, Stebbi should run the production smoke checks below.

Do not run SQL, migrations, cron changes, Vercel config changes, or production cleanup as part of deploy unless Stebbi separately asks for that.

## Commands Codex ran for this handoff/release gate

```bash
Get-Content -Encoding UTF8 'WORKFLOW.md'
```

Result: exit 0.

```bash
Get-Content -Encoding UTF8 'ai-handoff/README.md'
```

Result: exit 0.

```bash
git log --oneline -10
```

Result: exit 0.

```bash
git status --short
```

Result: exit 0 with warnings about unreadable global git ignore plus modified `.obsidian/workspace.json` and untracked handoff docs.

```bash
git show --stat --oneline eaa23ac..b88c5c6
```

Result: exit 0.

```bash
Get-Content -Encoding UTF8 'ai-handoff/2026-07-19-1259-todo-086-v214-codex-v211-v213-prerelease-review.md'
```

Result: exit 0.

```bash
Get-Content -Encoding UTF8 'ai-handoff/2026-07-19-1305-todo-086-v215-claude-v214-done-prerelease.md'
```

Result: exit 0.

```bash
npm run type-check
```

Result: exit 0.

```bash
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/vegagerdin-history.test.ts lib/__tests__/warm-vegagerdin-cron.test.ts
```

Result: exit 0. 4 test files passed, 126 tests passed.

```bash
npm run build
```

Result: exit 0. Build completed with warnings only.

## Route intelligence check

Route families and flows touched:

- Reykjavik <-> Akureyri
- Reykjavik <-> Egilsstadir
- Reykjavik <-> Siglufjordur
- Dalvik <-> Gardabaer
- Multi-variant route families, including route pills such as `Allar leidir`, `Leid 1`, `Um Hellisheidi`, and `Til ad sleppa vid Oxi`.

Provider neutrality:

- Route memory remains provider-neutral at the route/variant level.
- Station filtering has provider-specific station ID sets for Vedurstofan and Vegagerdin, which is expected.
- UI auto-switching between providers when a selected route has no markers for the active provider is provider-aware, but it is a pragmatic UI decision rather than route-domain knowledge.

Iceland route intelligence:

- Route variant dominance and caution metadata belong in `lib/iceland-routes/` and route-memory schema rather than as ad hoc UI-only rules.
- `sql/87` moves caution support into route memory so `/vedrid` can display warnings consistently.
- Longer-term, curated route families/control points should continue to move into `IcelandRoadmap.md` / `lib/iceland-routes/` rather than growing Google-specific exceptions.

Privacy:

- The route memory model stays within the intended privacy boundary:
  - normalized public place keys/labels
  - route variant key/label
  - provider station IDs
  - no user IDs
  - no raw street addresses
  - no raw Google place IDs
  - no raw route geometry

Post-release route follow-up:

- Improve dominance/cleanup so "Leid 1" vs "Um Hellisheidi" duplicates become less confusing when one is clearly a poorer/sparser version of another route.
- Add clearer route age/detail diagnostics for route-memory variants if needed.
- Consider a route quality score that accounts for station coverage density, caution status, and forecast severity.

## Localhost checks for Stebbi

Run these on localhost before or immediately after deploy, with Stebbi's normal dev server. Codex did not start a dev server.

### 1. Public `/vedrid`

Setup:

- Logged out.
- Open `/vedrid`.

Steps:

1. Confirm no redirect to `/auth-mvp/vedrid`.
2. Confirm the public hamburger/menu state is correct.
3. Confirm Safnpuls drawer appears above the map when no route is selected.
4. Confirm overview map shows ordinary all-country stations.
5. Confirm default wind thresholds show the intended public defaults.

Expected:

- Public page works.
- No authenticated-only UI leaks into public shell.
- Safnpuls is visible and usable.

### 2. Authenticated canonical shell

Setup:

- Logged in.

Steps:

1. Manually open `/vedrid`.
2. Expected redirect: `/auth-mvp/vedrid`.
3. Open hamburger.
4. Confirm authenticated menu/profile/sign-out state is visible.
5. Manually open `/vedrid/ferdalagid`.
6. Expected redirect: `/auth-mvp/vedrid/ferdalagid`.

Expected:

- Authenticated users do not remain stuck in public `/vedrid` shell.
- Query params are preserved when present.

### 3. Save default wind thresholds while already logged in

Setup:

- Logged in on `/auth-mvp/vedrid`.

Steps:

1. Set caution/red thresholds to `10` and `13`.
2. Click `Vista sem sjalfgefin vindmork`.
3. Refresh.
4. Navigate to `/auth-mvp/vedrid/ferdalagid` and back.

Expected:

- Values stay `10` and `13`.
- No 500 from preferences API.
- Hamburger remains authenticated.

Do not test by manually editing Supabase rows unless Stebbi explicitly decides to do DB work.

### 4. Save defaults from logged-out state

Setup:

- Logged out on `/vedrid`.

Steps:

1. Set thresholds to `10` and `13`.
2. Click `Vista sem sjalfgefin vindmork`.
3. Complete login.
4. If profile setup appears, complete profile setup.
5. Confirm final weather route is canonical authenticated route.
6. Refresh.

Expected:

- Values survive login/profile flow.
- Preferences save completes.
- Final page is `/auth-mvp/vedrid` or equivalent authenticated shell.
- Hamburger shows logged-in state.

Regression to watch:

- Values briefly showing then reverting to `10`/`15`.
- User lands on public `/vedrid` despite being logged in.
- `saveDefaults` query loops forever.

### 5. Single-route weather filtering

Setup:

- Route memory exists for a one-route pair, e.g. Reykjavik -> Siglufjordur.

Steps:

1. Open `/vedrid`.
2. Select Reykjavik.
3. Select Siglufjordur.

Expected:

- Map filters to route stations.
- Safnpuls filters to route context.
- No unrelated whole-country station flood.
- Route pill area does not show confusing duplicate pills for a single route.

### 6. Multi-variant weather filtering

Setup:

- Route memory exists for multi-variant pairs, especially:
  - Reykjavik -> Egilsstadir
  - Dalvik -> Gardabaer

Steps:

1. Select the route pair.
2. Confirm route pills appear.
3. Start on `Allar leidir`.
4. Select individual route pills, including `Um Hellisheidi` or route avoiding Oxi where available.
5. Toggle/show provider context if the UI exposes it.

Expected:

- No blank map when multiple variants exist.
- `Allar leidir` shows union.
- Individual route pills filter the map to that variant.
- Route caution information appears where expected.
- The route with better station coverage is not hidden behind a poorer duplicate unless intentional.

### 7. Vegagerdin history/freshness

Setup:

- Production or local environment with Vegagerdin cache/history available.

Steps:

1. Open `/vedrid`.
2. Confirm Vegagerdin is not gray/unavailable when current cache has expired but history exists.
3. Check timestamp/selector copy around Vegagerdin.
4. If possible, compare after manual cron warm.

Expected:

- Fresh cache shows as fresh.
- History fallback shows as stale/history context, not as a silent current measurement.
- If history table is empty, behavior may still be unavailable until the next non-skipped warm fetch writes history.

Do not repeatedly hammer production cron casually. Use one manual cron call only when Stebbi explicitly wants to refresh/check it.

### 8. Safnpuls route filtering

Setup:

- Have Safnpuls/user pulse data visible.

Steps:

1. Open `/vedrid` without route.
2. Confirm Safnpuls drawer appears above map.
3. Select a route.
4. Confirm Safnpuls feed/drawer filters to selected route or route station context.
5. Clear route.

Expected:

- Safnpuls returns to overview behavior when route is cleared.
- It does not disappear from the top of the page.

## Production smoke checks after deploy

Use production carefully:

1. Open `https://www.teskeid.is/vedrid` logged out.
2. Confirm public overview, map, Safnpuls, and route picker are visible.
3. Log in and open `https://www.teskeid.is/vedrid`.
4. Confirm redirect/auth-shell behavior.
5. Test one route with one variant and one route with multiple variants.
6. Save thresholds as logged-in user, refresh, confirm persistence.
7. Confirm Vegagerdin is showing expected fresh/stale state.
8. Avoid production SQL cleanup or destructive message deletion during smoke testing.

## Suggested next work after release

1. Add stale-age UI hardening for Vegagerdin history fallback.
2. Add automated browser/integration coverage for the logged-out threshold-save -> login -> authenticated save flow.
3. Clean `WeatherOverviewClient` hook dependency warnings around route filter IDs.
4. Improve route variant dominance so sparse duplicate routes do not appear as confusing `Leid 1` siblings.
5. Continue moving route intelligence into `lib/iceland-routes/` / `IcelandRoadmap.md` instead of UI-specific exceptions.
6. Decide whether `ai-handoff/` docs from this release chain should be committed as project history.

## Open questions / uncertainty

- Codex did not verify production Supabase migration state directly. Stebbi/Claude Code should confirm that required migrations are present before relying on the associated runtime behavior.
- Codex did not verify production Vercel deployment status because no deploy was performed by Codex.
- Codex did not run browser checks. Stebbi should perform the localhost and production smoke checks above.
- The no-age-cutoff Vegagerdin history behavior is now intentional and tested, but the UI/UX around very old data should be improved after release.
