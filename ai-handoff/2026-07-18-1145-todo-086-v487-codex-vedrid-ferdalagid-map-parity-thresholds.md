# 2026-07-18 11:45 - TODO 086 v487 - Codex handoff: /vedrid map parity with /ferdalagid

Created: 2026-07-18 11:45  
Timezone: Atlantic/Reykjavik

Scope:
- Implementation handoff for Claude Code.
- Codex did not change product code.
- Codex did not write or run SQL.
- No commit, push, deploy, Vercel change, Supabase change, or production action.

## What Stebbi Wants In Plain Language

`/vedrid` should stop feeling like a separate prototype map and become the same visual language as `/vedrid/ferdalagid`.

That means:

- same wind/status colors
- same status labels
- same emoji/status pills under the map
- same threshold logic
- same user-adjustable wind limits
- same mental model for map points
- provider toggles for `Vegagerðin (núna)` and `Veðurstofan (spá)`
- a clearer centered bottom CTA named `Ferðalagið`

The point is not to invent another status system. The point is to promote the `/ferdalagid` map/status model into reusable components and make `/vedrid` consume that same core.

## Important Interpretation

`/ferdalagid` has a selected route, so its map points are route-scoped. `/vedrid` has no selected route, so it cannot literally show the same route-sampled points.

For `/vedrid`, "same points" means:

- displayed map markers must be normalized into the same **WeatherMapPoint / WindDisplayStatus** model
- each station marker must use the same classification, colors, status labels, and filter-pill behavior as `/ferdalagid`
- when the user later enters `/ferdalagid`, the same threshold defaults/overrides should carry over

So this is a shared status/presentation contract, not a copy-paste of route geometry.

## Current Relevant Code

Known current pieces:

- `components/weather/TravelAuditMap.tsx`
  - canonical route map filter pills under map
  - uses `ALL_WIND_DISPLAY_STATUSES`
  - uses `WIND_STATUS_UI_META`
  - uses `resolveRoutePointWindDisplayStatus()` / `classifyPointWindDisplayStatus()`

- `components/weather/DepartureHeatmap.tsx`
  - similar status pills and status counts
  - also duplicates pill rendering

- `components/weather/WindStatusBadge.tsx`
  - reusable status badge

- `components/weather/windStatusUi.ts`
  - canonical Tailwind UI metadata for dot, border, label, chip classes

- `lib/weather/windDisplayStatus.ts`
  - canonical status ordering, marker colors, and classifiers

- `components/weather/WeatherOverviewClient.tsx`
  - current `/vedrid` overview adapter
  - already started using `classifyObservationWindDisplayStatus()` for Vegagerðin markers
  - currently still has its own overview threshold bar and provider-shell behavior

- `components/weather/WeatherThresholdBar.tsx`
  - currently collapsible and overview-specific in feel
  - should become a shared inline threshold editor

- `lib/weather/useWeatherThresholds.ts`
  - currently client-local state
  - should become the shared threshold state hook for overview and ferðalagið

- `lib/weather/thresholds.ts`
  - current default `driving` thresholds are 15/25
  - Stebbi now wants defaults to be 10/15

## Main Product Requirements

### 1. Same Status Filter Pills Under The Map

Create/extract a reusable component, for example:

- `components/weather/WindStatusFilterPills.tsx`

It should own the visual rendering currently duplicated in:

- `TravelAuditMap.tsx`
- `DepartureHeatmap.tsx`

Contract idea:

```ts
type WindStatusFilterPillsProps = {
  counts: Partial<Record<WindDisplayStatus, number>>
  visibleStatuses: Set<WindDisplayStatus>
  onVisibleStatusesChange: (next: Set<WindDisplayStatus>) => void
  showAllLabel: string
  showAllButton?: boolean
  alwaysShowWithinLimits?: boolean
}
```

Use:

