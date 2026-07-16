# TODO 086 v126 - Codex review of Claude v125 and freshness recommendation

Created: 2026-07-14 05:57
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviewed handoff: `2026-07-13-2300-todo-086-v125-claude-v124-done-prerelease.md`
Prior Codex direction: `2026-07-13-2252-todo-086-v124-codex-blended-calculation-root-cause.md`

## Findings

### 1. Medium - current freshness/stale rule does not match a 3-hour forecast cadence

References:
- `lib/weather/providers/vedurstofan.server.ts:13-15`
- `lib/weather/providers/vedurstofan.server.ts:33-35`
- `lib/weather/providers/vedurstofan.server.ts:278-310`
- `lib/weather/providers/vedurstofan.server.ts:601-611`
- `vercel.json:7-10`

Current code marks Veðurstofan forecast rows fresh/stale from `expires_at`, and `expires_at` is currently derived as:

```ts
expiresAtIso = fetchedAtIso + 90 minutes
```

But current Vercel cron is:

```json
"schedule": "0 */6 * * *"
```

That means if the warmer runs successfully every 6 hours, the same data is marked `stale` for roughly 4.5 hours of each cycle. Since Veðurstofan forecast rows are 3-hour forecasts, this is too strict for user-facing "gömul gögn" and will make normal data look old.

Recommendation:
- Redefine user-facing freshness for Veðurstofan forecasts around the 3-hour cadence.
- Suggested first rule:
  - `fresh/ok`: latest successful fetch or source `atime` is <= 4 hours old.
  - `stale/old but usable`: > 4 hours and <= 8 hours old.
  - `very old/unavailable for assessment`: > 8-12 hours old, depending on how conservative Stebbi wants to be.
- Do not keep 90 minutes as the product-table freshness threshold if the source is expected to update every 3 hours.

Important nuance: "forecast row is for a future `forecast_time`" and "the dataset was fetched recently" are two different concepts. We should avoid calling future forecast rows "gömul gögn" just because they were fetched 91 minutes ago from a service that updates every 3 hours.

### 2. Medium - Vercel cron should be hourly for now, not every 6 hours

Reference:
- `vercel.json:7-10`

Stebbi asked whether to set the frequency in hours in Vercel. My recommendation:

> Use hourly for now.

Prefer a non-zero minute, for example:

```cron
17 * * * *
```

Why hourly:
- It catches the next 3-hour Veðurstofan update quickly without knowing the exact publication minute.
- It gives resilience if one run fails or Vercel skips/delays a run.
- It keeps Supabase product tables warm so users are not waiting on live Veðurstofan calls.
- It is still modest traffic because station fetches are batched.

Later, after we have observed stability and update timing, 2-hour cron may be acceptable. I would not use 6-hour cron for this product layer unless the freshness threshold is also widened and the UI is clearly comfortable showing old validation data.

### 3. Low/medium - v125 correctly makes Veðurstofan display-only, but server still computes `augmentedResult`

References:
- `app/api/teskeid/weather/travel/route.ts:338-365`
- `app/api/teskeid/weather/travel/route.ts:425`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:403-408`

v125 fixed the user-facing bug: `showVedurstofan` no longer swaps the displayed result to the blended result. That is the right product behavior for now.

The server still computes and returns `vedurstofanLayer.augmentedResult`. This is not a release blocker, because it is useful for future explicit "Nota Veðurstofu í mati" work. But it does mean the API still performs the blended calculation even though the UI no longer uses it.

Recommendation:
- Keep it for now if Claude Code wants the future hook.
- Before wider release, decide whether to:
  - keep it hidden for diagnostics, or
  - only compute it when an explicit experimental calculation flag/mode is requested.

### 4. Low - station forecast table needs mobile sanity check

References:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1819-1870`

v125 changes station cards from a single first row to all forecast rows. That fixes the "mysterious 11 m/s" issue, but it can make each station card much taller and denser.

This is probably acceptable for validation, but Stebbi should check 360/390/460 px widths carefully.

## What looks good

- v125 matches the product decision from v124: Veðurstofan is display-only by default.
- `toggleVedurstofan()` now only flips `showVedurstofan`; it no longer changes `result`.
- MET/Yr remains the baseline route assessment.
- Station cards now show all forecast rows, so values that would have affected a future blend are visible.
- No SQL, migration, Supabase operation, production cron run, deploy, push, or commit was performed by Codex during this review.

## Tests run by Codex

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result: exit 0. 2 files passed, 26 tests passed.

```bash
npm run type-check
```

Result: exit 0.

## Design.md notes

Relevant rules checked:
- mobile-first (`Design.md:55`, `Design.md:133`)
- all user-facing text in message files (`Design.md:127`)
- touch targets around 40x40 px (`Design.md:168`, `Design.md:400`)
- binary settings use toggles (`Design.md:310-313`)
- text/controls need sufficient contrast (`Design.md:399`)

v125 is generally aligned. The main design risk is density/wrapping in the multi-row Veðurstofan station cards.

## Recommendation for stale-data semantics

Use these names internally/product-wise:

1. `fresh`
   - Latest successful Veðurstofan dataset fetch/source `atime` is <= 4 hours old.
   - UI label: no warning or "Ný gögn".

2. `stale`
   - Dataset is > 4 hours old but <= 8 hours old.
   - UI label: "Gömul gögn", still usable for validation.

3. `very_stale` or `expired`
   - Dataset is > 8-12 hours old.
   - UI label should be stronger, e.g. "Mjög gömul gögn" or do not include in future assessment experiments.

This is better than 90 minutes because it respects the 3-hour forecast cadence and avoids crying wolf.

## Recommendation for Vercel schedule

For the current validation/product-table phase:

```cron
17 * * * *
```

That is hourly, offset from the top of the hour. If Vercel UI only asks for "every X hours", choose every 1 hour.

Do not keep `0 */6 * * *` unless this is deliberately a low-frequency validation-only mode and the UI accepts that data will often be labelled old.

## Localhost checks for Stebbi

After Claude Code/Stebbi adjust freshness semantics and/or cron:

1. Run the same route as before with default provider state.
2. Turn Veðurstofan on.
3. Confirm route assessment, timeline, status chips, and heatmap do not change.
4. Open "Allir spápunktarnir".
5. Confirm Veðurstofan station cards show all forecast rows and that previously mysterious values can be found in those rows.
6. Check that station data does not say "gömul gögn" immediately after a successful warmer run.
7. If product data is 4-8 hours old, confirm it says "gömul gögn" but still displays.
8. If product data is >8-12 hours old or unavailable, confirm the UI is more cautious.
9. At 360, 390, and 460 px widths, confirm multi-row station cards do not overflow horizontally.

Do not run migrations, Supabase changes, production cron, deploy, push, or commit as part of localhost checks unless Stebbi gives explicit separate approval.

## Suggested next Claude Code task

Ask Claude Code for a small follow-up, not a broad refactor:

1. Change Veðurstofan freshness threshold from 90 minutes to a cadence-aware value, likely 4 hours for `fresh`.
2. Consider adding `very_stale`/`expired` if type changes are not too invasive; otherwise keep `stale` for now and document the future split.
3. Change Vercel cron from every 6 hours to hourly, preferably not at minute 0.
4. Add/adjust tests for freshness boundaries.
5. Keep Veðurstofan display-only by default.
