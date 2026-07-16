# TODO 086 v156 - Codex: Stebbi decisions for v155 and next execution plan

Created: 2026-07-14 15:18
Timezone: Atlantic/Reykjavik

## Context

Stebbi responded to:

- `2026-07-14-1502-todo-086-v154-codex-provider-selector-freshness-plan.md`
- `2026-07-14-1506-todo-086-v155-claude-v154-plan-handoff.md`

This file captures Stebbi's decisions and adjusts the next execution plan for Claude Code.

No implementation permission is implied by this file. Claude Code should wait for explicit execution permission before changing code.

## Stebbi Decisions

### 1. Veðurstofan freshness grace

Decision: **10 minutes**.

Important interpretation from Codex:

- Do **not** implement this as "the cron job must have run in the last 10 minutes" globally.
- Since the current cron is hourly, that would make the provider look stale most of the time.
- Implement it as: when a new Veðurstofan 3-hour forecast cycle should be available, allow a 10-minute grace window. After that, if our newest `atimeIso` is still from the previous cycle, the Veðurstofan data is old/stale.

In other words:

- `atimeIso` decides whether the forecast cycle is current.
- `fetchedAtIso` tells when Teskeið fetched it.
- `weather_fetch_runs` tells whether our warmer/manual refresh has recently tried to update it.

### 2. Behavior when Veðurstofan data is old

Stebbi does **not** want Veðurstofan to simply disappear from the calculation when old.

New desired behavior:

- If the expected forecast cycle is missing after the 10-minute grace window, show a clear old-data state.
- Give the user a **"Sækja ný gögn"** action.
- The user-triggered action should fetch new data for all Veðurstofan stations and update our cache/product tables.
- The next user should see that this has already been attempted or is in progress, so multiple users do not repeatedly hammer Veðurstofan.
- The cache/product layer should record that the refresh was triggered by a user/manual action rather than the scheduled cron.

Codex caution:

- It is risky to let old weather data look normal in a safety-adjacent route-weather product.
- If stale Veðurstofan remains included in calculations, every affected UI surface must carry the degraded state clearly.
- The stale state must not only be a tiny badge hidden on a station card.

Recommended compromise:

- If Veðurstofan is selected and old, include it only as a **degraded/stale provider state**.
- Show the old-data status in the provider selector / summary area.
- Show timestamps and refresh CTA.
- Mark any result using stale Veðurstofan values as based on old Veðurstofan data.
- Never label stale data as normal/fresh.

### 3. Phase B provider selector

Stebbi wants Phase B to happen now, not later.

Reason:

- The provider selector UI is independent enough from stale data handling.
- It should be made public-ready now.

Execution adjustment:

- Claude Code can implement the public-ready provider selector in the same work package as freshness/manual refresh.
- Still implement enough provider-state plumbing first so the selector can show fresh/stale/in-progress states cleanly.

## Veðurstofan Card Layout Requirement

Stebbi wants Veðurstofan point cards laid out as route-time cards, not as generic station rows.

Required content:

1. `Brottfarartími: kl. {selected departure time}`
2. `Áætlaður tími {X km} frá {brottfarastaður fallbeygður}: kl. {estimated station/route time}`
3. `Spápunktur um {distance} frá veginum.`
4. `Veðurspá á þessum stað frá kl. {atime}`
5. Previous forecast row:
   - `Kl. {forecast time before used value}: {forecast values}`
6. Used forecast row:
   - `Kl. {used forecast time}: {forecast values}`
   - Make it visually clear that this is the forecast used in the route assessment.
7. Next forecast row:
   - `Kl. {forecast time after used value}: {forecast values}`
8. Link to the station page on `vedur.is`.

Example forecast values:

`5 m/s S · 1,3 mm/klst · 12°C · Lítils háttar rigning`

Implementation guidance:

- Use the same layout in all three relevant places:
  - worst/most demanding point, when the decisive point is from Veðurstofan
  - selected map point, when the selected point is from Veðurstofan
  - all points list under Veðurstofan
- Highlight the used forecast row with a small badge such as `Notað í mati`.
- If there is no previous or next forecast row, omit that row instead of showing a placeholder.
- Keep `Spá frá kl.` / `Sótt kl.` concepts available, but the card should lead with the route timing and the `atime` source time.
- All user-facing strings must go into `messages/is.json` and `messages/en.json`.
- Use Design.md guidance: mobile-first, no nested cards, compact structured rows, semantic status/badge styling, no horizontal overflow.

About `brottfarastaður fallbeygður`:

- Use an existing route/place wording helper if one exists.
- If there is no safe inflection helper, avoid building a broad Icelandic grammar system in this step.
- For MVP, a narrow helper for known origin labels or neutral phrasing is safer than a large language-rule abstraction.

## "Gömul gögn" Label

Stebbi clarified:

- The normal Veðurstofan station card should not casually show a small `gömul gögn` label.
- The better solution is to prevent old data from silently happening.

Codex interpretation:

- Do not show `gömul gögn` on normal/fresh station cards.
- If the provider is stale, show stale state at the provider/summary level with refresh action.
- If stale values are used because Stebbi wants degraded calculation rather than exclusion, then the route result itself must visibly say it is using old Veðurstofan data.
- Avoid a tiny stale badge buried inside every card as the only warning.

## Manual "Sækja ný gögn" Design

This should not expose `CRON_SECRET` to the browser.

Recommended API shape:

- Add an authenticated app endpoint, for example:
  - `POST /api/teskeid/weather/vedurstofan/refresh`
  - optionally `GET /api/teskeid/weather/vedurstofan/refresh/status`

Endpoint behavior:

1. Check that weather/route feature access allows the user to use this flow.
2. Check current Veðurstofan provider health:
   - expected cycle `atime`
   - newest available `atime`
   - last successful cron refresh
   - last manual refresh attempt
   - any in-progress refresh
3. If data is already current, return success without hitting Veðurstofan.
4. If a refresh is already running, return `202`/status-style response and do not start another.
5. If a manual refresh was already attempted for this expected cycle recently, return that state and do not start another.
6. Otherwise trigger the all-stations Veðurstofan fetch and product projection.
7. Record that this run was manual/user-triggered.
8. Return a response the UI can use:
   - `fresh`
   - `refreshing`
   - `staleAttempted`
   - `providerStillOld`
   - `failed`

Important anti-stampede rule:

- Only one user should be able to trigger the all-stations refresh for a stale cycle.
- Every later user should see that Teskeið has already tried or is currently trying.
- Do not let many users click the button and generate repeated Veðurstofan calls.

## Database / Run Tracking Implication

Stebbi wants the cache to be marked when data was fetched manually rather than by cron.

Current table from migration 74:

- `weather_fetch_runs`
- `source`
- `fetch_type`
- `started_at`
- `finished_at`
- `stations_attempted`
- `stations_succeeded`
- `stations_failed`
- `error_summary`

Codex recommendation:

- To do this properly, add a small migration later for run metadata.
- Do not run it without explicit Stebbi approval.

Likely new columns:

- `triggered_by text` with values like `cron`, `manual`
- `triggered_by_user_id uuid null`
- `trigger_reason text null`, for example `stale_cycle_refresh`
- `expected_atime timestamptz null`
- maybe `result_atime timestamptz null`

Likely index/constraint:

- Something that prevents concurrent duplicate in-progress Vedurstofan forecast refreshes.
- A partial unique index may be appropriate, but Claude Code should inspect current Supabase patterns before proposing SQL.

If Claude Code wants to avoid SQL for a first UI-only pass:

- It can read existing `weather_fetch_runs` for last run times, but that will not fully satisfy Stebbi's requirement to distinguish manual vs cron.
- For the proper product behavior, a small migration is probably justified.

## Provider Selector UI Requirement

Implement the nicer selector now.

Required structure:

| Sannreynt | Í prófunum | Væntanlegt |
| --- | --- | --- |
| met.no | Veðurstofan | Vegagerðin |

Expected behavior:

- `met.no`
  - section: `Sannreynt`
  - enabled
  - default on
  - verified baseline

- `Veðurstofan`
  - section: `Í prófunum`
  - enabled when feature/user gate allows it
  - can show fresh/stale/refreshing states
  - if stale, show `Sækja ný gögn` if allowed

- `Vegagerðin`
  - section: `Væntanlegt`
  - disabled by default
  - visible as coming soon / in progress

Design.md alignment:

- Use a real toggle/switch for binary provider inclusion.
- Mobile-first stacked layout is preferred.
- On wider screens, three columns are acceptable if they remain compact.
- Do not create nested cards inside the main summary card.
- Use semantic status styling and text, not only color.
- Touch targets should be comfortable on 360-460 px mobile widths.
- No hardcoded user-facing text in the component.

Suggested component:

- `WeatherProviderSelector`

Suggested provider-neutral state:

```ts
type WeatherProviderAvailability =
  | 'fresh'
  | 'stale'
  | 'refreshing'
  | 'unavailable'
  | 'coming-soon'

type WeatherProviderGroup =
  | 'verified'
  | 'testing'
  | 'upcoming'
```

The exact names can differ, but the state model should be provider-neutral so Vegagerðin can slot in soon.

## Calculation Behavior With Stale Veðurstofan

Stebbi's latest direction is that it feels bad to exclude Veðurstofan from the calculation entirely when stale.

Codex still recommends caution. The implementation should make the degraded state impossible to miss.

Recommended behavior:

