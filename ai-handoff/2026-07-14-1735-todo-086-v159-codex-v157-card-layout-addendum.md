# TODO 086 v159 - Codex addendum: Veðurstofan card layout and time semantics

Created: 2026-07-14 17:35
Timezone: Atlantic/Reykjavik

## Context

Stebbi reviewed the v157 prerelease UI and reported that the Veðurstofan card layout still has not changed in the way requested.

This addendum should be applied together with:

- `2026-07-14-1732-todo-086-v158-codex-v157-prerelease-review.md`

No implementation permission is implied by this file. Claude Code should wait for explicit execution permission before changing code.

## Stebbi Feedback

Stebbi expected the Veðurstofan card/details to be materially the same and shared between all three surfaces:

1. The worst / most demanding point.
2. The selected weather point.
3. The all-points list.

Current problem in v157 screenshots:

- The all-points list still shows a long station forecast table.
- The worst point card only shows:
  - station name
  - status badge
  - wind
  - estimated time
- The selected point card is similarly sparse.
- The summary `Á leiðinni` text says different things from the detail card.
- It says `Spá frá kl. 18:00`, but current time is `17:34`, so that wording implies the forecast was issued in the future.

The underlying semantic issue:

- `ftimeIso` / forecast row time is the time the forecast is valid for.
- `atimeIso` is the time the Veðurstofan forecast was issued/generated.
- The UI must not call `ftimeIso` "spá frá kl.".

## Blocking UX / Copy Finding

### High - `Spá frá kl. 18:00` is semantically wrong when 18:00 is the used forecast row time

In the summary screenshot, the app displays:

`Hellisheiði · vindur 12 m/s · Spá frá kl. 18:00`

But `18:00` is the forecast-valid time being used for the route estimate. It is not the forecast issue time. The station card shows the actual issue/source time as:

`Spá frá kl. 09:00`

So the app is using the same wording for two different concepts:

- forecast issue/generated time (`atimeIso`)
- forecast valid/used time (`ftimeIso`)

Required fix:

- For `atimeIso`, use wording like:
  - `Spá gefin út kl. 09:00`
  - or `Veðurspá á þessum stað frá kl. 09:00` if Stebbi prefers that phrasing.
- For the selected/used `ftimeIso`, use wording like:
  - `Notuð spá kl. 18:00`
  - or `Gildir kl. 18:00`

Do not show `Spá frá kl. 18:00` when `18:00` is merely the valid forecast row.

## Required Shared Component

Claude Code should stop rendering three different Veðurstofan details and extract a shared component.

Suggested component:

- `VedurstofanPointWeatherCard`
- location can be local to `FerdalagidClient.tsx` for a first pass, but a real component under `components/weather/` is preferable if it is reused across map/detail/list.

The component should be used for:

1. Summary / worst point when the decisive provider is Veðurstofan.
2. Selected map point / `Valin veðurspá`.
3. Veðurstofan section under `Allir spápunktar á leiðinni`.

The component may have styling variants, but the **content model must be the same**. If a compact variant is used in summary, it must still contain the same facts or provide a clear expansion using the same component data.

## Required Content Model

For a Veðurstofan point/station, show:

1. `Brottfarartími: kl. {selected departure time}`
2. `Áætlaður tími {X km} frá {brottfarastaður fallbeygður}: kl. {eta/route station time}`
3. `Spápunktur um {distance} frá veginum.`
4. `Spá gefin út kl. {atime}`
5. Previous forecast row:
   - `Kl. {previous forecast valid time}: {values}`
6. Used forecast row:
   - `Kl. {used forecast valid time}: {values}`
   - visually mark this row as the used row, e.g. `Notað í mati`
7. Next forecast row:
   - `Kl. {next forecast valid time}: {values}`
8. Link to the station on `vedur.is`.

Forecast values should follow the current domain format:

`5 m/s S · 1,3 mm/klst · 12°C · Lítils háttar rigning`

If previous or next row is missing, omit that row. Do not show empty placeholders.

## All-Points List

The all-points list should not show a huge uncurated forecast table by default.

Instead, for each Veðurstofan station near the route, show the shared card centered on the relevant ETA/used forecast row:

- previous row
- used row
- next row

If Stebbi later wants the full station table, it can be behind an expander like `Sjá fleiri spár`, but the default card should match the worst/selected card content.

## Summary `Á leiðinni`

The summary should use the same semantic content as the shared card.

For example, instead of:

