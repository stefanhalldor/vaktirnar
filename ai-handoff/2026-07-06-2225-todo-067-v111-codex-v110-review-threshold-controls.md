# todo-067 v111 - Codex review: v110 + user-adjustable travel thresholds

Created: 2026-07-06 22:25  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Relevant TODO: todo-067 weather / Ferðalagið  
Reviews: `2026-07-06-2158-todo-067-v110-claude-v109-done.md`

## Findings

### P2 - Client `formatWindowRange` still hardcodes Icelandic `kl.` in English UI

v110 fixed the Icelandic cross-day ambiguity, but `app/auth-mvp/vedrid/FerdalagidClient.tsx:633-642` formats both same-day and cross-day badges with hardcoded `kl.`:

```ts
return `kl. ${utcHHMM(fromIso)}–${utcHHMM(toIso)}`
return `${fmtDate(fromIso)} kl. ${utcHHMM(fromIso)} – ${fmtDate(toIso)} kl. ${utcHHMM(toIso)}`
```

That is fine for the Icelandic primary path, but it leaks Icelandic copy into `messages/en.json` flows. Since this app already has English messages, the badge should use translated wrappers or a locale-aware label.

Recommended fix:

- Add message keys for same-day and cross-day ranges, or return structured `{ fromDate, fromTime, toDate, toTime, sameDay }` from the helper and let `tf(...)` assemble the text.
- Icelandic can keep `kl. HH:mm`.
- English should use something like `HH:mm-HH:mm` or `{date} at {time}` consistently with existing `heatmapSlotDateTime`.

This does not block Icelandic localhost testing, but it should not be forgotten before broader release.

### P2 - v110 does not add direct tests for the `DepartureHeatmap` filter behavior

v110 added server-side tests for date-aware `svar`, but the green-hidden-by-default change lives in `components/weather/DepartureHeatmap.tsx` and appears untested at component level.

Risk areas:

- `graent` should be hidden by default.
- `Allt` should restore all slots.
- toggling `Gott veður` should reveal green slots.
- selected green slot detail should not remain visible after green is hidden.
- all-green routes should show a deliberate empty state, not a broken/missing scrubber.

Recommended fix:

- If the current test setup supports React component tests, add a focused `DepartureHeatmap` test.
- If not, keep this as a required manual localhost check in the next handoff.

### P3 - v110 implementation is otherwise aligned with v109

The core v109 requests look implemented:

- `TravelAuditMap` keeps the scrubber between map and point details.
- server `svar` now uses date-aware ranges.
- client badges now use date-aware ranges.
- day labels normalize `is` -> `is-IS` and `en` -> `en-US`.
- green is hidden by default and `timelineEmptyGreenHidden` exists in both message files.

Codex did not rerun the full test suite for this review; v110 reports `npm run type-check` and `npm run test:run` passing.

## New product direction from Stebbi: user-adjustable thresholds

Stebbi's new direction:

> Það er svo misjafnt hvað aðstæðum fólki finnst gott að keyra í. Við ættum að sækja öll veðurgildin fyrir leið viðkomandi og setja bara leiðbeinandi thresholds sem eru sýnileg í viðmótinu, en leyfa notandanum að breyta þessum gildum. Í fasa 2 jafnvel að vista þessi gildi hjá sér sem forvalin.

Codex agrees. This fits the product better than pretending one set of thresholds is universal. Teskeið should say: "Hér eru viðmiðin sem við notuðum. Þú getur hert eða slakað á þeim og reiknað aftur."

Important principle:

- Teskeið should still fetch the same route and all route weather values.
- Thresholds decide how those values are interpreted as green/yellow/red.
- The UI must make thresholds visible and editable.
- The server must use the exact thresholds shown in the UI. Do not make the UI a cosmetic layer over hardcoded backend constants.

## Proposed scope: Phase 1 threshold controls, no persistence yet

### 1. Show active thresholds visibly

Add a small "Viðmið" / "Mín veðurmörk" section near the result, preferably under or near "Hvernig er þetta metið?".

For the active travel mode, show the values that were actually used:

- Vindur: varúð frá X m/s
- Vindur: ekki mælt frá Y m/s
- Hviður: ekki mælt frá Z m/s
- Úrkoma: varúð frá X mm/klst

When trailer/caravan mode is selected, show the trailer-aware defaults. Current defaults are in `lib/weather/thresholds.ts`:

- no trailer: caution wind 15 m/s, red wind 20 m/s, red gust 28 m/s
- trailer/caravan family: caution wind 13 m/s, red wind 18 m/s, red gust 25 m/s
- travel precipitation caution: > 2.0 mm/klst

Use these as defaults, not as hidden rules.

### 2. Let the user edit thresholds for this calculation

Add "Breyta viðmiðum" in the assumptions/edit flow, not as a huge advanced screen on first use.

Recommended controls, following `Design.md`:

- numeric inputs or steppers for exact values
- unit labels beside the input (`m/s`, `mm/klst`)
- reset button: "Nota sjálfgefin viðmið"
- primary action: "Reikna aftur"
- no mobile zoom: inputs must be at least 16px on mobile
- no card-inside-card nesting; keep it as a clean section/list of controls

Avoid sliders as the only input for this phase. Weather thresholds need exact numbers and sliders can be fiddly on mobile. A slider plus numeric input is okay later.

### 3. Backend must accept and validate threshold overrides

Add a typed override object, for example:

```ts
type TravelThresholdOverrides = {
  cautionWindMs?: number
  redWindMs?: number
  redGustMs?: number
  cautionPrecipMmPerHour?: number
}
```

The API route should validate:

- all values are numbers
- no negative values
- `cautionWindMs < redWindMs`
- sensible caps, for example wind 0-40 m/s, gust 0-50 m/s, precipitation 0-20 mm/klst
- reject invalid values with 400, not silent fallback

Then pass resolved thresholds into `checkTravelWeather(...)`.

### 4. Use resolved thresholds everywhere the model decides or explains

This is the part that matters most.

Currently `lib/weather/travel.ts` uses global `WEATHER_THRESHOLDS` in:

- `evalDrivingLeg`
- per-point `pointStatuses`
- candidate status
- next caution
- routeWeatherPoints/map coloring

If overrides are added, all of those must use one resolved threshold object.

Also update threshold explanations:

- `deriveThreshold(...)` currently reads from global `WEATHER_THRESHOLDS`.
- If the UI can override thresholds, `deriveThreshold` must receive the resolved thresholds or the result must carry `thresholdsUsed`.
- Point detail cards should say "yfir þínum mörkum X" when user changed values.

### 5. Persist later, not now

Do not add Supabase persistence in Phase 1.

Phase 1:

- per-run threshold overrides only
- held in client state
- sent with the travel API request
- shown in result as "Viðmið sem voru notuð"
- resettable to defaults

Phase 2:

- save per user as default thresholds
- likely a small settings/profile table or existing settings surface
- requires separate Supabase/RLS review

## UX copy suggestion

Use short, non-alarming copy:

```text
Viðmiðin eru leiðbeinandi.
Sum vilja keyra í meiri vindi, önnur vilja fara varlega fyrr.
Teskeið reiknar út frá þeim mörkum sem þú velur hér.
```

For result explanation:

```text
Reiknað úr veðurspá, leið og þínum viðmiðum.
Gervigreind tekur ekki ákvörðunina.
```

If defaults are used:

```text
Reiknað úr veðurspá, leið og sjálfgefnum viðmiðum.
```

## Recommended next handoff to Claude Code

Ask Claude Code for an implementation plan first, not immediate code, because this touches request shape, deterministic model logic, UI, messages and tests.

The plan should cover:

1. exact `TravelThresholdOverrides` type
2. backend validation strategy
3. how resolved thresholds flow through `checkTravelWeather`
4. how `deriveThreshold` and point detail cards get thresholds used
5. where the threshold controls appear in the existing "Breyta forsendum" / assumptions flow
6. tests for default thresholds and overridden thresholds
7. localhost checks for no trailer, trailer and all-green/non-green routes

## Localhost checks for Stebbi

For v110 as currently shipped:

1. Hard-refresh `/auth-mvp/vedrid`.
2. Test a cross-day best departure window. Expected: Icelandic result text shows day/date on both ends.
3. Test same-day best departure window. Expected: compact `kl. HH:mm-HH:mm`.
4. Test long route with only green timeline values. Expected: green hidden by default, intentional empty state, and `Gott veður` / `Allt` can reveal green slots.
5. Test route with yellow/red timeline values. Expected: yellow/red are visible by default, green hidden until toggled on.
6. Test Icelandic day labels. Expected: `mán.`, `þri.`, etc., not `Mon`, `Tue`.

For the threshold-controls phase after implementation:

1. Open `/auth-mvp/vedrid`.
2. Choose a route with borderline wind or rain.
3. Run once with default thresholds.
4. Lower the caution wind threshold and click "Reikna aftur".
5. Expected: the same weather values can move from green to yellow because the user changed the threshold.
6. Raise the threshold back or click "Nota sjálfgefin viðmið".
7. Expected: result returns to default interpretation.
8. Repeat with trailer selected. Expected: trailer defaults and overrides are the ones shown and used.
9. Invalid values should not submit silently; they should show a clear validation error.

No Supabase, auth, RLS, SQL migration, billing, production, deployment, secrets or user-data changes are needed for Phase 1 threshold controls. Persistence in Phase 2 would require separate review.

## Óvissa / þarf að staðfesta

- Codex did not run tests for this review.
- Exact UI placement should be confirmed against the current result/assumptions screen after Stebbi tests v110 locally.
