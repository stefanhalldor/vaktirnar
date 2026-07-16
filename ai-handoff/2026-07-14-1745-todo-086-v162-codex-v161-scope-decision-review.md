# TODO 086 v162 - Codex review: v161 scope decision and recommended execution

Created: 2026-07-14 17:45
Timezone: Atlantic/Reykjavik

## Context

Stebbi reviewed:

- `2026-07-14-1750-todo-086-v161-claude-v158-v160-review-handoff.md`

Stebbi's direction is explicit:

- Do not take unnecessary shortcuts.
- A. In-progress anti-stampede needs migration: **do migration now**.
- B. Manual vs cron metadata needs migration: **add columns now**.
- C. Veðurstofan card layout is a bigger UI change: **finish it now**.
- Prefer building on the shared met.no card work, with parameters/provider model controlling what appears on the cards.

This file captures Codex's review and recommended execution shape.

No Codex implementation was performed. Claude Code still needs explicit execution permission before changing code. Running any Supabase migration still requires explicit Stebbi approval, even if the migration file is written now.

## Codex Position

Stebbi's direction is the right one.

The manual refresh feature is safety-adjacent and provider-cost-adjacent. A shortcut that only checks `finished_at` or cannot distinguish manual vs cron creates exactly the ambiguity Stebbi wants to avoid.

The Veðurstofan card layout should also be completed now. Leaving met.no and Veðurstofan with separate card systems has already caused mismatch between:

- summary `Á leiðinni`
- selected point
- all-points list
- map overlay/detail

This is the right moment to consolidate the model.

## A + B: Migration Now

Claude Code should write a new SQL migration now.

Important boundary:

- Writing the migration file is part of the implementation scope if Stebbi gives Claude Code execution permission.
- Running the migration against Supabase is separate and must not happen without explicit approval from Stebbi.

### Recommended `weather_fetch_runs` columns

Add enough metadata to support:

- cron vs manual
- user-triggered refresh attribution
- in-progress detection
- expected Veðurstofan cycle
- resulting Veðurstofan cycle
- honest UI state

Suggested columns:

```sql
ALTER TABLE public.weather_fetch_runs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'succeeded',
  ADD COLUMN IF NOT EXISTS triggered_by text NOT NULL DEFAULT 'cron',
  ADD COLUMN IF NOT EXISTS triggered_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS trigger_reason text,
  ADD COLUMN IF NOT EXISTS expected_atime timestamptz,
  ADD COLUMN IF NOT EXISTS result_atime timestamptz;
```

Suggested checks:

```sql
CHECK (status IN ('running', 'succeeded', 'failed', 'skipped'))
CHECK (triggered_by IN ('cron', 'manual', 'admin'))
```

Notes:

- Existing rows should remain valid because default `status='succeeded'` and `triggered_by='cron'` are reasonable.
- Do not add a broad RLS policy. Existing table is service-role only; keep it that way.
- If referencing `auth.users`, think carefully. A nullable `triggered_by_user_id uuid` without FK may be safer for this operational log unless the project already uses auth FK patterns consistently.

### In-progress anti-stampede

Claude Code should not rely only on "last finished run".

Recommended behavior:

1. Manual refresh endpoint computes `expected_atime`.
2. It checks for an existing in-progress row:
   - `source='vedurstofan'`
   - `fetch_type='forec'`
   - `status='running'`
   - `finished_at IS NULL`
   - same `expected_atime`, or recent enough to count as the current refresh attempt
3. If found, return `refreshing` / `alreadyRunning`.
4. Otherwise create a run row at start:
   - `status='running'`
   - `triggered_by='manual'`
   - `triggered_by_user_id=user.id`
   - `trigger_reason='stale_cycle_refresh'`
   - `expected_atime=...`
   - `finished_at=null`
5. The warmer/projection updates that row on completion:
   - `status='succeeded' | 'failed' | 'skipped'`
   - `finished_at=now()`
   - `stations_attempted/succeeded/failed`
   - `result_atime`
   - `error_summary`

### Unique guard / lock

