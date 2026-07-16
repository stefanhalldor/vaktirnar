# Codex review/addendum: TODO #75 v030 - Make comparison scrubber visual

Created: 2026-07-09 16:43  
Timezone: Atlantic/Reykjavik

## Review target

Reviewed `2026-07-09-1640-todo-075-v029-claude-synced-comparison-scrubber-done` and the current implementation around `app/auth-mvp/vedrid/FerdalagidClient.tsx:972-1066`.

This is a review/addendum only. Codex did not change app code, SQL, migrations, commits, deployment, Supabase, secrets, or production data.

## Product finding

The implementation is now structurally in the right direction:

- Origin row above destination row.
- Same timestamp columns.
- One horizontal scroll area.
- Default daily `kl. 12` comparison.

But visually it is still too much like a compact text/grid report. Stebbi wants it closer to the visual weather-strip feel from the vedur.is screenshots:

- Each date/time column should feel like a small forecast tile.
- Weather state should be glanceable through visual hierarchy, spacing, and ideally an icon/symbol.
- Temperature should be a stronger visual signal.
- Wind/gust/precip should be readable without feeling like raw debug values.
- The section should feel like a mini forecast comparison component, not a plain table.

## Blocking correction before polish/release

### `Skoða samanburð nánar` currently opens the wrong experience

In `FerdalagidClient.tsx:1045-1062`, `Skoða samanburð nánar` opens the existing destination forecast drawer:

```tsx
setForecastDrawerData({
  rows: result.travelPlan!.destinationForecastRows!,
  title: tf('arrivalForecastTitle', { destination: effectiveDestinationName }),
  ...
})
```

That is not the intended behavior.

Expected behavior:

- `Skoða samanburð nánar` should open the **same visual comparison pattern** as the summary strip.
- The detailed view should show origin and destination together, aligned by timestamp.
- The difference is that the detailed view adds controls for customizing visible timestamps.

Do not send users from this link to destination-only forecast rows.

## Desired summary strip visual direction

Keep the synced horizontal structure, but make each date column more visual.

Recommended structure:

```text
Brottför og áfangastaður

          fim. 10. júl        lau. 11. júl        sun. 12. júl
          kl. 12              kl. 12              kl. 12

Garðabær  ↗ 6,7 m/s           ↗ 7,5 m/s           ↑ 7,7 m/s
          [weather symbol]    [weather symbol]    [weather symbol]
          10,8°C              12,5°C              11,7°C
          0 mm                0 mm                0,1 mm

Akureyri  ↗ 4,1 m/s           ↗ 5,2 m/s           ↗ 2,5 m/s
          [weather symbol]    [weather symbol]    [weather symbol]
          13,7°C              18,4°C              17,9°C
          0 mm                0 mm                0 mm
```

Use the vedur.is screenshots as visual inspiration, but keep Teskeið styling:

- light borders/dividers,
- compact typography,
- semantic tokens,
- no giant old-school red temperatures unless Stebbi explicitly asks for that exact style,
- no nested card inside the summary card,
- no horizontal page overflow outside the strip.

## Weather symbols

If forecast rows already include enough data for a weather symbol, use it.

If they do not:

- Do not add new external API calls just for icons in this phase.
- Use a simple placeholder visual hierarchy first:
  - wind line,
  - temperature line as strongest line,
  - precipitation line,
  - optional small status dot/badge from `row.status`.

If icons are feasible, prefer a compact reusable mapping and keep it local/pure. Do not hardcode a pile of visual cases in JSX.

## Wind and gust display

The current `/gust` format is too raw for the more visual strip:

```text
6,7 m/s /10,2
```

Prefer one of these:

- `6,7 m/s` with a small subline `hvið. 10,2`
- `6,7 (10,2) m/s` if space is tight
- `↗ 6,7` and subline `hvið. 10,2`

If a gust crosses selected thresholds, show a small warning marker in that cell.

## Temperature and precipitation hierarchy

Temperature should be easier to scan than in the current text grid:

- Make temperature the strongest metric in the tile after wind/status.
- Keep color restrained. Use warning colors only where semantically meaningful.
- Do not imply warm/cold is good/bad unless frost/ice semantics are implemented.

Precipitation:

- Label or visually position it so it is clear this is forecast-time/hourly precipitation unless true daily totals are available.
- Avoid copying vedur.is `Heildarúrkoma hvers sólarhrings` unless the data is truly daily total precipitation.

## Detailed comparison view

`Skoða samanburð nánar` should open a comparison drawer/sheet, not the destination forecast drawer.

It should reuse the same visual tile pattern as the summary strip, with more control.

Minimum detailed controls:

- Preset segmented control:
  - `Kl. 12`
  - `Morgun / hádegi / kvöld`
  - `Á 3 klst fresti`
  - `Sérsniðið`

Custom mode:

- Let the user add/remove hours such as `06:00`, `12:00`, `18:00`, `21:00`.
- Keep origin and destination aligned by the same target timestamp.
- If one side lacks data within tolerance, show `Engin gögn` for that cell.

Good implementation sequence:

1. First replace the link behavior with a placeholder comparison drawer using the same `kl. 12` visual data.
2. Then add preset controls.
3. Then add custom time controls.

If this is too big for one pass, keep the summary strip visual now and remove/disable `Skoða samanburð nánar` until the correct drawer exists. Do not leave it opening the destination-only drawer under that label.

## Suggested technical approach

Avoid building a second copy of the same markup.

Consider extracting:

- `WeatherComparisonStrip`
  - summary mode: compact, default `kl. 12`, max 3-5 columns.
  - detail mode: larger, controlled timestamp presets.
- `buildComparisonColumns`
  - target timestamps in,
  - origin/destination forecast rows in,
  - aligned columns out.
- `WeatherComparisonCell`
  - place row cell with wind/gust/temp/precip/status/icon.

Keep helpers pure and easy to test.

## Localhost checks for Stebbi

After Claude Code updates this:

1. Open `/auth-mvp/vedrid`.
2. Test Garðabær -> Akureyri or another route where origin/destination weather differs.
3. Confirm `Brottför og áfangastaður` looks like a visual forecast strip, not a plain text table.
4. Confirm origin is the top row and destination is below.
5. Confirm each column aligns the same date/time for both places.
6. Confirm horizontal scrolling moves both rows together.
7. Confirm wind, gust where relevant, temperature, and precipitation are easy to scan.
8. Confirm any weather symbols/icons are based on real available data, or absent if the data is not available.
9. Confirm `Skoða samanburð nánar` opens a comparison view with the same visual pattern, not the destination-only forecast drawer.
10. In the detail view, confirm presets/custom times keep origin and destination aligned.
11. Confirm no horizontal page overflow at 360px and 390px outside the intended scroll strip.
12. Confirm existing destination forecast drawer links still work where they are actually destination-forecast links.

## Óvissa / þarf að staðfesta

- Need to confirm whether current forecast rows include weather-symbol data. If not, skip icons or use a restrained status visual for now.
- Need to confirm whether daily precipitation totals exist. If not, keep precipitation labeled as forecast-time/hourly precipitation.
- Need to decide whether to build the detailed comparison drawer now or temporarily remove the misleading `Skoða samanburð nánar` action.
- Confidence: high on product direction, medium on icon/data feasibility.