`Hellisheiði · vindur 12 m/s · Spá frá kl. 18:00`

Use a structured summary:

- `Hellisheiði`
- `Áætlaður tími 35 km frá Reykjavík: kl. 18:00`
- `Spá gefin út kl. 09:00`
- `Notuð spá kl. 18:00: 12 m/s SSA · 0,8 mm/klst · 9°C · Lítils háttar rigning`

If the summary needs to stay shorter, it should still avoid the wrong phrase `Spá frá kl. 18:00`.

## "Gömul gögn" Label

Stebbi has said this before and the screenshot still shows `gömul gögn` on station cards.

Required:

- Do not show a casual tiny `gömul gögn` badge on normal station cards.
- Old/stale provider state belongs in the provider/summary stale banner and refresh flow.
- If stale Veðurstofan data is used in calculation, the result itself must carry an obvious degraded-state warning.
- Fresh/normal cards should not include `gömul gögn`.

This also ties into v158: the freshness bug must be fixed so old data cannot be mislabeled as fresh.

## Design.md Alignment

This change touches structured cards and summary panels, so use `Design.md` guidance:

- Mobile-first.
- No nested cards inside cards.
- Use compact structured rows for `Brottför`, `Á leiðinni`, and forecast-row details.
- Keep text hierarchy clear:
  - station name/title
  - route timing
  - forecast issue time
  - previous/used/next forecast rows
- All user-facing strings must go into `messages/is.json` and `messages/en.json`.
- Do not rely on color alone for the used forecast row; include text like `Notað í mati`.

## Recommended Implementation Shape

Create a small view model before rendering:

```ts
type VedurstofanPointCardViewModel = {
  stationName: string
  stationId: string
  providerLabel: string
  departureIso: string
  etaIso: string | null
  distanceFromOriginM: number | null
  distanceFromRoadM: number
  originDisplay: string
  atimeIso: string | null
  usedForecastTimeIso: string | null
  previousRow: VedurstofanForecastRow | null
  usedRow: VedurstofanForecastRow | null
  nextRow: VedurstofanForecastRow | null
  sourceUrl: string | null
  status: WindDisplayStatus
  freshness: 'fresh' | 'stale'
}
```

Exact names can differ, but the key is:

- derive previous/used/next once
- pass the same data to all three surfaces
- do not recompute copy differently in summary vs selected vs list

## Tests / Verification To Add

Add focused tests where practical:

- Helper selects previous/used/next forecast rows around ETA.
- Used row is nearest valid forecast row to station ETA.
- `atimeIso` is rendered as forecast issue time.
- `ftimeIso` is rendered as used/valid forecast time, not as `Spá frá`.
- All three surfaces use the shared card/component or shared formatter/view model.

At minimum, grep/static review should show that the phrase equivalent to `Spá frá kl.` is not used for forecast valid time.

## Relationship To v158

This addendum does not replace v158. Both are needed.

v158 blockers:

- grace window accepts arbitrarily old data
- refresh anti-stampede is not safe while in progress
- manual refresh is not recorded as manual
- UI reports refresh as done on failure

This v159 addendum:

- fixes the missing shared Veðurstofan card/details layout
- fixes the `atimeIso` vs `ftimeIso` wording problem
- removes casual `gömul gögn` card label

## Localhost Checks For Stebbi

After Claude Code fixes this, Stebbi should test:

1. Run a route where Veðurstofan is selected and contributes the worst point.
2. In the summary `Á leiðinni`, verify the Veðurstofan detail shows the same facts as the card:
   - station name
   - departure time
   - estimated time near station
   - distance from road
   - forecast issue time
   - used forecast row
3. Click/select a Veðurstofan point on the map.
4. Verify `Valin veðurspá` uses the same shared card content.
5. Open `Allir spápunktar á leiðinni`.
6. Verify each Veðurstofan station uses the same card structure, not the huge default full table.
7. Verify wording:
   - `Spá gefin út kl. 09:00` or equivalent refers to `atimeIso`.
   - `Notuð spá kl. 18:00` / `Gildir kl. 18:00` refers to the used forecast row.
   - The UI never says `Spá frá kl. 18:00` if 18:00 is a future valid-time row.
8. Verify `gömul gögn` is not shown as a casual badge on normal station cards.
9. Verify mobile width has no horizontal overflow and the previous/used/next rows wrap cleanly.
10. Do not run Supabase migrations, production cron, deploy, commit, or push without explicit approval.
