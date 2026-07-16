# Codex addendum: TODO #75 v032 - Comparison strip must be visual, detail must be mobile-first

Created: 2026-07-09 17:02  
Timezone: Atlantic/Reykjavik

## Context

Stebbi reviewed the latest comparison strip/drawer after `2026-07-09-1655-todo-075-v030-claude-visual-strip-and-drawer-done`.

The implementation is structurally closer, but still not the intended product experience:

- The summary section still reads like a text/table grid, not a visual forecast image/strip.
- The detail drawer can keep the current comparison/table-like idea, but it must be constrained to mobile app dimensions.
- The detail drawer still lacks timestamp controls.
- Both summary and detail should use “better than the other place” green highlighting.
- The detail view should show forecast comparison as far forward as we have values, not only the first few noon columns.

This is a handoff/addendum only. Codex did not change app code, SQL, migrations, commits, deployment, Supabase, secrets, or production data.

## Product correction

There are now two distinct experiences:

1. **Summary card strip:** should be visual, like a compact weather forecast image/strip.
2. **Detailed comparison drawer:** can be more data-dense, but must be mobile-first and customizable.

Do not make the summary strip look like the detail table. The summary strip is the glanceable visual teaser.

## Summary strip: make it visual

Current summary is still mostly text values in a grid. The desired direction is closer to the vedur.is-style forecast image Stebbi shared:

- Day/date header.
- Forecast time.
- Wind row.
- Weather symbol or visual status block if data supports it.
- Temperature as a strong visual line.
- Precipitation as a smaller footer value.
- Origin and destination aligned in rows.

If symbol icons are not available yet, first phase can still be more visual by:

- Giving each timestamp column a tile-like rhythm with subtle vertical separators.
- Making temperature prominent.
- Using a small status dot/badge or background tint for each tile.
- Using compact wind/gust line and precipitation footer.
- Avoiding raw table feeling.

The summary should feel like:

```text
Brottför og áfangastaður

           fös. 10. júl      lau. 11. júl      sun. 12. júl
           kl. 12            kl. 12            kl. 12

Akureyri   4,1 m/s           5,2 m/s           2,5 m/s
           [symbol/status]   [symbol/status]   [symbol/status]
           13,7°C            18,4°C            17,9°C
           0 mm/klst         0 mm/klst         0 mm/klst

Garðabær   6,7 m/s           7,5 m/s           7,7 m/s
           [symbol/status]   [symbol/status]   [symbol/status]
           10,8°C            12,5°C            11,7°C
           0 mm/klst         0 mm/klst         0,1 mm/klst
```

Visual note:

- This does not need to copy vedur.is exactly.
- It should not become old-fashioned or visually heavy.
- It should clearly stop reading like a plain text table.

## First-phase green highlighting logic

Add “better than the other place” highlighting for direct comparisons in the same timestamp column.

Recommended first phase:

- Lower wind is better: greener value gets highlight.
- Lower gust is better: greener value gets highlight.
- Lower precipitation is better: greener value gets highlight.
- Temperature: do **not** green-highlight warmer/colder yet unless frost/ice or comfort semantics are defined. Keep temperature neutral for now.

Tie/near-tie thresholds to avoid noisy color:

- Wind: only highlight if difference >= `1.0 m/s`.
- Gust: only highlight if difference >= `2.0 m/s`.
- Precipitation: only highlight if difference >= `0.2 mm/klst`.
- Temperature: neutral.

Display guidance:

- Use subtle green text/background/chip, not a loud success state.
- Highlight the metric value itself, not the entire row.
- If one value crosses selected weather thresholds, warning styling should win over “better than the other place”.
- Example: destination wind is lower but still over selected threshold -> show warning, not green.

## Detail drawer: mobile-first requirement

The screenshot shows the detail drawer spanning the desktop viewport, which breaks the app-like mobile sheet expectation.

The comparison detail should behave like a mobile-first drawer/sheet:

- `w-full`
- `max-w-md` or the same max width as the existing forecast drawer
- centered on larger screens with `mx-auto`
- `max-h-[75vh]` or similar
- internal scroll, not page-level layout expansion
- safe-area-aware bottom spacing if needed
- no horizontal page overflow outside intended scroll areas

This is already covered generally by `Design.md`:

- Responsive/mobile-first rules say to design first at 360-460px.
- Mobile app rules say controls/text/page wrapper must not cause horizontal overflow.
- Fixed/sticky actions must respect mobile browser chrome/safe areas.

But Codex recommends adding a future `Design.md` note for drawers/sheets:

> Drawers/sheets in the app should default to mobile-contained surfaces (`w-full max-w-md mx-auto`, internal scroll, safe-area spacing) unless a desktop-wide surface is explicitly justified.