- If `met.no` is selected and fresh, it behaves normally.
- If `Veðurstofan` is selected and fresh, it participates normally.
- If `Veðurstofan` is selected and stale:
  - It may participate only as a clearly stale/degraded provider state.
  - Summary/worst/selected/scrubber should carry a stale-data warning if stale Veðurstofan contributes to the result.
  - The provider selector should offer `Sækja ný gögn` when no refresh is already active/recently attempted.
  - If the refresh returns the same old `atime`, keep the stale state and show that Teskeið tried to refresh.

Do not let old Veðurstofan data silently look like fresh data.

## Suggested Execution Order For Claude Code

1. Read current provider selector, Veðurstofan card, travel API, warmer, and product reader code.
2. Add the provider freshness state model:
   - expected/current cycle
   - 10-minute grace
   - stale vs fresh vs refreshing
3. Add or plan the manual refresh run tracking:
   - if SQL is needed, stop and ask Stebbi before writing/running migration unless he explicitly grants migration-file work.
4. Implement the public-ready provider selector UI.
5. Implement Veðurstofan card layout with previous/used/next forecast rows.
6. Add/adjust tests.
7. Run targeted tests and type-check.
8. Handoff to Codex before commit/push/deploy.

## Test Recommendations

Add focused tests for:

- 10-minute grace after expected 3-hour cycle.
- Recently fetched old `atimeIso` is still stale after grace.
- Stale provider state carries through API response.
- Manual refresh endpoint:
  - requires auth / feature access
  - does not accept client-provided station lists
  - does not expose/use `CRON_SECRET` from the browser
  - returns already-current without fetching
  - dedupes in-progress/recent refresh attempts
- Provider selector:
  - renders verified/testing/upcoming groups
  - disables Vegagerðin
  - shows stale/refreshing state for Veðurstofan
  - requires at least one selected provider
- Veðurstofan card:
  - shows departure time
  - shows estimated route/station time
  - shows distance from road
  - shows forecast `atime`
  - shows previous/used/next rows
  - highlights used row
  - links to `vedur.is`

Run at least:

- targeted weather tests touched by this change
- `npm run type-check`

Consider full `npm run test:run` if the change touches provider comparison, travel API, and multiple UI components.

## Things Not To Do Without Explicit Permission

- Do not commit.
- Do not push.
- Do not deploy.
- Do not run Supabase migrations.
- Do not run production cron manually.
- Do not expose `CRON_SECRET` to the client.
- Do not let a public unauthenticated endpoint trigger all-stations Veðurstofan refresh.

## Commands / Actions Codex Ran

Read-only only:

- Read `ai-handoff/README.md`.
- Read `Design.md`.
- Read `ai-handoff/2026-07-14-1506-todo-086-v155-claude-v154-plan-handoff.md`.
- Listed recent `ai-handoff/` files.
- Searched relevant weather/provider/Veðurstofan references with `rg`.
- Ran `Get-Date -Format "yyyy-MM-dd HH:mm"` before creating this file.

Codex created only this handoff file in `ai-handoff/`.

No app code was changed.
No tests were run.
No migration was written or run.
No Supabase, commit, push, or deploy action was performed.

## Localhost Checks For Stebbi

After Claude Code implements this, Stebbi should test the route weather flow on localhost.

Provider selector:

1. Open the route weather page.
2. Confirm the selector is grouped as:
   - `Sannreynt`: met.no
   - `Í prófunum`: Veðurstofan
   - `Væntanlegt`: Vegagerðin
3. Confirm Vegagerðin is visible but disabled.
4. Confirm the selector works on mobile width without horizontal overflow.
5. Confirm at least one provider must remain selected.

Fresh Veðurstofan:

1. Select Veðurstofan.
2. Confirm map, scrubber, worst point, selected point, and all-points list can use Veðurstofan when it has fresh data.
3. Confirm Veðurstofan cards show:
   - departure time
   - estimated time at/near the station
   - distance from road
   - forecast issue time
   - previous/used/next forecast rows
   - used row clearly highlighted
   - vedur.is link

Old Veðurstofan:

1. Test or simulate a stale Veðurstofan state.
2. Confirm the provider selector/summary shows old-data state clearly.
3. Confirm `Sækja ný gögn` appears only when a refresh is allowed.
4. Click `Sækja ný gögn` once.
5. Confirm the UI changes to refreshing / already requested.
6. Confirm another user/session would not be able to repeatedly trigger the same all-stations refresh.
7. If Veðurstofan still returns old data, confirm the UI says that Teskeið tried but the provider still has old data.

Regression checks:

1. met.no-only still behaves as before.
2. met.no + Veðurstofan uses both selected providers.
3. Veðurstofan-only does not show met.no points/cards by accident.
4. Old Veðurstofan data never looks fresh/normal.
5. No Supabase migration, production cron, deploy, commit, or push should be tested casually without explicit approval.