Strong option:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS weather_fetch_runs_one_running_vedurstofan_forec_idx
  ON public.weather_fetch_runs (source, fetch_type, expected_atime)
  WHERE status = 'running' AND finished_at IS NULL;
```

This gives a database-level safety net against two users triggering the same cycle at once.

Claude Code should verify Postgres syntax and project migration style before final SQL.

### Refresh endpoint response states

The endpoint should return a provider-state response that UI can trust:

- `alreadyFresh`
- `refreshing`
- `recentlyAttempted`
- `fresh`
- `stillStale`
- `failed`

Do not expose `CRON_SECRET`.
Do not accept client-provided station lists.
Do not let unauthenticated users trigger all-stations refresh.

## C: Shared Card Layout Now

Stebbi's idea to build on the met.no card work is good, with one guardrail:

Do **not** make one giant component with many optional booleans and provider-specific props sprinkled everywhere.

Better approach:

- Extract a shared card shell/view-model.
- Use provider-specific body builders for met.no and Veðurstofan.
- Pass a discriminated union into the card, not an unstructured bag of optional fields.

### Existing code shape

Current relevant pieces:

- `components/weather/RouteWeatherPointDetailCard.tsx`
  - shared met.no detail rows
  - used by met.no route rows and map detail panel
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `RoutePointRow` uses `RouteWeatherPointDetailCard`
  - `VedurstofanPointRow` is still a separate, long station-table style card
- `components/weather/TravelAuditMap.tsx`
  - `PointDetailsPanel` uses `RouteWeatherPointDetailCard`
  - `OverlayPointDetailsPanel` has a sparse provider overlay detail for Veðurstofan

This confirms Stebbi's observation: Veðurstofan does not yet share the same detail-card model.

### Recommended component model

Create a provider-aware shared card, for example:

```ts
type WeatherPointDetailViewModel =
  | {
      provider: 'metno'
      title: string
      status: WindDisplayStatus
      routeSummary: PointSummary
      links: {
        forecast?: string
        maps?: string
        raw?: string
      }
    }
  | {
      provider: 'vedurstofan'
      title: string
      stationId: string
      stationName: string
      status: WindDisplayStatus
      departureIso: string
      etaIso: string | null
      distanceFromOriginM: number | null
      distanceFromRoadM: number
      originDisplay: string
      issuedAtIso: string | null
      usedForecastTimeIso: string | null
      previousRow: VedurstofanForecastRow | null
      usedRow: VedurstofanForecastRow | null
      nextRow: VedurstofanForecastRow | null
      sourceUrl: string | null
      freshness: 'fresh' | 'stale'
    }
