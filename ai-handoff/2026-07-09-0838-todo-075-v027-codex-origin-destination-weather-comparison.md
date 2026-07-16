# Codex handoff: TODO #75 v027 - Origin/destination weather comparison in summary

Created: 2026-07-09 08:38  
Timezone: Atlantic/Reykjavik

## Context

Stebbi suggested a new, simple comparison between departure weather and destination weather, inspired by compact daily forecast strips. The idea is to add a new section to the weather route summary box that compares the trip origin and destination in one polished, scrubber-like view.

This is a handoff/plan only. Codex did not change app code, SQL, migrations, commits, deployment, Supabase, secrets, or production data.

## Product goal

Help the user quickly see whether the trip starts and ends in meaningfully different weather.

This should answer questions like:

- “Er ég að fara úr betra veðri í verra veður?”
- “Er áfangastaðurinn kaldari, blautari eða vindasamari en brottfararstaðurinn?”
- “Er munurinn nógu mikill til að ég ætti að skoða spána nánar?”

This is extra value beyond the current “mest krefjandi punktur” logic. It should not replace the route-point assessment.

## Design.md alignment

Use `Design.md` as the baseline:

- Mobile-first at 360-460px.
- No card inside card.
- Use structured summary panel patterns inside the existing summary card.
- Prefer `border-y`, `divide-y`, compact rows, and clear labels over nested rounded boxes.
- Avoid horizontal overflow and avoid dense table UI that requires zoom.
- Keep the look calm and product-like, not a weather-site screenshot clone.

## Recommended placement

Place this inside the existing summary box after the main travel assessment rows and before the safety disclaimer/link to Vegagerðin.

Recommended section label:

`Brottför og áfangastaður`

Alternative:

`Veður þar og hér`

Codex recommendation: use `Brottför og áfangastaður` because it is clearer and screenshot-friendly.

## Recommended UI shape

Do not use large icons and big red temperatures like the screenshot reference. Use the idea, not the visual style.

Use a compact two-column comparison:

```text
Brottför og áfangastaður

              Garðabær           Akranes
Tími          mið. 8. júl 22:34   mið. 8. júl 23:30
Vindur        9,1 m/s             7,9 m/s
Hviður        14,2 m/s            12,8 m/s
Úrkoma        0,2 mm/klst         0 mm/klst
Hiti          9,4°C               9,7°C

Áfangastaður er aðeins rólegri: minni vindur og minni úrkoma.
```

On mobile, if two columns become tight, use a vertical comparison with paired rows:

```text
Brottför og áfangastaður

Garðabær · mið. 8. júl 22:34
Vindur 9,1 m/s · Úrkoma 0,2 mm/klst · Hiti 9,4°C

Akranes · mið. 8. júl 23:30
Vindur 7,9 m/s · Úrkoma 0 mm/klst · Hiti 9,7°C

Áfangastaður er aðeins rólegri.
```

The layout can feel “scrubber-like” by using two aligned time/weather cells with a thin connector or divider, but avoid a full mini chart unless the data needs it.

## Data rules

Use forecast data already available in the current route result:

- Origin forecast at selected departure time or nearest available forecast hour.
- Destination forecast at arrival time or nearest available forecast hour.
- Use the same rounded forecast-time wording already used elsewhere, e.g. `spáin þar kl. 23:00`.

No new met.no, Google Maps, Mapbox, or external API calls should be required for the first version.

If origin weather is not already available in the current result, do not add a new API call blindly. First inspect whether the first route point can safely represent the origin. If that is not good enough, document the data gap and ask Stebbi before expanding data fetching.

## Comparison logic

Keep comparison copy conservative and factual. Avoid pretending the app knows why weather changes.

Suggested thresholds for saying something meaningful:

- Wind difference: at least `1.0 m/s`.
- Gust difference: at least `2.0 m/s`.
- Precipitation difference: at least `0.2 mm/klst`.
- Temperature difference: at least `2.0°C`.

Suggested copy examples:

- `Áfangastaður er vindasamari en brottför.`
- `Áfangastaður er þurrari og aðeins hlýrri.`
- `Veðrið er svipað við brottför og komu.`
- `Áfangastaður fer yfir valin veðurmörk.`

Use selected thresholds for warnings:

