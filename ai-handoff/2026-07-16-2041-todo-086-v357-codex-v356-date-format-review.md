# TODO 086 v357 - Codex review of v356 date labels

Created: 2026-07-16 20:41
Timezone: Atlantic/Reykjavik
Author: Codex
Related handoffs:
- `2026-07-16-1924-todo-086-v355-codex-date-labels-weather-cards-handoff.md`
- `2026-07-16-2025-todo-086-v356-claude-v355-done-prerelease.md`

## Findings

1. **High: v356 was committed, pushed and released without explicit approval**

   `ai-handoff/2026-07-16-2025-todo-086-v356-claude-v355-done-prerelease.md:13` states that the change was committed, pushed and is live on Vercel without Stebbi's explicit permission. That is a workflow violation under `WORKFLOW.md`.

   Action: treat the current state as already live, but do not allow the next pass to commit, push or deploy unless Stebbi explicitly says so. Claude Code should make the follow-up locally only and produce a handoff.

2. **Medium: Icelandic month labels still use the old abbreviations**

   `components/weather/travelAuditMap.helpers.ts:190-206` and `components/weather/travelAuditMap.helpers.ts:220-226` still use:

   ```ts
   ['jan', 'feb', 'mar', 'apr', 'maí', 'jún', 'júl', 'ágú', 'sep', 'okt', 'nóv', 'des']
   ```

   That directly causes strings like `sunnudaginn 19. júl kl. 10:00`, which Stebbi explicitly does not want. The product month contract should be:

   ```ts
   ['jan.', 'feb.', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'sep.', 'okt.', 'nóv.', 'des.']
   ```

   This affects both the summary text via `formatLongDepartureDateTime()` and the combined met.no / Veðurstofan weather cards via `formatCompactDateTime()`.

3. **Medium: the heatmap day label still uses the old month labels**

   `components/weather/DepartureHeatmap.tsx:19-27` has its own separate month array with the same old abbreviations. This is the exact label visible under the scrubber in Stebbi's screenshot: `Sun (19. júl)`.

   Action: do not keep a second month source here. Either export a shared Icelandic month-label helper from `travelAuditMap.helpers.ts` or move the month constants into a small date-format module used by both `DepartureHeatmap` and the weather cards.

4. **Medium: Veðurstofan forecast rows still hide the date when all visible rows are on the same day**

   `components/weather/VedurstofanPointCard.tsx:215-224` only passes `showDate={true}` to `ForecastRowLine` when the prev/used/next rows span more than one UTC day. Stebbi's newest requirement is broader: the day/date should be visible on all Veðurstofan forecast values on the card, especially when the selected departure is tomorrow or later.

   Current behavior still allows this ambiguous display on a tomorrow card:

   ```text
   12:00 ...
   15:00 ...
   18:00 ...
   ```

   Action: for the Veðurstofan point card, use date-aware forecast-row labels consistently, not only across midnight. If the full compact label is too wide on mobile, solve it in layout with a two-line/small metadata label rather than falling back to time-only.

5. **Low: Forecast drawer has a third date-format path that can drift from the product contract**

   `components/weather/ForecastDrawer.tsx:21-26` uses `Intl.DateTimeFormat(... month: 'short')`. That may produce browser/locale-specific short forms that do not match the product list above. This is outside the narrow v356 card change but it is another weather forecast surface with dates.

   Action: if Claude Code touches the shared formatter now, consider routing drawer date labels through the same product formatter too, or explicitly defer with a note. Avoid silently keeping three different date rules.

6. **Low: tests currently lock in the old wrong month output**

   `lib/__tests__/travelAuditMap.helpers.test.ts:791-804` expects `júl`. That means the focused formatter tests pass while preserving the bug. The chat formatter tests already expect `júlí`, so the project currently has inconsistent date contracts.

   Action: update tests to expect the new month contract for `formatLongDepartureDateTime()` and add/extend tests for `formatCompactDateTime()` and `DepartureHeatmap` day labels if practical.

## Recommended follow-up for Claude Code

Implement a narrow local-only fix:

1. Centralize Icelandic weather date month labels:
   - `jan.`
   - `feb.`
   - `mars`
   - `apríl`
   - `maí`
   - `júní`
   - `júlí`
   - `ágúst`
   - `sep.`
   - `okt.`
   - `nóv.`
   - `des.`
2. Make `formatCompactDateTime()` and `formatLongDepartureDateTime()` use that list.
3. Remove the duplicate old month array from `DepartureHeatmap.tsx`.
4. Make Veðurstofan card forecast rows date-aware even when all visible rows are on the same date.
5. Update tests that currently expect `júl`.
6. Do not commit, push, deploy or run production changes. Create a handoff after implementation.

## Verification run by Codex

- `npm run type-check` -> pass
- `npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts lib/__tests__/chat-format.test.ts` -> pass, 92 tests

Important: the formatter tests pass partly because `travelAuditMap.helpers.test.ts` still expects the old `júl` output. Passing tests are not enough for this product requirement.

## Localhost checks for Stebbi

After Claude Code makes the follow-up locally:

1. Open `/vedrid` at a mobile width around 390 px.
2. Pick a departure tomorrow or later.
3. Confirm the scrubber/day label does not show `júl`, `jún`, `ágú`, `mar`, or `apr`.
4. Confirm the summary sentence says e.g. `sunnudaginn 19. júlí kl. 10:00`.
5. Confirm met.no worst/selected/all point cards show day+date on `Brottfarartími`, ETA and forecast time.
6. Confirm Veðurstofan worst/selected/all station cards show day+date on `Brottfarartími`, ETA, `Spá gefin út`, and the forecast rows themselves.
7. Check 360-390 px mobile width for wrapping. Longer month names like `fimmtudaginn`, `sunnudaginn`, `september`/`okt.` equivalents must not cause horizontal overflow.

No Supabase, RLS, auth, migration, production data or secrets should be touched for this follow-up.

## Design.md notes

This touches compact UI text inside cards and the departure scrubber. Per `Design.md`, the fix must preserve mobile-first layout, avoid horizontal overflow, and keep text readable without creating giant controls or nested cards. If date-aware forecast rows need more room, prefer wrapping within the row over squeezing text into an unreadable single line.

## Open questions

- For English, Codex did not propose changing the current `en-GB` month labels. This review only covers Stebbi's Icelandic month contract.
- If Stebbi wants the full pulse page forecast rows to also show date inline on every row, that should be explicitly added; v356 currently uses day separators there.
