# Codex addendum: TODO #75 v029 - Weather comparison must be a synced scrubber

Created: 2026-07-09 16:27  
Timezone: Atlantic/Reykjavik

## Context

This addendum clarifies Stebbi's intended product shape for the origin/destination weather comparison.

The current Claude v027 implementation is **not** the intended interaction model. It shows two static point summaries plus one comparison sentence. Stebbi intended a scrubber-like, horizontally scrollable comparison where the departure place and destination are shown at the same forecast timestamps, aligned vertically:

- Departure/origin row on top.
- Destination row below.
- Same date/time columns across both rows.
- Both rows scroll together horizontally.
- Default view can use `kl. 12` per day, inspired by vedur.is.
- A detail view should allow users to add or select more comparison times.

This is a handoff/addendum only. Codex did not change app code, SQL, migrations, commits, deployment, Supabase, secrets, or production data.

## Main correction

Do not keep iterating the current v027 static block as the final UI.

Instead, treat it as a first spike that proved the data is likely available, then replace the product shape with a synced comparison strip.

The intended section is closer to:

```text
Brottför og áfangastaður

            Fim 9. júl kl. 12   Fös 10. júl kl. 12   Lau 11. júl kl. 12
Garðabær    vindur · tákn · hiti · úrkoma
Akureyri    vindur · tákn · hiti · úrkoma

[Skoða samanburð nánar]
```

Not:

```text
Garðabær · spáin kl. 16:00
vindur 4,2 m/s · úrkoma 0,4 mm/klst · hiti 10,4°C

Akureyri · spáin kl. 21:00
vindur 2,1 m/s · úrkoma 0,6 mm/klst · hiti 11,8°C

Hægari áfangastaður.
```

## Summary-card version

Inside the existing summary box, add a compact horizontally scrollable strip.

Default content:

- One column per day.
- Default selected time: `kl. 12`.
- Show 3-5 days depending on available forecast coverage and viewport.
- Origin row above destination row.
- The two rows must scroll together because they are one grid/strip, not two independent scrollers.

Column content should be compact:

- Date/day label, Icelandic locale.
- Forecast time, e.g. `kl. 12`.
- Wind, and gust if relevant.
- Small weather symbol if data already supports it.
- Temperature.
- Daily or period precipitation if already available; if not, show hourly precipitation and do not label it as daily total.

Important data warning:

- The vedur.is screenshots show `Heildarúrkoma hvers sólarhrings`.
- Teskeið currently appears to have hourly precipitation (`mm/klst`) in the route forecast rows.
- Do not present hourly precipitation as daily total.
- If daily total is not already available, label it clearly as `úrkoma kl. 12` or `úrkoma á spátíma`.

## Detail view / "Skoða nánar"

Add a clear action from the summary strip:

`Skoða samanburð nánar`

The detail view can be a drawer/sheet/modal consistent with the existing forecast drawer. It should allow the user to control which timestamps appear in the comparison.

Recommended controls:

- Preset segmented control:
  - `Kl. 12`
  - `Morgun / hádegi / kvöld`
  - `Á 3 klst fresti`
  - `Sérsniðið`
- Manual custom time selection:
  - User can add/remove selected hours, e.g. `06:00`, `12:00`, `18:00`, `21:00`.
  - Keep controls mobile-safe; avoid native inputs that trigger mobile zoom unless already handled with >=16px text.
- Optional filter:
  - `Fela nótt`, if it reuses the v026 forecast-drawer filtering work.

The detail view should keep origin and destination aligned by timestamp. It should never show origin at one timestamp and destination at a different timestamp in the same comparison column unless explicitly labeled as nearest available.

## Data alignment rules

For each comparison column:

1. Choose a target timestamp, e.g. `2026-07-10T12:00`.
2. Find the nearest origin forecast row.
3. Find the nearest destination forecast row.
4. Only align them in the same column if both are within an acceptable tolerance, recommended max `90 minutes`.
5. If one side is missing, show `Engin gögn` for that cell, not a misleading comparison.

For the route's selected departure and arrival:

- It is still fine to keep existing summary rows for actual departure and arrival.
- This comparison strip is a different thing: an overview of how the two places compare at shared forecast times.

## Visual design guidance

Use the vedur.is screenshots as concept inspiration only, not as literal style.

Avoid:

- Giant red temperatures.
- Old-school large weather icons if they clash with Teskeið.
- Dense bordered table that causes mobile overflow.
- Independent horizontal scroll areas that drift out of sync.
- Nested cards inside the summary card.

Prefer:

- One horizontal scroll container with CSS grid columns.
- Sticky/left labels for place names if feasible, but only if it does not create mobile jank.
- Light dividers between days.
- Compact typographic hierarchy.
- Semantic warning markers for values over selected thresholds.
- Reuse Design.md structured summary rules: `border-y`, `divide-y`, compact labels, no card-in-card.

## Weather icons / symbols

Only show weather symbols if the existing forecast data contains enough information to do this responsibly.

If symbol code/cloud cover/weather state is not already present in the route or forecast rows:

- Do not add new external API calls just for icons in this phase.
- Use metric-only cells first.
- Add icon support later once data shape is confirmed.

## Threshold warnings

Use selected weather thresholds when displaying values:

- Wind/gust over thresholds should be visually marked in that cell.
- Precipitation over threshold should be visually marked in that cell.
- Keep warnings metric-specific.
- If the destination row has a warning at the same timestamp where origin does not, that should be easy to see.

This work can reuse v026 forecast drawer threshold-warning helpers if they exist.

## Relationship to current v027 implementation

Claude Code should not simply polish the current static section.

Recommended follow-up:

1. Keep any useful data plumbing from v027.
2. Replace the static origin/destination text block with the synced comparison strip.
3. Fix the issues from Codex v028 review if any of the static logic remains temporarily:
   - no `airTemperatureC ?? 0` comparison,
   - include gusts where relevant,
   - improve Icelandic copy.
4. Add `Skoða samanburð nánar` as the entry to the larger comparison view.

If this is too big for one pass, do it in two phases:

- Phase A: Summary strip with default `kl. 12` daily columns.
- Phase B: Detail view with configurable timestamps.

Codex recommends Phase A first, because it validates the intended interaction without building a large settings UI immediately.

## Suggested files to inspect

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/ForecastDrawer.tsx`
- `lib/weather/travel.ts`
- Existing forecast row types and route weather point data
- `messages/is.json`
- `messages/en.json`
- `Design.md`

## Suggested tests

Add tests for the pure data preparation if possible:

- Builds daily `kl. 12` comparison columns from origin and destination forecast rows.
- Aligns origin and destination by the same target timestamp.
- Shows missing data when one side is outside tolerance.
- Does not label hourly precipitation as daily total.
- Marks wind/gust/precip threshold warnings per cell.
- Keeps selected route departure/arrival summary independent from comparison-strip timestamps.

Run:

- `npm run type-check`
- `npm run test:run`
- `npm run build` if shared forecast helpers or route/client boundaries change.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost and test routes with enough forecast coverage, for example:

1. Garðabær -> Akranes.
2. Garðabær -> Akureyri.
3. Akureyri -> Garðabær.

For the summary strip:

1. Confirm the section reads as a synced comparison, not two independent point summaries.
2. Confirm origin is above destination.
3. Confirm columns represent the same timestamp for both places.
4. Confirm default columns use `kl. 12` unless changed.
5. Horizontally scroll the strip and confirm both rows move together.
6. Confirm there is no horizontal page overflow outside the strip at 360px and 390px.
7. Confirm precipitation is labeled correctly as hourly/forecast-time precipitation unless actual daily totals are available.
8. Confirm threshold warnings are easy to see but not visually noisy.

For the detail view, if implemented:

1. Click `Skoða samanburð nánar`.
2. Change presets, e.g. `Kl. 12`, `Morgun / hádegi / kvöld`, and `Á 3 klst fresti`.
3. In custom mode, add/remove one or two times.
4. Confirm origin and destination remain aligned by timestamp.
5. Confirm close/back behavior feels like the existing forecast drawer and does not break scroll state.

## Óvissa / þarf að staðfesta

- Need to confirm whether forecast rows include a weather-symbol code already. If not, skip icons in Phase A.
- Need to confirm whether actual daily precipitation totals are available. If not, do not copy the vedur.is `Heildarúrkoma hvers sólarhrings` concept literally.
- Need to confirm whether the detail view should be the same ForecastDrawer component extended, or a new comparison drawer. Codex leans toward a separate comparison drawer if the UI starts diverging.
- Confidence: high on product correction, medium on exact data availability until Claude Code inspects current forecast row shape.