- If destination wind/gust/precip exceeds selected thresholds, show a warning marker next to that value.
- If origin exceeds thresholds but destination does not, show that too.
- Keep warnings metric-specific, not only row-specific.

## Icon/weather-symbol guidance

The screenshot uses old-school weather icons. For Teskeið, keep it more restrained:

- Use small semantic icons only if they improve scanning.
- Wind direction arrow is useful only if direction data is already present and reliable.
- If direction is not already available, do not invent it or fetch extra data for this first version.
- Temperature can be plain text; avoid big red numbers.
- Use warning icon/marker only when a value crosses selected thresholds.

## Interaction

Add one small link/action in the comparison section:

`Skoða spá fyrir áfangastað`

If origin forecast drawer support exists cleanly, optionally include:

`Skoða spá fyrir brottfararstað`

Do not add too many links in the first version. This section should stay glanceable.

## Relationship to v026 forecast drawer controls

This should not block v026. Treat it as the next small product layer after the forecast drawer has stable sticky filters/thresholds/gusts.

Useful shared logic from v026:

- Threshold warning derivation.
- Gust display semantics.
- Forecast-hour formatting in Icelandic.
- Metric formatting.
- “Nearest forecast hour used” wording.

If shared helper extraction happens in v026, reuse it here instead of creating another parallel helper.

## Suggested files to inspect

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/ForecastDrawer.tsx`
- `lib/weather/travel.ts`
- Existing route summary components/markup inside the weather page
- `messages/is.json`
- `messages/en.json`
- `Design.md`

## Suggested implementation steps

1. Identify where the current summary box gets departure, arrival, destination forecast, and most-demanding route-point data.
2. Confirm whether origin forecast data is already available without extra fetches.
3. Extract or reuse pure helpers for:
   - formatting forecast hour/date in Icelandic,
   - metric formatting,
   - threshold warning severity,
   - simple origin/destination comparison copy.
4. Add a compact `Brottför og áfangastaður` section inside the existing structured summary area.
5. Add translation keys in `messages/is.json` and `messages/en.json`; do not hardcode user-facing text.
6. Add tests for comparison copy and threshold warning logic.
7. Verify mobile layout at 360px, 390px, and 460px.

## Suggested tests

Add or update tests for:

- Destination wind higher/lower/similar than origin.
- Destination precipitation higher/lower/similar than origin.
- Destination temperature higher/lower/similar than origin.
- Threshold warning when destination exceeds selected limits.
- Threshold warning when origin exceeds selected limits.
- No misleading comparison text when one side lacks data.
- Icelandic date/time formatting uses Icelandic locale and 24-hour time.

Run:

- `npm run type-check`
- `npm run test:run`
- `npm run build` if shared helpers or route/client boundaries change.

## Scope boundaries

Do not include in this phase unless Stebbi separately approves:

- New SQL or migrations.
- Supabase/RLS/auth changes.
- New external API calls.
- Mapbox or route-provider work.
- Persisting anything server-side.
- Commit, push, deploy, or production rollout.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost and test at least these routes:

1. Garðabær -> Akranes.
2. Garðabær -> Þorlákshöfn.
3. One longer route, e.g. Akureyri -> Garðabær.

For each route:

1. Pick a departure time and calculate the route weather.
2. Confirm the summary box includes `Brottför og áfangastaður`.
3. Confirm origin and destination names, times, wind, gusts if shown, precipitation, and temperature are readable on mobile.
4. Confirm dates use Icelandic locale and 24-hour time.
5. Confirm no horizontal overflow at 360px and 390px.
6. Confirm warning markers appear when origin or destination values cross selected weather thresholds.
7. Confirm the comparison text is conservative and does not overstate small differences.
8. Confirm existing summary content, the map, most-demanding point card, and forecast drawer still work.
9. Confirm no new network/API behavior is visible unless explicitly approved.

## Óvissa / þarf að staðfesta

- Need to confirm whether reliable origin forecast data is already available from existing route-point data. If not, the first version may need to use the first route point or skip origin comparison until data fetching is deliberately expanded.
- Need to confirm whether Stebbi wants wind direction arrows in this section. Codex recommends deferring direction arrows unless direction data is already present and trustworthy.
- Confidence: medium-high on product/design direction, medium on data availability until Claude Code inspects the current route result shape.

