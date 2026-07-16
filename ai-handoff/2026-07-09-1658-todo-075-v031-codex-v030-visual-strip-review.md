# Codex review: TODO #75 v031 - Claude v030 visual strip + drawer

Created: 2026-07-09 16:58  
Timezone: Atlantic/Reykjavik

## Review target

Reviewed `2026-07-09-1655-todo-075-v030-claude-visual-strip-and-drawer-done.md` and the current diff in:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`

Codex did not change app code, SQL, migrations, commits, deployment, Supabase, secrets, or production data.

## Findings

### Medium - `Skoða samanburð nánar` still does not meet the requested interaction

`app/auth-mvp/vedrid/FerdalagidClient.tsx:1209-1283` opens a comparison drawer now, which is better than opening the destination-only forecast drawer. But the drawer still only renders the same fixed `kl. 12` columns from `comparisonCols`. The requested behavior was that `Skoða samanburð nánar` opens the same visual comparison pattern with controls for customizing timestamps.

The helper is also fixed to noon only at `app/auth-mvp/vedrid/FerdalagidClient.tsx:1320-1363`.

Recommendation:

- Either implement the minimum detail controls now:
  - `Kl. 12`
  - `Morgun / hádegi / kvöld`
  - `Á 3 klst fresti`
  - `Sérsniðið`
- Or change the handoff/status to say this is only Phase A and not ready as the requested detail feature.
- Do not call this complete if the detailed view cannot customize timestamps.

### Medium - Precipitation is displayed as `mm`, but the source value appears to be hourly precipitation

The summary strip and drawer display precipitation as plain `mm`:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1018`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1046`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1251`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1274`

These values come from `ForecastDrawerRow.precipitation.value`, which is based on `precipitationMmPerHour` elsewhere in the weather logic. Plain `mm` reads like accumulated precipitation and becomes especially risky because the design inspiration screenshot shows daily totals.

Recommendation:

- Use `mm/klst` in the cells, or add a clear label such as `úrkoma kl. 12`.
- Do not imply daily precipitation totals unless the data is actually daily total precipitation.
- Add a localhost check specifically for this copy/label.

### Medium - Row status color is applied to the wind line, even when the warning may be caused by precipitation or gusts

The strip and drawer apply `statusTextClass(row.status)` to the wind value:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1006`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1034`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1239`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1262`

But `row.status` is the overall status for that forecast row. If the row is yellow/red because of precipitation or gusts, coloring only the average wind value can mislead the user into thinking wind is the problem.

Recommendation:

- Use metric-specific warning markers instead:
  - wind line warning for wind threshold,
  - gust subline warning for gust threshold,
  - precipitation line warning for precipitation threshold.
- If keeping a row-level color, show it as a small status badge/dot for the whole tile rather than coloring wind only.

### Low - English locale gets Icelandic `kl. 12`

`buildKl12Columns` hardcodes `timeLabel: 'kl. 12'` at `app/auth-mvp/vedrid/FerdalagidClient.tsx:1361`, even when `locale` is English.

Recommendation:

- Use `isIs ? 'kl. 12' : '12:00'` or a translated message key.
- Add a quick English localhost check if this UI is exposed in English.

### Low - Detail drawer should match existing drawer constraints on desktop

The new drawer container at `app/auth-mvp/vedrid/FerdalagidClient.tsx:1215` does not appear to use the same `w-full max-w-md mx-auto` style as the existing forecast drawer. On desktop it may stretch across the whole viewport.

Recommendation:

- Constrain the drawer width consistently with the existing forecast drawer.
- Add a subtle backdrop if needed for visual hierarchy.
- Verify 360px, 390px, and desktop widths.

## Non-blocking product note

This is more visual than v029, but still not fully like the vedur.is inspiration because there is no weather symbol/icon. The source forecast pipeline appears to have `symbolCode` upstream (`lib/weather/forecast.ts`), but `ForecastDrawerRow` may not expose it yet.

Do not add new API calls for icons. If symbol data can be carried through safely, add it later. If not, the current metric-only visual strip can be acceptable as an interim version.

## What looks good

- The static v027 text block has been replaced by a synced strip.
- Origin and destination are now aligned by timestamp.
- `Skoða samanburð nánar` no longer opens the destination-only forecast drawer.
- Gusts are displayed as `hvið.` instead of the raw `/X.X` style.
- The basic summary strip layout is directionally right.

## Suggested next step

Ask Claude Code for a focused v032 follow-up:

1. Fix precipitation labels/units.
2. Replace row-status-on-wind coloring with metric-specific warning markers or a row badge.
3. Localize `kl. 12` for English.
4. Either implement minimum timestamp controls in the comparison drawer or clearly mark the drawer as Phase A only.
5. Constrain drawer width consistently.

Codex would not block a localhost visual review of the current version, but would block release if the precipitation unit stays misleading.

## Localhost checks for Stebbi

After the follow-up:

1. Open `/auth-mvp/vedrid`.
2. Test a route with different origin/destination weather, e.g. Garðabær -> Akureyri.
3. Confirm the summary strip is visual enough to scan quickly.
4. Confirm precipitation is not labeled as plain `mm` unless it is truly accumulated precipitation.
5. Confirm yellow/red styling points to the metric that crosses a threshold, not always wind.
6. Click `Skoða samanburð nánar`.
7. Confirm the detail view either has timestamp controls or is clearly not presented as the full customizable feature yet.
8. Confirm the drawer width feels like the rest of the app on mobile and desktop.
9. Confirm no horizontal page overflow at 360px and 390px outside the intended strip.
10. Confirm English locale does not show Icelandic `kl. 12`.