Do not edit `Design.md` in this phase unless Stebbi explicitly asks for that file change.

## Detail drawer: timestamp controls are still missing

The detail drawer currently shows only the same fixed `kl. 12` comparison columns/sections. That is not enough.

The detailed view must add timestamp controls.

Minimum controls:

- `Kl. 12`
- `Morgun / hádegi / kvöld`
- `Á 3 klst fresti`
- `Sérsniðið`

Custom mode:

- Let user add/remove specific hours, for example `06:00`, `12:00`, `18:00`, `21:00`.
- Keep controls at mobile-safe sizes.
- Avoid inputs that cause iOS zoom; if inputs/selects are used, text must be >=16px.
- Keep origin and destination aligned by target timestamp.

If full custom mode is too much in one pass:

- Implement presets first.
- Leave custom mode disabled/hidden with a TODO, not a fake control.

## Detail drawer: show all available forecast values

The detail drawer should show the forecast comparison as far ahead as we have values, not just max 5 noon columns.

Recommended behavior:

- Summary strip: keep short, maybe 3-5 daily `kl. 12` columns.
- Detail drawer:
  - `Kl. 12`: show all available days with noon values.
  - `Morgun / hádegi / kvöld`: show all available days/times that exist.
  - `Á 3 klst fresti`: show all available aligned forecast times, grouped by day.
  - `Sérsniðið`: show all selected custom times across available forecast coverage.

Use tolerance rules:

- Find nearest row on each side for target timestamp.
- If one side lacks data within tolerance, show `Engin gögn` for that cell.
- Do not drop a whole timestamp silently unless neither side has data.

## Data and unit rules

Precipitation:

- The current source values appear to be hourly precipitation (`mm/klst`), not daily totals.
- Summary and detail must label it as `mm/klst` or otherwise clearly say it is forecast-time/hourly precipitation.
- Do not show plain `mm` if it can be mistaken for accumulated/day precipitation.

Weather symbols:

- If `symbolCode` is already available in the data shape, it can be carried through and mapped to compact icons.
- If not, do not add new API calls in this phase.
- Use a visual status block/dot/tint as first phase.

## Suggested implementation sequence

1. Fix precipitation unit labels (`mm/klst`, not plain `mm`).
2. Constrain detail drawer to mobile-contained sheet width.
3. Add green “better than other place” metric highlighting in both summary and detail.
4. Make summary strip visually tile-like, not plain table-like.
5. Add detail drawer timestamp presets.
6. Extend detail drawer to show all available forecast values for the selected preset.
7. Add custom timestamp controls only if scope remains small.

## Suggested tests

Add pure helper tests where possible:

- Lower wind is highlighted green only when difference >= 1.0 m/s.
- Lower gust is highlighted green only when difference >= 2.0 m/s.
- Lower precipitation is highlighted green only when difference >= 0.2 mm/klst.
- Temperature is not green-highlighted by simple warmer/colder comparison.
- Threshold warning beats green “better” highlight.
- Detail columns are generated across all available forecast coverage, not only max 5 days.
- Preset timestamp generation for:
  - `Kl. 12`
  - `Morgun / hádegi / kvöld`
  - `Á 3 klst fresti`

Run:

- `npm run type-check`
- `npm run test:run`
- `npm run build` if helper extraction or component boundaries change.

## Localhost checks for Stebbi

After Claude Code updates this:

1. Open `/auth-mvp/vedrid`.
2. Test Akureyri -> Garðabær and Garðabær -> Akureyri.
3. Confirm the summary comparison looks like a visual forecast strip, not a text table.
4. Confirm the better wind/gust/precip value at each timestamp is subtly green-highlighted.
5. Confirm threshold warning styling beats green highlighting.
6. Confirm precipitation is labeled `mm/klst` or otherwise clearly hourly/forecast-time.
7. Click `Skoða samanburð nánar`.
8. Confirm the drawer is mobile-contained on desktop and mobile, not full-width across the page.
9. Confirm the detail view uses the same green better-than-other-place logic.
10. Confirm timestamp presets exist and change the comparison.
11. Confirm the detail view shows forecast values as far ahead as data exists.
12. Confirm no unintended horizontal page overflow at 360px and 390px.
13. Confirm close/backdrop behavior returns the page to normal scroll state.

## Óvissa / þarf að staðfesta

- Need to confirm whether `symbolCode` is available in `ForecastDrawerRow` or can be carried through safely. If not, skip real weather icons for now.
- Need to confirm exact preset times for `Morgun / hádegi / kvöld`; Codex suggests `09:00`, `12:00`, `18:00`.
- Need to confirm whether Stebbi wants custom timestamp controls in this immediate pass or after presets.
- Confidence: high on product correction, medium on icon feasibility.

