# TODO 085 - Codex review of Claude v007 prerelease

Created: 2026-07-11 10:26
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Prerelease review
Reviewed handoff: `2026-07-11-1020-todo-085-v007-claude-v006-prerelease.md`
Previous review: `2026-07-11-1010-todo-085-v006-codex-v005-prerelease-review.md`

## Findings

### P1 - Visible copy still says gusts are part of the assessment

The technical P0 from v006 is fixed, but user-facing copy still tells users that Teskeið is comparing/using gusts even though #85 neutralizes gusts behind the scenes.

Examples:

- `messages/is.json:642`: `Ber saman vind, hviður og úrkomu`
- `messages/en.json:638`: `Checking wind, gusts and precipitation`
- `messages/is.json:689`: says `vindur, hviður, úrkoma, tími og staðsetning ráða matinu`
- `messages/en.json:685`: says `wind, gusts, precipitation, time and location drive the assessment`

This is product-significant because Stebbi's latest direction is: do not base the current UI on gusts; ask users to check gusts externally, especially at Vegagerðin.

Recommended patch before release:

- Change loading copy to something like:
  - IS: `Ber saman vind, úrkomu og spápunkta`
  - EN: `Checking wind, precipitation and forecast points`
- Change `howAssessedShort` so it does not say gusts drive the assessment. Suggested IS:
  - `Veðurmatið er reiknað úr leiðinni, tímasetningu og veðurspá á punktum meðfram leiðinni. Gervigreind tekur ekki ákvörðunina sjálf. Hún má hjálpa okkur að orða niðurstöðuna, en vindur, úrkoma, tími og staðsetning ráða matinu. Athugaðu sérstaklega hviður og færð á vef Vegagerðarinnar.`
- Keep `thresholdGustCautionNote` / disclaimer about checking gusts at Vegagerðin.

### P1 - Route point window logic can still choose the decisive time from gusts

Even though v007 removes visible `Hviður: X m/s` values from the UI, `lib/weather/travel.ts` still uses gusts in summary/window selection logic:

- `lib/weather/travel.ts:183-198` calculates `worstGustMs`, passes it into `assessDrivingConditions`, and for wind cases chooses `decisiveTimeIso` using `Math.max(windSpeedMs, windGustMs)`.
- `lib/weather/travel.ts:212-222` uses `nextHour.windGustMs` and `Math.max(wind, gust)` for trend comparison.
- `lib/weather/travel.ts:235` stores `worstGustMs` in `summaryForWindow`.

Because `redGustMs=100`, gusts usually will not change `stada`, but a high gust below 100 can still pick the "forecast time" or trend basis while the UI now displays only wind/precip/temp. That can make a row say "forecast at 15:00" while the displayed worst wind value actually came from another hour.

Recommended patch before release if we want #85 to be internally honest:

- When gusts are neutralized for this phase, route-point `decisiveTimeIso` and wind trend should use `windSpeedMs`, not `Math.max(windSpeedMs, windGustMs)`.
- Keep storing raw gust data if future phases need it, but do not let it choose the displayed decisive time while the UI hides gusts.

### P2 - API max validation now matches hidden constants, but the constants are duplicated

v007 fixes the immediate failure by raising API validation max values:

- `app/api/teskeid/weather/travel/route.ts:44-45`: `redGustMs` and `cautionPrecipMmPerHour` max are now `100`.

That solves the `thresholds_invalid` screenshot Stebbi saw. However, the neutral `100` is still duplicated in:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:404-405`
- `app/api/teskeid/weather/travel/route.ts:44-45`

Not a release blocker, but easy future-proofing:

- Move these to shared constants, for example in `lib/weather/thresholds.ts`.
- Add a regression test that `redGustMs=100` and `cautionPrecipMmPerHour=100` are accepted by the API validation path.

### P2 - API `thresholds_invalid` field-level error may be cleared immediately

On API `thresholds_invalid`, the client does:

- `setStep('thresholds')`
- `setThresholdError(tf('thresholdValidationError'))`

But the `useEffect` for entering the `thresholds` step clears `thresholdError`.

This is probably low risk after the 100/100 fix, because most invalid threshold cases are caught client-side before API submit. Still, if the API ever rejects thresholds, the intended field-level error may disappear after navigation back to the thresholds step.

Not a release blocker, but worth simplifying later:

- Only clear `thresholdError` on deliberate user edit / route-step transition, not every time `step === 'thresholds'`.

## What Looks Fixed From v006

- The API now accepts the hidden neutral `100/100` threshold values, so the earlier `Ógilt gildi í veðurmörkum` failure should be fixed.
- The threshold fields are no longer prefilled on first entry.
- Both visible wind fields are required before submit.
- Empty or one-field-only submission stays on the threshold step with a field-level error.
- The empty result shell after invalid thresholds is addressed.
- Main visible gust values were removed from arrival, comparison strip/drawer, point detail rows, audit map point summary, and heatmap fallback.
- `DepartureHeatmap` threshold summary now displays only wind thresholds.

## Tests Run

- `npm run type-check`
  - Exit code: 0
- `npm run test:run -- lib/__tests__/weather-wind-distance.test.ts`
  - Exit code: 0
  - 1 file passed, 9 tests passed
- `npm run test:run`
  - Exit code: 0
  - 69 files passed
  - 2129 tests passed, 27 skipped, 8 todo
  - Console included existing JSDOM noise: `Not implemented: navigation to another Document`

## Release Recommendation

Do one small polish/fidelity patch before release:

1. Remove "gusts/hviður drive the assessment" from loading and explainer copy.
2. Make route-point decisive time/trend use wind speed, not max(wind, gust), while gusts are neutralized.

After that, I think this is reasonable to localhost smoke-test and continue the larger refactor.

If Stebbi wants to move fast, v007 is technically much safer than v005 and tests are green, but the remaining gust copy/logic mismatch is visible enough that I would rather patch it now.

## Localhost Checks For Stebbi

After Claude patches the remaining P1 items:

1. Open `/vedrid` on localhost in mobile width.
2. Select origin and destination.
3. Confirm `Veðurmörk` shows two empty inputs.
4. Press `Reikna ferðina` with both empty.
   - Expected: stays on `Veðurmörk` and shows required-fields copy.
5. Fill only one field and press `Reikna ferðina`.
   - Expected: stays on `Veðurmörk` and asks for both wind limits.
6. Fill both fields, for example `15` and `25`, and submit.
   - Expected: result calculates successfully; no `Ógilt gildi í veðurmörkum`.
7. Watch the loader copy.
   - Expected: it should not say hviður/gusts are being compared.
8. Open the explainer under the result.
   - Expected: it should say wind/precip/time/location drive the current assessment, while separately warning to check gusts and road conditions at Vegagerðin.
9. Scan arrival, comparison strip/drawer, all forecast point cards, and audit map point details.
   - Expected: no visible measured value like `Hviður: 12 m/s` or `hvið. 12`.
10. Check a few threshold combinations around the observed wind.
   - Expected: selected result can show `Innan marka`, `Nálgast óþægindi`, `Óþægilegt`, `Nálgast hættumörk`, and `Hættulegt` where applicable.

No Supabase, SQL, RLS, auth, billing, secrets, or production data changes are required for this patch.

## Óvissa / þarf að staðfesta

- I did not browser-test the UI; this review is based on code inspection and tests.
- I assume the intent is still to hide measured gust values in this phase, while keeping warning copy that users should check gusts externally.
