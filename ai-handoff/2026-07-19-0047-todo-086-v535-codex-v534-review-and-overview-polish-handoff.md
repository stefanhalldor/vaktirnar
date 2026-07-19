# 2026-07-19 00:47 - TODO 086 v535 - Codex review of v534 + combined /vedrid polish handoff

Created: 2026-07-19 00:47
Timezone: Atlantic/Reykjavik

Reviewed:

- `ai-handoff/2026-07-19-0045-todo-086-v534-claude-v533-done-prerelease.md`
- Relevant files touched by v534:
  - `components/weather/OverviewRouteLensPanel.tsx`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `lib/iceland-routes/routeObservation.ts`
  - `lib/__tests__/overview-route-draft.test.ts`
  - `sql/85_route_observation_aggregate.sql`

Also folded in Stebbi's new `/vedrid` overview polish and migration-clarity notes.

---

## Short version

v534 looks directionally good and fixes the main v533 blockers. TypeScript and the targeted route-observation/draft tests are green.

Next Claude Code step should be one combined hardening/polish pass for `/vedrid`:

1. Add wind-focus banner.
2. Default-hide low-signal wind statuses.
3. Polish the weather-threshold apply button.
4. Align `Nuna / Maelt hh:mm` in the source/time selector.
5. Make the Yr label truthful: either wire real Yr data end-to-end or stop saying Yr in this UI for now.
6. Return a handoff with exact migration readiness: no migration is run in this pass.

---

## Findings

1. **No release blocker found in v534 hardening pass**

   v534 appears to address the core v533 findings:

   - `OverviewRouteLensPanel` now initializes `activeField` as `null`, so initial `/vedrid` load should not autofocus `Fra`.
   - `FerdalagidClient` now returns early when `?routeDraft=1` exists but the route draft is missing/expired, so it should not restore an unrelated stale trip.
   - `RouteObservation` now includes placeholder arrays for `vegagerdinStationIds`, `routeSegmentIds`, and `routeCautionIds`.
   - `sql/85_route_observation_aggregate.sql` is clearly marked `DRAFT - DO NOT RUN`.

2. **Low/Test gap: `routeDraft=1` tests still mostly document helper behavior, not full client behavior**

   `overview-route-draft.test.ts` now documents the privacy-safe marker and expired draft helper behavior. Good.

   Residual gap: it does not directly exercise `FerdalagidClient` behavior where `routeDraft=1 + missing draft` must not restore `ROUTE_RESTORE_KEY`.

   Not a blocker for this polish pass, but if Claude Code has a clean testing seam, add one focused test or at least document why it is not practical.

3. **Important: `sql/85` must remain non-runnable**

   v534 correctly marks `sql/85_route_observation_aggregate.sql` as draft. Keep it that way. Do not run it locally or in production until:

   - the draft header is removed intentionally,
   - RLS/grants/function permissions are finalized,
   - final route-observation contract is confirmed,
   - Codex reviews the migration as production-ready,
   - Stebbi explicitly asks to run it.

---

## Combined handoff for Claude Code

Stebbi can send this section to Claude Code with `Workflow`.