```

Exact names can differ. The important part is discriminated `provider`, with a shared shell and provider-specific content.

### Shared shell responsibilities

The shared card shell should handle:

- title / point name
- provider badge
- status badge
- consistent border/background/status styling
- layout density
- link row
- mobile wrapping

Provider-specific body should handle:

- met.no route point facts
- Veðurstofan station facts and previous/used/next forecast rows

This gives reuse without forcing met.no and Veðurstofan into a fake identical data model.

## Required Veðurstofan Card Content

Use the same content model for:

1. worst / most demanding point
2. selected map point
3. all-points list

Required fields:

- `Brottfarartími: kl. {selected departure time}`
- `Áætlaður tími {X km} frá {origin}: kl. {eta}`
- `Spápunktur um {distance} frá veginum.`
- `Spá gefin út kl. {atime}`
- previous forecast row
- used forecast row with visible `Notað í mati`
- next forecast row
- vedur.is link

Important wording:

- `atimeIso` = `Spá gefin út kl. ...`
- `ftimeIso` = `Notuð spá kl. ...` or `Gildir kl. ...`
- Never use `Spá frá kl. 18:00` when 18:00 is the valid forecast time.

## All-Points List Behavior

Do not show the full huge Veðurstofan station table by default.

Default all-points card should show the same previous/used/next rows as the summary/selected card.

Optional future enhancement:

- Add an expander such as `Sjá fleiri spár` to show the full station forecast table.

That expander is not required for the next patch unless it is cheap and clean.

## Sequence Recommendation

Claude Code should do this as one coherent v163 implementation, but in this order:

1. Migration file for `weather_fetch_runs` metadata and running-state.
2. Server/run model:
   - insert running row
   - update on completion
   - support manual/cron context
   - enforce anti-stampede
3. Freshness helper fix from v158.
4. Refresh endpoint:
   - alreadyFresh
   - refreshing
   - recentlyAttempted
   - fresh
   - stillStale
   - failed
5. UI refresh states:
   - no false `done`
   - stale banner/CTA always visible when stale
6. Shared provider-aware weather detail card.
7. Replace Veðurstofan worst/selected/all-points renderers with that card.
8. Tests and type-check.

Reason for this order:

- The UI needs reliable provider/run state.
- The card needs reliable view-model data.
- Tests are easier when server states are not half-plastered.

## Tests Required

Add or update tests for:

### SQL migration tests

- New columns exist.
- New CHECK constraints exist.
- RLS/service-role-only posture is not weakened.
- Existing rollback comment is present if project style expects it.
- In-progress unique index exists if implemented.

### Freshness

- inside grace accepts current cycle
- inside grace accepts immediately previous cycle
- inside grace rejects older cycles
- after grace rejects previous cycle

### Refresh endpoint

- unauthenticated => 401
- no feature access => 403
- already current => `alreadyFresh`
- running row exists => `refreshing`
- recent manual attempt => `recentlyAttempted`
- manual run is recorded as manual with user id and expected cycle
- still old after refresh => `stillStale`
- failure => `failed`
- no CRON_SECRET exposed or required from browser

### Card/view model

- builds previous/used/next rows around station ETA
- used row is marked `Notað í mati`
- `atimeIso` renders as issue time
- `ftimeIso` renders as valid/used time
- all three surfaces consume the shared component or shared view-model

## Design.md Alignment

This work touches UI/cards, so Design.md applies:

- mobile-first
- no nested card-in-card layout
- compact structured rows
- all user-facing text in `messages/is.json` and `messages/en.json`
- status cannot be color-only
- touch targets and wrapping must work at 360-460 px

For the shared card, prefer a calm structured layout:

- station/point title
- status/provider chips
- route timing rows
- forecast issue row
- previous/used/next mini rows
- links

## Things Not To Do

- Do not run the migration against Supabase without explicit Stebbi approval.
- Do not deploy.
- Do not commit or push unless explicitly requested.
- Do not expose `CRON_SECRET` to the client.
- Do not let public unauthenticated users trigger all-stations refresh.
- Do not make a broad "provider:any" abstraction that hides the important differences between met.no and Veðurstofan.

## Codex Answer To Stebbi's Question

It sounds right.

The strongest version is:

- use the existing met.no detail card work as the UX baseline
- extract a shared provider-aware shell
- feed it a discriminated view model
- keep provider-specific rows separate where the data is genuinely different

That gives us reuse and consistency without building a fragile mega-component.

## Localhost Checks For Stebbi

After Claude Code implements this, Stebbi should test:

1. Run a route where met.no only is selected.
   - Existing met.no cards should look and behave as before.

2. Run a route where Veðurstofan only is selected.
   - Worst point should use the shared card layout.
   - Selected point should use the same card layout.
   - All-points list should use the same card layout.

3. Confirm Veðurstofan card copy:
   - `Spá gefin út kl. ...` uses `atimeIso`.
   - `Notuð spá kl. ...` / `Gildir kl. ...` uses `ftimeIso`.
   - `Spá frá kl. 18:00` does not appear when 18:00 is a future valid forecast row.

4. Confirm stale data:
   - If current expected cycle is 15:00 and Veðurstofan data is 09:00, stale banner and `Sækja ný gögn` are visible.
   - Clicking refresh shows honest states.
   - If another session tries during refresh, it sees `refreshing` / recently attempted rather than starting another run.

5. Confirm migration safety:
   - Migration file exists and tests pass.
   - Do not run it in Supabase until Stebbi explicitly approves.

6. Mobile checks:
   - 360 px, 390 px, 460 px.
   - No horizontal overflow.
   - Previous/used/next rows wrap cleanly.
   - Buttons/toggles remain tappable.
