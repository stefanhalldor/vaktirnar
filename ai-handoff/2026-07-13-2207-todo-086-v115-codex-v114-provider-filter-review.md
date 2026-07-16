# TODO 086 v115 - Codex review of Claude v114 provider filter prerelease

Created: 2026-07-13 22:07
Timezone: Atlantic/Reykjavik

Review target: `2026-07-13-2200-todo-086-v114-claude-v113-done-prerelease.md`

## Findings

### 1. Medium/high - Veðurstofan "points" are built per route sample, not as distinct provider/station points

In `app/api/teskeid/weather/travel/route.ts:346-372`, `layerPoints` is built by looping over every `pointForecasts` entry and mapping each route point to the nearest Veðurstofan station.

That means the same station can appear multiple times in the Veðurstofan section if several MET/Yr route samples map to the same station. The fetch side explicitly dedupes station IDs in `lib/weather/providers/vedurstofanStations.ts:355-367`, but the UI payload re-expands them per route point.

Then `app/auth-mvp/vedrid/FerdalagidClient.tsx:1290-1295` renders one `VedurstofanPointRow` per `vedurstofanLayer.points` entry.

Why this matters:

- Stebbi asked for the point set to grow from `72` to something like `72 + Veðurstofan/Vegagerðin points`.
- A user reading "Veðurstofan punktar" will likely expect provider/station points, not repeated nearest-station mappings for every MET/Yr route sample.
- On real routes this can become noisy and misleading: e.g. 72 MET/Yr samples plus many repeated station cards, instead of a smaller set of distinct stations along/near the route.

Recommended fix:

- Decide explicitly whether the Veðurstofan UI list is station-based or route-sample-based.
- For Stebbi's current product intent, I recommend station-based display: one row/card per unique station used on the route, with optional "used by X route points" metadata if helpful.
- Keep per-route-point mapping internally for blending if needed, but expose a deduped provider-point collection for "Allir spápunktarnir".

### 2. Medium - MET/Yr route cards are still not provider-labelled, and can become blended while looking like plain met.no

`app/auth-mvp/vedrid/FerdalagidClient.tsx:404-411` swaps `result` between the baseline result and `vedurstofanLayer.augmentedResult` when Veðurstofan is toggled.

But the existing MET/Yr rows remain the same `RoutePointRow` UI. In `app/auth-mvp/vedrid/FerdalagidClient.tsx:1764-1782`, `RoutePointRow` only adds wind/status badges via `headerExtra`; it does not show a `met.no` provider badge.

Why this matters:

- Stebbi explicitly asked whether we should "setja þá met.no á spjöldin sem eru frá met.no".
- When Veðurstofan is on, these rows are no longer pure baseline MET/Yr values; they are the augmented route assessment rows. The UI still looks like the same old MET/Yr route point list.
- The provider filter row at the top is useful, but it does not solve provider clarity at the actual point/card level.

Recommended fix:

- Add provider/source display into the shared point card model, not only the filter panel.
- At minimum, label existing route point cards as `met.no` when baseline is shown.
- If `showVedurstofan` means the route point values are max-blended, label the affected route result clearly, for example `met.no + Veðurstofan (í prófun)` or keep the MET/Yr baseline rows separate from Veðurstofan station rows.
- Avoid a state where a row visually reads as `met.no` while the values are actually blended with Veðurstofan.

### 3. Medium - The Veðurstofan switch still has a small actual click/touch target

The row has `min-h-[40px]`, but the interactive element is only the button at `app/auth-mvp/vedrid/FerdalagidClient.tsx:891-909`, with `h-5 w-9`.

Design.md says touch targets should generally be at least 40x40 px. The row height does not help if the click handler is only on the small switch.

Recommended fix:

- Make the whole Veðurstofan row a button/switch control with `min-h-[40px]`, or
- keep the visual switch small but wrap it in a 40x40 interactive button area, and make the label clickable too.

This was already the main accessibility issue in v111, so I would fix it before release.

### 4. Low/medium - Layer status says `available` even when every returned station row is stale

In `app/api/teskeid/weather/travel/route.ts:375-378`, `layerStatus` is:

- `unavailable` when no layer points exist
- `partial` when any mapped point is unavailable
- otherwise `available`

That means all-stale data is still `available`. The test at `lib/__tests__/weather-travel-api.test.ts:335-347` currently locks that in by expecting `available` for a stale station.

Why this matters:

- Stebbi has been clear that old/stale weather data must be explicitly surfaced.
- Per-row stale text exists in `VedurstofanPointRow`, but the top-level layer status can still make stale-only data look fully available to future UI code.