- `ALL_WIND_DISPLAY_STATUSES`
- `WIND_STATUS_UI_META`
- `teskeid.vedrid.ferdalagid` labels for status names

Then wire it into:

- `/ferdalagid` route map, replacing existing duplicated pill markup
- `/vedrid` overview map, under the map, using station status counts

Do not create a second overview-only status pill component.

### 2. Same Marker Colors And Same Status Comments

Create/extract one status-to-map-marker adapter used by both `/vedrid` and `/ferdalagid`.

The shared source of truth should be:

- `WindDisplayStatus`
- `WIND_STATUS_UI_META`
- `WIND_STATUS_MARKER_COLOR`
- `WindStatusBadge`

For `/vedrid`:

- Vegagerðin points:
  - classify with `classifyObservationWindDisplayStatus({ meanWindMs }, thresholds)`
  - future phase can incorporate gusts after calibration, but do not silently mix gust thresholds now

- Veðurstofan points:
  - classify the station's currently relevant forecast row using the same `WindDisplayStatus` taxonomy
  - default anchor should be "now" on `/vedrid`
  - pick the closest relevant forecast slot around now, not freshness status
  - marker title/status label should say the same class of text as `/ferdalagid`, e.g. `Nálgast óþægindi`, `Óþægilegt`, `Nálgast hættumörk`

Important:
- freshness (`ný/gömul/vantar`) must not drive marker color
- freshness can remain secondary metadata in details/tooltips if useful

### 3. Default Thresholds Become 10 m/s And 15 m/s

Change canonical no-trailer/default driving wind thresholds:

- `cautionWindMs`: 10
- `redWindMs`: 15

Likely place:

- `lib/weather/thresholds.ts`

Be explicit in the handoff after implementation that this changes default classification everywhere that uses `resolveThresholds('none')`, including `/ferdalagid` calculations.

Do not change trailer/caravan defaults in the same pass unless there is a clear reason. The user request is about default wind limits generally; safest first interpretation is no-trailer/default driving.

Expected product effect:

- more points become `Nálgast óþægindi`, `Óþægilegt`, or `Hættulegt`
- this is intentional

### 4. Inline Threshold Controls, Not Hidden Behind "Breyta"

Replace the current collapsed overview threshold bar with a shared inline control.

Requirements:

- no required click on `Breyta`
- show the two wind thresholds directly in the UI
- input font-size at least 16px on mobile
- labels visible, placeholder not used as label
- live-update marker colors and filter counts without refetch
- preserve Design.md mobile rules: no iOS zoom, no horizontal overflow, touch targets sane

Suggested component:

- rename or evolve `WeatherThresholdBar` into `WeatherThresholdControls`
- or create a new shared component and keep the old one only while migrating

Fields:

- `Óþægilegt`
- `Hættulegt`
- unit `m/s`

Validation:

- both finite positive numbers
- `Óþægilegt` must be lower than `Hættulegt`
- show inline error near inputs
- invalid drafts should not corrupt active map classification

### 5. Persist Default Thresholds For Authenticated Users

Stebbi wants logged-in users to be able to save their default values.

This needs a deliberate storage decision. Recommended:

Create a dedicated table instead of adding more columns to `profiles`.

Suggested table:

```sql
public.weather_user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  caution_wind_ms numeric(5,2) not null,
  red_wind_ms numeric(5,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

RLS:

- enabled
- authenticated users can select/insert/update/delete only their own row
- no anon access
- service_role can manage as usual

API:

- `GET /api/teskeid/weather/preferences/thresholds`
- `PUT /api/teskeid/weather/preferences/thresholds`

Validation:

- same bounds as travel API, likely 0-40
- `cautionWindMs < redWindMs`

Client behavior:

- public users: use defaults and local/session state only
- authenticated users:
  - load saved preferences
  - if absent, use 10/15
  - allow `Vista sem sjálfgefið`
  - saved defaults should apply to both `/vedrid` and `/vedrid/ferdalagid`

Important SQL note:
- Claude may write the migration file if Stebbi sends this with `Workflow` and accepts the scope.
- Claude must not run the migration unless Stebbi explicitly says to run SQL.

If this feels too much for one pass:
- Phase A: shared UI + local/session threshold state + defaults 10/15
- Phase B: authenticated persistence with SQL/API

But do not design Phase A in a way that blocks Phase B.

### 6. Put The CTA At The Bottom And Rename It

The current top CTA:

- `Reikna ferðaveðrið`

Should become:

- `Ferðalagið`

Placement:

- centered near the bottom of the `/vedrid` overview page content
- not hidden above the map
- still easy to find

Style:

- more visible/flashy than current, but still Teskeið-native
- use primary/dark foreground button styling
- consider route/car icon if already available via lucide
- do not use gradients, decorative blobs, or marketing hero styling
- keep mobile touch target at least 40px high
- show navigation pending/loading state if route transition waits

Message keys:

- update `messages/is.json`
- update `messages/en.json`
- do not hardcode user-facing text in components

### 7. Provider Toggles Still Exist

Keep provider visibility controls for:

- `Vegagerðin (núna)`
- `Veðurstofan (spá)`

But separate them conceptually from status filter pills:

- provider toggles = show/hide provider layers
- status filter pills = show/hide `Innan marka`, `Nálgast óþægindi`, etc.

The UI should not confuse these.

## Recommended Implementation Sequence

### Phase 1: Extract Shared Status Filter Pills

1. Create `WindStatusFilterPills`.
2. Replace duplicated pill rendering in `TravelAuditMap`.
3. Replace duplicated pill rendering in `DepartureHeatmap` if safe.
4. Add tests for:
   - display order
   - counts
   - toggling a status
   - "show all" reset where applicable

### Phase 2: Normalize `/vedrid` Provider Markers Into WindDisplayStatus

1. Introduce a normalized overview station point view model:

```ts
type OverviewWeatherMapPoint = {
  provider: 'vegagerdin' | 'vedurstofan'
  id: string
  label: string
  lat: number
  lon: number
  status: WindDisplayStatus
  windMs: number | null
  statusLabel: string
}
```

2. Build Vegagerðin points from current measurements.
3. Build Veðurstofan points from now-anchored forecast row.
4. Feed map marker color/title from the same status metadata.
5. Compute status counts from all visible provider points.
6. Render `WindStatusFilterPills` under the map.
7. Filtering should affect both providers, not just Vegagerðin.

### Phase 3: Shared Inline Threshold Controls

1. Convert/evolve `WeatherThresholdBar` into inline always-visible threshold controls.
2. Use same hook/state for `/vedrid`.
3. Prepare `/ferdalagid` to consume same defaults/overrides.
4. Use `useId()` or `idPrefix`; no hardcoded `overview-*` IDs.
5. Inputs must be `text-base` or equivalent 16px.

### Phase 4: Change Defaults To 10/15

1. Update canonical defaults.
2. Update tests that assumed 15/25.
3. Confirm no unexpected trailer/caravan default change.
4. Confirm `/ferdalagid` result classification intentionally becomes stricter.

### Phase 5: Authenticated Saved Defaults

1. Write migration for `weather_user_preferences`.
2. Add API routes for GET/PUT.
3. Add RLS tests / SQL migration tests.
4. Add client load/save behavior.
5. Do not run SQL without explicit Stebbi approval.

### Phase 6: Bottom CTA

1. Move CTA below map/feed content.
2. Rename to `Ferðalagið`.
3. Center it and make it visually stronger.
4. Add pending state for navigation.
5. Confirm both public and authenticated `/vedrid` use correct target route.

## Design.md Requirements

Claude must explicitly account for:

- mobile-first 360/390/460 px
- no horizontal overflow
- no iOS zoom on threshold inputs
- labels visible for numeric inputs
- primary CTA visible but not hero/marketing style
- reusable controls rather than another one-off
- all text in `messages/is.json` and `messages/en.json`

## Suggested Tests

Run at minimum:

```bash
npm run type-check
```

Targeted tests to add/update:

```bash
npm run test:run -- lib/__tests__/windObservationStatus.test.ts
```

Add or update tests for:

- `WindStatusFilterPills`
- threshold default resolution 10/15
- overview station status counts
- Vegagerðin marker color changes when threshold changes
- Veðurstofan now-anchored marker classification
- saved threshold preference API, if Phase 5 included

If SQL migration is written:

- update SQL migration tests
- explicitly state SQL was written but not run

## Risks / Things To Watch

- Changing defaults from 15/25 to 10/15 is product-significant. It will make the app warn more often. That is desired, but it should be named clearly in the handoff.
- If `/vedrid` status filters are implemented separately from `/ferdalagid`, the UI will drift again. Extract first.
- If Veðurstofan marker classification uses freshness instead of forecast wind status, it misses the point.
- If authenticated persistence is squeezed into `profiles` without thinking through RLS and schema ownership, it can create avoidable future mess.
- If the CTA is made fixed/sticky rather than simply lower on the page, test mobile browser chrome and keyboard carefully.

## Localhost Checks For Stebbi

After implementation, Stebbi should test:

1. Open `http://localhost:3004/vedrid` as public.
2. Confirm `/vedrid` map uses the same status colors as `/vedrid/ferdalagid`.
3. Confirm provider toggles still show/hide:
   - `Vegagerðin (núna)`
   - `Veðurstofan (spá)`