```md
Workflow

## Goal

Do one combined prerelease hardening/polish pass after:

- `2026-07-19-0045-todo-086-v534-claude-v533-done-prerelease`
- `2026-07-19-0047-todo-086-v535-codex-v534-review-and-overview-polish-handoff`

Scope: repo code/tests/docs only. Do not run SQL, migrations, commit, push, deploy, or change Vercel/Supabase/env.

## First: devil's advocate review

Before implementation, quickly re-check:

1. v534 did not introduce mobile autofocus/keyboard regressions.
2. `routeDraft=1` missing/expired draft cannot restore unrelated stale trip state.
3. `/vedrid` overview still works if migrations 82/83/84/85 have not been run yet.
4. Yr label is truthful. Do not display `Veðurstofan/Yr` unless Yr is actually shown or used in this UI.
5. No SQL is required for the UI polish in this pass.

If any of these are uncertain, stop and return a handoff with questions instead of implementing.

## Implementation tasks

### 1. Add a wind-focus banner on `/vedrid`

Add a compact banner near the top of `/vedrid`, after title/subtitle and before the main controls.

Suggested Icelandic copy:

> Þessi fyrsta útgáfa leggur áherslu á vind fyrir fólk sem er á ferð um landið núna.

Use `messages/is.json` and `messages/en.json`. Do not hardcode user-facing text.

Design constraints:

- Follow `Design.md`: mobile-first, quiet app UI, no hero, no oversized card.
- Use existing tokens/classes.
- It should explain the product state without dominating the page.

### 2. Default-hide low-signal statuses on `/vedrid`

By default, `/vedrid` should filter out:

- `innan-marka` = Innan marka
- `no_wind_data` = Engar vindmælingar
- `no_data` = Ófullnægjandi gögn

Default visible statuses should therefore be:

- `nalgast-othaegindi`
- `othaegilegt`
- `nalgast-haettumork`
- `haettulegt`

Keep all status pills visible enough that the user understands the hidden statuses exist and can toggle them back on.

Implementation preference:

- Do not inline random status arrays in component state.
- Add a small shared constant/helper in the wind status domain layer, for example:
  - `DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES`
  - or `getDefaultOverviewVisibleWindStatuses()`
- Keep existing `empty Set = show all` semantics intact if other consumers rely on it.
- Initialize `/vedrid` overview with the default visible set instead of `new Set()`.
- Preserve `Sýna allt` / reset behavior.

Add or update a focused unit test for the helper/default if there is an existing suitable test seam.

### 3. Polish the weather-threshold apply button

The current `Setja` button is visually too harsh and the copy is weak.

Change the Icelandic copy from `Setja` to a clearer, nicer label such as:

- `Nota mörk`

or, if the action actually persists authenticated user defaults:

- `Vista mörk`

Style:

- Do not use the same heavy black/dark CTA treatment as the primary `Ferðalagið` button.
- Use a quieter secondary/action style that fits the threshold input row.
- Keep mobile touch target sane and avoid layout shift.

If the button only applies local state and does not persist to DB, prefer `Nota mörk`, not `Vista mörk`.

### 4. Align `Núna / Mælt hh:mm` in `WeatherSourceTimeSelector`

The left Vegagerðin block currently makes `Núna Mælt hh:mm` look slightly higher than forecast time slots.

Adjust `components/weather/WeatherSourceTimeSelector.tsx` so:

- `Núna` and `Mælt hh:mm` are horizontally centered inside the button/block.
- Vertical rhythm matches the forecast slot row.
- The left section still stays fixed-width and does not scroll.
- Loading/disabled states do not change layout width/height.
- `aria-label` remains useful.

### 5. Make Yr truthful before showing it

Current UI can show `Veðurstofan/Yr`, but Stebbi does not see actual Yr values in the station details.

Do not leave a misleading label.

Choose one:

#### Option A - Yr is not ready in this pass

- Rename `sourceForecastGroupLabel` from `Veðurstofan/Yr` to `Veðurstofan` or `Veðurstofan (spá)`.
- Leave Yr comparison as a future step.
- In handoff, state clearly that `sql/84` is not required for this UI pass.

#### Option B - Yr is ready in this pass

Only choose this if all end-to-end pieces are actually wired:

- service-role writer/projector writes rows into `public.metno_point_forecasts_history`,
- API reads those rows,
- `/vedrid` overview/station detail displays Yr or Veðurstofan-vs-Yr comparison clearly,
- UI makes it clear which values are from Veðurstofan and which are from Yr.

If Option B is chosen, include exact files touched and exact migration readiness instructions in the handoff.

Do not silently rely on `sql/84` existing unless the code gracefully handles the table not existing yet or Stebbi has explicitly run it.

## Migration instructions for Stebbi

Do not run any migration as part of this Claude Code pass.

Claude Code must include this table in the final handoff and mark each row `READY` or `NOT READY`:

| Migration | What it does | When Stebbi should run it | Current expected status |
|---|---|---|---|
| `sql/81_teskeid_chat_target_type_vegagerdin_station.sql` | Extends chat thread target type to allow `vegagerdin_station` | Run before testing/writing Vegagerðin pulse messages, if not already run | READY only if Codex has already reviewed it and Stebbi wants Vegagerðin pulse writes |
| `sql/82_weather_user_preferences.sql` | Creates per-user saved weather threshold preferences | Run only when threshold preference API/UI is implemented and tested | Possibly READY if save-default feature is in use; not needed for local-only `Nota mörk` |
| `sql/83_vegagerdin_measurements_history.sql` | Creates persistent Vegagerðin measurement history/cache table | Run only when writer and fallback reader are implemented and tested | READY only if current branch actually writes/reads it |
| `sql/84_metno_point_forecasts_history.sql` | Creates Yr/met.no point forecast history table at provider station coordinates | Run only when Yr writer/projector, API reader, and UI display are all implemented and tested | NOT READY unless Option B above is completed |
| `sql/85_route_observation_aggregate.sql` | Draft route-observation aggregate table/function | Do not run | NOT READY / DO NOT RUN |

Very clear rule:

- Stebbi should not run a migration just because the file exists.
- Stebbi should run a migration only after Claude Code handoff says that specific migration is `READY`, Codex review agrees, and Stebbi explicitly decides to run it.
- `sql/85` must not be run while it contains `DRAFT - DO NOT RUN`.

## Tests / checks to run

Run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts
```

