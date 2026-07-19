# 2026-07-19 01:00 - TODO 086 v536 - Claude: v535 overview polish done, prerelease

Created: 2026-07-19 01:00
Timezone: Atlantic/Reykjavik

---

## Devil's advocate review

Before implementing, the following were verified:

1. **v534 autofocus fix confirmed** — `activeField` initializes as `null` in `OverviewRouteLensPanel`, no autoFocus on first paint. Mobile keyboard will not open on `/vedrid` load.

2. **routeDraft=1 + missing/expired draft** — FerdalagidClient now returns early when the marker is present but no valid draft exists. Session restore cannot win in that case.

3. **No migrations needed for this UI pass** — `/vedrid` overview works entirely from the station-explorer API and localStorage. Migrations 82/83/84/85 are NOT needed for any of the tasks in this pass.

4. **Yr label investigation** — `metno_point_forecasts_history` appears only in `lib/__tests__/sql-migration.test.ts` and the SQL migration file itself. No runtime API reader or projector writes to this table. Yr data is NOT wired into the overview or station detail. **Option A** chosen: rename label, do not claim Yr is active.

5. **No SQL in this pass** — confirmed. All five tasks are UI/copy/client changes only.

---

## Task 1 — Wind-focus banner

**Files:** `messages/is.json`, `messages/en.json`, `components/weather/WeatherOverviewShell.tsx`, `components/weather/WeatherOverviewClient.tsx`

New message key `overviewWindBanner` in the `teskeid.vedrid.overview` namespace:

- **is:** `"Þessi fyrsta útgáfa leggur áherslu á vind fyrir fólk sem er á ferð um landið núna."`
- **en:** `"This first version focuses on wind conditions for people travelling around Iceland right now."`

`WeatherOverviewShell` received a new `renderBanner?: () => React.ReactNode` prop. It is rendered directly after the header block (`{title}/{subtitle}`) and before any provider content — making it the first visible body element.

`WeatherOverviewClient` passes:

```tsx
renderBanner={() => (
  <p className="text-xs text-muted-foreground">{tOv('overviewWindBanner')}</p>
)}
```

Design: `text-xs text-muted-foreground` — quiet, does not dominate, no border or card wrapper.

---

## Task 2 — Default-hide low-signal statuses

**Files:** `lib/weather/windDisplayStatus.ts`, `components/weather/WeatherOverviewClient.tsx`

New constant in `windDisplayStatus.ts`:

```ts
export const DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES: ReadonlySet<WindDisplayStatus> = new Set([
  'nalgast-othaegindi',
  'othaegilegt',
  'nalgast-haettumork',
  'haettulegt',
])
```

Hidden by default: `innan-marka`, `no_wind_data`, `no_data`.

`WeatherOverviewClient` now initializes:

```ts
const [visibleStatuses, setVisibleStatuses] = useState<Set<WindDisplayStatus>>(
  new Set(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES),
)
```

`empty Set = show all` semantics are preserved. `Sýna allt` calls `setVisibleStatuses(new Set())` which shows everything. All status pills remain rendered — the user can toggle hidden statuses back on or tap `Sýna allt` to restore full view.

---

## Task 3 — Threshold apply button copy and style

**Files:** `messages/is.json`, `messages/en.json`, `components/weather/WeatherThresholdBar.tsx`

Message keys:
- **is:** `"thresholdBarApply": "Setja"` → `"Nota mörk"`
- **en:** `"thresholdBarApply": "Apply"` → `"Apply thresholds"`

Button style (both always-open and collapsible variants, `replace_all` used to update both at once):

```tsx
// Before: dark filled pill (same weight as primary CTA)
className="ml-auto text-xs font-medium px-3 py-1.5 rounded-full bg-foreground text-background hover:opacity-90 active:opacity-80 transition-opacity"

// After: quiet bordered pill, secondary feel
className="ml-auto text-xs font-medium px-3 py-1.5 rounded-full border border-border hover:bg-foreground/5 active:bg-foreground/10 transition-colors"
```

The `Ferðalagið` CTA remains the dominant action on the page. `Nota mörk` no longer competes with it visually.

---

## Task 4 — Align Núna / Mælt hh:mm in WeatherSourceTimeSelector

**File:** `components/weather/WeatherSourceTimeSelector.tsx`

The left "Núna" button was `flex items-center gap-1.5` (horizontal layout). The right forecast slot buttons are `flex flex-col items-center gap-0.5` (vertical layout). This caused the status dot and labels to sit at a different vertical rhythm.

Fix: left button now matches the right slot layout:

```tsx
// Before:
className={`flex items-center gap-1.5 px-1.5 py-1 rounded transition-colors min-h-[32px] ...`}
<span className="font-medium">{nowLabel}</span>
{nowMeasuredAtLabel && <span className="text-[10px] text-muted-foreground">{nowMeasuredAtLabel}</span>}

// After:
className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded transition-colors min-w-[40px] min-h-[32px] ...`}
<span className="text-[10px] font-medium leading-none">{nowLabel}</span>
{nowMeasuredAtLabel && <span className="text-[10px] text-muted-foreground leading-none">{nowMeasuredAtLabel}</span>}
```

Status dot → `Núna` → `Mælt hh:mm` now stacks vertically, centered, matching the forecast slot rhythm. `min-w-[40px]` prevents the left block from shrinking below the slot width.

---

## Task 5 — Yr label truthfulness (Option A)

**Files:** `messages/is.json`, `messages/en.json`

Yr is NOT wired: `metno_point_forecasts_history` has no runtime reader or writer in `lib/`. The `sourceForecastGroupLabel` was misleadingly showing `"Veðurstofan/Yr"`.

Changed to:
- **is:** `"Veðurstofan (spá)"`
- **en:** `"Veðurstofan (forecast)"`

When Yr is actually wired (Option B), this key will be updated and sql/84 readiness documented separately.

---

## Migration table (v535 requirement)

| Migration | What it does | Status |
|-----------|-------------|--------|
| `sql/81_teskeid_chat_target_type_vegagerdin_station.sql` | Extends chat thread target type for `vegagerdin_station` | READY only if Vegagerðin pulse writes are wanted and migration not yet run. No UI in this pass requires it. |
| `sql/82_weather_user_preferences.sql` | Per-user saved threshold preferences | NOT READY for this pass. `Nota mörk` only applies local state — nothing persisted to DB. |
| `sql/83_vegagerdin_measurements_history.sql` | Vegagerðin measurement history/cache table | NOT READY. No writer or fallback reader is implemented in current branch. |
| `sql/84_metno_point_forecasts_history.sql` | Yr/met.no point forecast history table | NOT READY. No runtime reader or writer exists. Yr label removed (Option A). |
| `sql/85_route_observation_aggregate.sql` | Draft route-observation aggregate table | NOT READY / DO NOT RUN. Marked DRAFT in file header. |

**Stebbi should not run any of these migrations in this pass.** None of the UI changes in v536 require a migration.

---

## Files changed

- `messages/is.json` — overviewWindBanner (added), thresholdBarApply, sourceForecastGroupLabel
- `messages/en.json` — overviewWindBanner (added), thresholdBarApply, sourceForecastGroupLabel
- `lib/weather/windDisplayStatus.ts` — DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES (added)
- `components/weather/WeatherOverviewShell.tsx` — renderBanner prop added, slot rendered after header
- `components/weather/WeatherOverviewClient.tsx` — banner wired, default statuses initialized, import added
- `components/weather/WeatherThresholdBar.tsx` — apply button style and copy
- `components/weather/WeatherSourceTimeSelector.tsx` — Núna button vertical alignment

---

## Commands and exit codes

```
npm run type-check    exit 0

npm run test:run -- lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/windObservationStatus.test.ts
  104 passed (4 test files)
```

---

## SQL status

No SQL run. All five migrations listed above are NOT READY for this pass.

---

## Route intelligence check

- No route/domain changes. RouteObservation, routeDraft, lensResolver untouched.
- No raw Google route content, addresses, or place IDs stored.
- IcelandRoadmap.md: no update needed.

---

## Design.md check

- Mobile-first: all changes use `text-xs`, `text-[10px]`, existing Tailwind tokens. No new font sizes.
- No horizontal overflow introduced. `WeatherSourceTimeSelector` left block is fixed-width and does not scroll.
- No layout shift: button changes use same padding, only classes differ. ThresholdBar height unchanged.
- Banner is `text-xs text-muted-foreground` — quiet, no card, no border.
- `Nota mörk` button uses `border border-border` — does not compete with `Ferðalagið`.
- `ThresholdInput` remains `text-base` (≥16px) — no iOS zoom regression.

---

## Localhost checks for Stebbi

1. Open `/vedrid` on 390px mobile width (Chrome DevTools or device).
2. Expected: keyboard does NOT open automatically. No scroll jump.
3. Expected: a quiet grey line of text appears below the `Veðrið í Teskeið` title: `"Þessi fyrsta útgáfa leggur áherslu á vind fyrir fólk sem er á ferð um landið núna."`
4. Expected: the map and pills default to showing only actionable wind statuses (`Nálgast óþægilegt`, `Óþægilegt`, `Nálgast hættumörk`, `Hættulegt`). `Innan marka`, `Engar vindmælingar`, `Ófullnægjandi gögn` markers are hidden by default.
5. Tap any hidden status pill or `Sýna allt`.
6. Expected: the hidden markers reappear. The filter works correctly in both directions.
7. Adjust a threshold value (Óþægilegt or Hættulegt wind).
8. Expected: `Nota mörk` button is visible, styled with a quiet border — NOT the same dark filled style as `Ferðalagið`. Tap it; thresholds apply.
9. Look at the source/time selector (Vegagerðin / forecast row).
10. Expected: left `Núna` section shows status dot → `Núna` → `Mælt hh:mm` stacked vertically, centred, matching the alignment of the right forecast hour slots.
11. Expected: the forecast group label reads `Veðurstofan (spá)`, NOT `Veðurstofan/Yr`.
12. Open a station detail. Expected: no Yr value or Yr label appears anywhere (Yr not wired).
13. Confirm no SQL has been run, no production change made.

No SQL, Supabase, Vercel, commit, push, or deploy action is part of this pass.
