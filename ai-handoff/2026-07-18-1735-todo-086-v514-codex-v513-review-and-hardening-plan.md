# 2026-07-18 17:35 - TODO 086 v514 - Codex review of v513 and hardening plan

Created: 2026-07-18 17:35
Timezone: Atlantic/Reykjavik

Reviewed handoff:
- `ai-handoff/2026-07-18-1730-todo-086-v513-claude-v512-done-prerelease.md`

Related prior plans:
- `ai-handoff/2026-07-18-1710-todo-086-v512-codex-v511-review-and-big-next-plan.md`
- `ai-handoff/2026-07-18-1612-todo-086-v505-codex-prioritize-forecast-scrubber-yr-comparison.md`
- `ai-handoff/2026-07-18-1620-todo-086-v506-codex-metno-station-forecast-history-cache.md`

## Short Human Summary

v513 is a good step: `/vedrid` now has a Veðurstofan 3-hour forecast scrubber, map colors/counts follow the selected forecast time, selected station detail shows nearby forecast rows, and SQL84 prepares a met.no/Yr history-cache table without running it.

I would not release this exact state yet. The main issue is that the new explicit forecast-time classifier exists, but the old `classifyNowAnchoredForecastWindDisplayStatus` still implements the previous "closest row" rule instead of becoming a wrapper over the new at-or-before rule. That leaves two subtly different forecast-status semantics in the shared weather-status module.

## Findings

### Medium: forecast-status selection is still duplicated and semantically divergent

`lib/weather/windDisplayStatus.ts:117-145` keeps `classifyNowAnchoredForecastWindDisplayStatus()` as the old "closest to now" implementation, while `lib/weather/windDisplayStatus.ts:158-190` adds the new explicit-anchor at-or-before classifier.

This directly misses the v512 acceptance point: `classifyNowAnchoredForecastWindDisplayStatus` was supposed to live on as a wrapper over the new helper.

Why it matters:
- The codebase now has two valid-looking forecast-status helpers with different semantics.
- Future callers can accidentally reintroduce the old "closest future may win" behavior.
- Tests in `lib/__tests__/windObservationStatus.test.ts:109-118` still lock in the old behavior.

Fix:
- Extract one reusable selection helper in `lib/weather/windDisplayStatus.ts`, for example `selectForecastAt(forecasts, anchorMs)`, that returns the selected row and index.
- Make `classifyForecastWindDisplayStatusAt(...)` use that helper.
- Make `classifyNowAnchoredForecastWindDisplayStatus(...)` call `classifyForecastWindDisplayStatusAt(forecasts, thresholds, Date.now())`.
- Update tests so the now-anchored helper proves wrapper parity, not old closest-row semantics.

### Medium/Low: StationDetail duplicates the same forecast-row selection logic locally

`components/weather/WeatherOverviewClient.tsx:521-541` defines `findUsedForecastIndex()`, which repeats the at-or-before/future-fallback selection logic separately from the classifier in `lib/weather/windDisplayStatus.ts`.

The behavior matches today, but this is exactly the kind of small duplication that later causes "marker says one thing, detail says another" bugs.

Fix:
- Reuse the shared selector from `lib/weather/windDisplayStatus.ts`.
- If the detail view needs an index, have the shared helper return `{ row, index }` or expose a second small helper that delegates to the same selection code.

### Low/UX: StationDetail forecast timestamps are raw ISO-ish instead of existing Icelandic date formatting

`components/weather/WeatherOverviewClient.tsx:705-707` renders forecast time as:

```tsx
row.ftimeIso.replace('T', ' ').slice(0, 16)
```

This produces labels like `2026-07-18 09:00`, while the rest of the travel-weather UI has already moved toward `formatCompactDateTime(...)` / `formatKlTime(...)` from `components/weather/travelAuditMap.helpers.ts:184-214`.

Fix:
- Use `formatCompactDateTime(row.ftimeIso, locale)` when the row can cross days.
- Keep `formatKlTime(...)` only where the surrounding UI already makes the date unambiguous.
- This preserves the recent decision about correct Icelandic month names, e.g. `júlí`, not raw/English dates.

### Low/a11y: forecast scrubber buttons need full accessible labels

`components/weather/ForecastTimeScrubber.tsx:44-61` shows only an hour number and uses `aria-pressed`, but each button lacks a full `aria-label`.

Why it matters:
- Hour-only labels repeat across days.
- Screen reader users cannot tell which date/status a slot represents.

Fix:
- Add an `aria-label` with full date/time and status label.
- Visual label can stay compact (`09`, `12`, `15`) if that is the best mobile layout.
- Do not make the scrubber wider just to add visible text.

## SQL Review

`sql/84_metno_point_forecasts_history.sql` was written but not run.

No obvious RLS/auth leak found from a static read:
- RLS is enabled.
- `PUBLIC`, `anon`, and `authenticated` are revoked.
- `service_role` gets explicit SELECT/INSERT/UPDATE/DELETE.
- It does not alter existing public grants or existing tables.

Notes:
- The table currently allows only `target_type = 'vedurstofan_station'`, which is correct for the first phase even though comments mention later Vegagerðin support.
- `metno_updated_at` is NOT NULL and part of the primary key. That is fine if the future projector always has a reliable met.no updated timestamp. If not, the future writer must either derive a stable updated-at value or SQL84 will reject rows. This is not a release blocker because no runtime writer exists yet.
- Do not run SQL84 until Stebbi explicitly approves migration execution.