Recommended fix:

- Either extend the layer status model to include stale/partial-stale, or
- keep the current status but ensure every summary UI derives visible freshness from `stalePointCount`.

This does not have to block local testing, but it should not be forgotten.

### 5. Low - Veðurstofan row units are hardcoded and partly Icelandic in the English UI

`app/auth-mvp/vedrid/FerdalagidClient.tsx:1798-1806` hardcodes values like `m/s`, `mm/klst`, and `°C`.

`m/s` and `°C` are probably fine, but `mm/klst` is Icelandic and will appear in English too. This is small, but it conflicts with the "all user-facing text in messages" rule.

Recommended fix:

- Use existing formatting helpers if available, or add a tiny localized unit string for precipitation rate.

## What looks good

- The provider filter is now near the summary/result card, which matches Stebbi's latest direction.
- The old standalone Veðurstofan card below the map was removed.
- `Vegagerðin (í vinnslu)` is visible but not interactive.
- API access is still gated by both env flag and per-user `elta-vedrid` check.
- Product-table reads are fail-open and time-limited.
- The previous stale drawer issue is addressed by clearing drawer state before toggling.
- Veðurstofan station rows do not show Yr/met.no links, and `vedur.is` links are conditional.

## Tests run by Codex

Command:

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result:

- exit 0
- 2 test files passed
- 24 tests passed

Command:

```bash
npm run type-check
```

Result:

- exit 0

## Release recommendation

I would not call v114 final yet.

It is probably fine as a local/prerelease experiment behind the flag, but before release I recommend a small v116 patch focused on:

1. fixing the actual 40x40 switch hit target;
2. making the Veðurstofan list station/provider-point based or explicitly grouped/deduped;
3. adding provider labels to MET/Yr route point cards and clarifying blended rows when Veðurstofan is enabled.

The first two are the most important. The rest can be follow-up if Stebbi wants to keep the patch small.

## Suggested next instruction to Claude Code

```text
Claude Code, rýndu v115 og gerðu lítinn v116 patch áður en þetta fer í release.

Markmið:
1. Laga Veðurstofan switch þannig að raunverulegur clickable/touch target sé minnst ~40x40 og labelið sé líka hluti af controlinu.
2. Ekki birta sömu Veðurstofustöð endurtekið sem marga "Veðurstofan punkta" nema það sé skýrt groupað. Fyrir "Allir spápunktarnir" vil ég frekar sjá provider/station-punkta dedupe-aða eftir stationId, með skýrum Veðurstofan provider badge.
3. Setja provider label á MET/Yr route point cards, t.d. `met.no`.
4. Ef Veðurstofan toggle er on og route-result gildin eru blended, passa að UI láti ekki eins og þau séu hrein met.no gildi. Annaðhvort merkja þau sem `met.no + Veðurstofan (í prófun)` eða halda baseline MET/Yr og Veðurstofan station rows skýrt aðskildum.

Ekki breyta SQL, migrations, cron, Supabase config, commit-a, push-a eða deploya.
Keyrðu targeted tests og type-check og skilaðu prerelease handoff með Localhost checks for Stebbi.
```

## Localhost checks for Stebbi

After Claude Code patches v114/v115:

1. Open the route weather flow with the experimental flags/access enabled.
2. Confirm the `Gagnaveitur` filter is near the top of the summary/result area.
3. Tap the `Veðurstofan (í prófun)` row, not only the tiny switch. The whole row/label should toggle comfortably on mobile.
4. Open "Allir spápunktarnir" with Veðurstofan on.
5. Confirm MET/Yr rows have a visible `met.no` provider label.
6. Confirm Veðurstofan rows/cards are deduped or clearly grouped by station, not repeated confusingly for every route sample.
7. Confirm Veðurstofan rows/cards show `Veðurstofan (í prófun)` and do not show Yr/met.no links.
8. Confirm `Vegagerðin (í vinnslu)` is visible but disabled.
9. Toggle Veðurstofan on/off several times and confirm forecast/comparison drawers close and do not show stale previous-state rows.
10. Test at 360, 390, and 460 px widths for no horizontal overflow and usable tap targets.
11. With the feature flag/access off, confirm ordinary route weather remains unchanged.

Do not test production cron, Supabase migrations, or production data changes as part of this UI check unless Stebbi separately approves that.

## Uncertainty / needs confirmation

Confidence is high on findings 2 and 3 because they are directly visible in the diff.

Finding 1 is high-confidence as a code-path risk, but the exact visible severity depends on real route data. The implementation loops over route points, so duplicate stations are possible and likely; Stebbi should verify on a familiar local route.