4. Confirm status filter pills are under the map and look like `/ferdalagid`:
   - `Innan marka`
   - `Nálgast óþægindi`
   - `Óþægilegt`
   - `Nálgast hættumörk`
   - `Hættulegt`
   - only statuses with counts should show, unless `Innan marka` is intentionally always shown
5. Tighten wind limits to e.g. 5/9 and confirm markers recolor instantly without refetch.
6. Set limits to 10/15 and confirm this is the default when refreshing or opening a new session.
7. Click `Ferðalagið` at the bottom:
   - it should route to the ferðalagið flow
   - it should not feel dead while navigating
8. As authenticated user:
   - change thresholds
   - save as default
   - refresh `/vedrid`
   - confirm saved values load
   - go to `/vedrid/ferdalagid`
   - confirm saved/default values are used there too
9. Test mobile widths 360, 390, and 460 px:
   - no horizontal overflow
   - threshold inputs do not zoom on focus
   - CTA does not overlap content
10. Do not test saved defaults on production unless the migration has been explicitly run and verified.

## Suggested Copy/Paste Prompt For Claude

```text
Workflow

Lestu og rýndu fyrst með gagnrýnum augum:
ai-handoff/2026-07-18-1145-todo-086-v487-codex-vedrid-ferdalagid-map-parity-thresholds.md

Ef þú sérð blocking spurningar, stoppaðu og skilaðu handoff/review.
Ef ekkert blokkerar, framkvæmdu eins stórt öruggt skref og þú treystir þér til, með áherslu á að extract-a reusable status/filter/threshold core áður en /vedrid fær sérlausn.

Ekki commit-a, ekki push-a, ekki deploy-a og ekki keyra SQL.
Ef þú skrifar SQL migration fyrir saved threshold defaults, taktu sérstaklega fram að hún hafi aðeins verið skrifuð en ekki keyrð.
Eftir framkvæmd skaltu strax skila handoff.
```

## Uncertainty / Needs Confirmation

- The saved-defaults part likely needs a new migration and API. This handoff recommends a dedicated `weather_user_preferences` table, but Stebbi should still be aware that this is a schema change and must not be run casually.
- `/vedrid` has no route context, so "same points" is interpreted as "same normalized station-point model and status UI", not literal route sample points.