## Answers To Claude Code Questions

1. **IIFE in JSX**

   Valid, but I would clean it up while touching this code again. The bigger point is to stop duplicating the forecast-row selection logic. Once a shared selector exists, `StationDetail` can compute `usedIdx`, `windowedRows`, and `showSeeAll` in a small local helper or component body instead of an inline IIFE.

2. **Scrubber label: `kl. HH` or `HH`**

   Keep the visual dot label short for mobile. `HH` is okay visually. Add a full accessible label instead of bloating the UI. If it still feels too cryptic in localhost, use `kl. 09` only for selected/hover detail, not every dot.

3. **Should default forecast anchor update on an interval?**

   Not now. Once the user has chosen a slot, do not auto-move it. A later nice-to-have is: if the user has not interacted and the page stays open across a 3-hour boundary, gently advance the default slot. That should be a separate polish pass.

## Recommended Next Step

Do one hardening pass before release:

- unify forecast row selection in the shared weather-status helper
- make the old now-anchored helper a wrapper
- make StationDetail use the same selector
- localize the selected-station forecast timestamps
- add accessible labels to the scrubber
- run focused tests and type-check

Do not start the runtime Yr/met.no all-station fetch yet. SQL84 is still just foundation.

## Copy/Paste For Claude Code

```text
Workflow

Read:
- ai-handoff/2026-07-18-1730-todo-086-v513-claude-v512-done-prerelease.md
- ai-handoff/2026-07-18-1735-todo-086-v514-codex-v513-review-and-hardening-plan.md
- WORKFLOW.md
- Design.md, only the relevant UI/loading/mobile consistency parts

Goal:
Harden v513 before release. Keep this scoped. Do not add runtime Yr/met.no fetching. Do not run SQL. Do not commit, push, deploy, or touch production.

Implementation tasks:

1. In lib/weather/windDisplayStatus.ts, extract one reusable forecast-row selector for explicit anchor semantics:
   - latest forecast row at-or-before anchorMs
   - fallback to first future row
   - empty forecasts returns no selection
   - preferably return both row and index so consumers can highlight the selected row consistently

2. Make classifyForecastWindDisplayStatusAt(...) use that selector.

3. Make classifyNowAnchoredForecastWindDisplayStatus(...) a thin wrapper around classifyForecastWindDisplayStatusAt(forecasts, thresholds, Date.now()).
   - Update JSDoc so it no longer says "closest to current time".
   - Update tests that currently assert closest-row behavior.
   - Add a test proving wrapper parity / at-or-before semantics.

4. In components/weather/WeatherOverviewClient.tsx, remove the local duplicated findUsedForecastIndex logic or make it delegate to the shared selector.
   - Station detail highlighted row must be the exact same row semantics as marker color/status.
   - Keep the visible behavior: 2 before, used row, 2 after, clamped.

5. Localize StationDetail forecast row timestamps.
   - Do not render raw `YYYY-MM-DD HH:mm`.
   - Reuse existing helpers from components/weather/travelAuditMap.helpers.ts, ideally formatCompactDateTime(row.ftimeIso, locale) when date matters.
   - Keep mobile layout compact and avoid page-level horizontal overflow.

6. In ForecastTimeScrubber, add accessible labels to slot buttons.
   - Visible labels can remain compact hour labels.
   - aria-label should include date/time and status label.
   - Use existing status metadata/messages where practical; do not hardcode user-facing text unless unavoidable.

7. Do not change SQL84 behavior in this pass unless a type/static test requires a tiny correction.
   - SQL84 remains written but NOT run.

Validation:
- npm run type-check
- npm run test:run -- lib/__tests__/windObservationStatus.test.ts
- If SQL tests were touched: npm run test:run -- lib/__tests__/sql-migration.test.ts
- If practical, run the relevant full test command you normally use for this area.

After implementation:
- Create a new handoff in ai-handoff/.
- Include exact files changed, commands and exit codes.
- Include SQL status: no SQL run.
- Include Localhost checks for Stebbi.
```

## Localhost Checks For Stebbi

After Claude Code completes the hardening pass:

1. Open `http://localhost:3004/vedrid` as public.
2. Select `Veðurstofan (spá)`.
3. Move the forecast scrubber between at least three slots.
4. Confirm map marker colors and status pill counts change with the selected slot.
5. Click a Veðurstofan station.
6. Confirm the highlighted forecast row is the row used for the map color and says `Notað á korti`.
7. Confirm forecast times are Icelandic/compact, not raw `2026-07-18 09:00` strings.
8. Confirm mobile widths 360/390/460 px have no page-level horizontal overflow. Internal horizontal scroll inside the forecast table/scrubber is acceptable if it does not break the page.
9. Open `http://localhost:3004/vedrid/ferdalagid` and confirm the existing trip workflow still behaves the same.

No Supabase migration should be tested casually here. SQL83/SQL84 must only be run after Stebbi gives explicit migration approval.

## Óvissa / þarf að staðfesta

- I did not run tests in this Codex review. I only read v513 and relevant source snippets.
- I did not browser-test the scrubber.
- I did not inspect every historical diff in the dirty worktree, only the files relevant to v513.