If adding/adjusting wind-status helper tests, run those too.

If touching provider comparator/Yr blend logic, also run:

```bash
npm run test:run -- lib/__tests__/weather-provider-comparator.test.ts lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/windObservationStatus.test.ts
```

## Design.md check

Explicitly confirm in handoff:

- UI remains mobile-first.
- Inputs are at least 16px on mobile.
- No horizontal overflow.
- Threshold controls and source/time selector do not jump when loading or changing state.
- Button styling follows Teskeið tokens and does not introduce another dominant black CTA.

## Route intelligence check

This pass mostly touches `/vedrid` overview, but it still connects to route-lens and route-observation work.

Confirm:

- No raw Google route content, addresses, place IDs, or user identity are stored.
- RouteObservation remains derived/provider-neutral.
- No change to production routing provider.
- No `IcelandRoadmap.md` update is needed unless you add/alter route-family, segment, caution, or station-matching logic.

## Localhost checks for Stebbi

After implementation, Stebbi should test:

1. Open `/vedrid` on mobile width around 390px.
2. Expected: no keyboard opens automatically.
3. Expected: wind-focus banner appears near the top and does not dominate the screen.
4. Expected: map/pills default-hide `Innan marka`, `Engar vindmælingar`, and `Ófullnægjandi gögn`.
5. Tap the hidden status pills or `Sýna allt`.
6. Expected: those statuses can be shown again.
7. Adjust weather thresholds.
8. Expected: apply button copy/style feels consistent and does not compete with `Ferðalagið`.
9. Expected: `Núna Mælt hh:mm` is centered and aligned with forecast slots.
10. Open a station detail.
11. Expected: if Yr is not actually wired, no misleading `Yr` label appears. If Yr is wired, values clearly show what comes from Yr.
12. Confirm no SQL has been run by Claude Code.

Return a handoff. Do not commit, push, deploy, run migrations, or change env.
```

---

## Migration guidance for Stebbi, in plain Icelandic

Ekki keyra `82`, `83`, `84` eða `85` bara af því þær eru til.

Skýr regla:

- `81`: keyra aðeins ef Vegagerðar-púls á að geta skrifað í chat töflurnar og hún hefur ekki þegar verið keyrð.
- `82`: keyra þegar við erum raunverulega farin að vista veðurmörk notanda í gagnagrunn. Ekki nauðsynlegt fyrir local-only `Nota mörk`.
- `83`: keyra þegar Vegagerðin history/cache writer og fallback reader eru staðfest í kóða.
- `84`: keyra þegar Yr/met.no writer, API reader og UI birting eru öll komin og Claude segir skýrt að taflan sé notuð.
- `85`: ekki keyra. Hún er draft.

Ef Stebbi vill prófa bara UI polish á `/vedrid`, þarf ekki að keyra neina migration.

Ef Stebbi vill sjá Yr birtast, þá er `84` líklega nauðsynleg seinna, en ekki næg ein og sér. Það þarf líka kóða sem skrifar, les og birtir gögnin.

---

## Commands run by Codex for this review

```bash
npm run type-check
```

Exit code: 0

```bash
npm run test:run -- lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts
```

Exit code: 0

Result: 3 test files passed, 71 tests passed.

No SQL, migrations, commit, push, deploy, Vercel, Supabase or env changes were made.

---

## Localhost checks for Stebbi

This is a review/plan file, so no new app behavior exists yet from Codex.

After Claude Code implements the combined handoff above, Stebbi should run the localhost checks listed in the copy/paste block:

- `/vedrid` mobile load should not autofocus.
- Banner should appear.
- Default map should hide low-signal statuses.
- Hidden statuses should be recoverable through pills/`Sýna allt`.
- Threshold apply button should look/feel better.
- `Núna Mælt hh:mm` should be centered.
- Yr should either be real and visible, or the label should not claim Yr.
- No migration should have been run unless Stebbi separately approved it.

---

## Óvissa / þarf að staðfesta

- I did not run localhost/browser checks.
- I did not inspect every Yr-related code path; `rg` showed `sql/84_metno_point_forecasts_history.sql` and SQL tests, but no obvious runtime use of `metno_point_forecasts_history`. Claude Code should confirm whether Yr is truly wired before asking Stebbi to run `sql/84`.
- `sql/85` is intentionally still draft and should remain blocked.
