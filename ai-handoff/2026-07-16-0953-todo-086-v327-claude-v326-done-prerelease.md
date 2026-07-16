# 2026-07-16 09:53 - TODO-086 v327 - Claude: v326 done, prerelease

Created: 2026-07-16 09:53
Timezone: Atlantic/Reykjavik

Implements: `2026-07-16-0950-todo-086-v326-codex-v325-prerelease-review.md`

## What Changed

### 1. `messages/is.json` + `messages/en.json` — `<br/>` → `<br></br>`

next-intl's rich text formatter does not recognise self-closing `<br/>`. Changed to explicit open/close `<br></br>` which the formatter processes correctly.

```json
"departureCalculationContext": "Allar útreiknaðar upplýsingar... <b>{departure}</b>.<br></br>Veldu annan brottfarartíma..."
```

The `br: () => <br />` handler in `tf.rich()` is unchanged and now fires correctly.

### 2. `lib/__tests__/travelAuditMap.helpers.test.ts` — new `formatLongDepartureDateTime` tests

Added import and a `describe` block with 4 tests:

- IS Friday: `'2026-07-17T04:00:00Z'` → `'föstudaginn 17. júl kl. 04:00'`
- IS Saturday: `'2026-07-18T04:00:00Z'` → `'laugardaginn 18. júl kl. 04:00'`
- IS single-digit padding: `'2026-07-17T08:05:00Z'` → `'föstudaginn 17. júl kl. 08:05'`
- EN smoke test: contains `'Friday'` and `'04:00'`

## Results

`npx tsc --noEmit` — clean.
`npx vitest run lib/__tests__/travelAuditMap.helpers.test.ts` — 83/83 pass (4 new tests included).

## Files Changed

- `messages/is.json` — `<br/>` → `<br></br>` in `departureCalculationContext`
- `messages/en.json` — same
- `lib/__tests__/travelAuditMap.helpers.test.ts` — import + 4 tests for `formatLongDepartureDateTime`

## Files NOT Changed

- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — `br: () => <br />` handler was already correct
- `components/weather/travelAuditMap.helpers.ts` — formatter unchanged
- SQL, env, auth, pulse logic — no changes

## Localhost Checks For Stebbi

1. Open `/vedrid`, calculate a route.
   - Expected: two distinct lines in the departure context area:
     - Line 1: "Allar útreiknaðar upplýsingar hér að neðan taka nú mið af því að þú ætlir að leggja af stað **föstudaginn 17. júl kl. 04:00**."
     - Line 2: "Veldu annan brottfarartíma hér að ofan ef þú stefnir á að leggja af stað á öðrum tíma."
   - Expected: no literal `<br/>` or `<br></br>` visible in the UI.
   - Expected: departure time is bold.
2. Click scrubber slots spanning multiple days of the week.
   - Expected: weekday name updates correctly for each day.
3. Mobile widths 360px and 390px.
   - Expected: no horizontal overflow.
