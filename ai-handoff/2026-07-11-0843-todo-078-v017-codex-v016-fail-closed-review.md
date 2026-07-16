# TODO 078 - Codex review of v016 Phase 0.6B

Created: 2026-07-11 08:43
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Review + narrow fix handoff for Claude Code
Related TODO: #78 Ferðalagið / shared route-weather core
Reviews: `2026-07-11-0838-todo-078-v016-claude-phase06b-prerelease.md`

Status: Do not continue to Phase 0.7 yet. One small core-contract bug should be fixed first.

---

## Findings

### P1 - Structural validation issues can still return green trip status

`lib/weather/trip-assessment.ts` documents that malformed trip structures "contribute 'gult' to the aggregate status":

- `lib/weather/trip-assessment.ts:21`
- `lib/weather/trip-assessment.ts:59`
- `lib/weather/trip-assessment.ts:91`

But the implementation currently only contributes `gult` for:

- missing leg input
- no legs / no statuses

It does **not** contribute `gult` for these structural issues if the leg weather inputs are otherwise green:

- `unknown_from_stop`
- `unknown_to_stop`
- `non_adjacent_leg`
- `single_drive_requires_one_leg`

That means a malformed trip can return:

```ts
{
  status: 'graent',
  validationIssues: ['unknown_from_stop']
}
```

That violates the fail-closed contract for the new shared core. The tests currently miss this because the validation tests assert the issue exists but do not assert non-green status for all structural issues.

---

## What Claude Code should do

Narrow scope only. Do not start Phase 0.7 yet.

### Code change

In `lib/weather/trip-assessment.ts`, change status aggregation so **any validation issue contributes `gult` to the trip-level aggregate**.

Suggested shape:

```ts
const aggregateStatuses = validationIssues.length > 0
  ? [...allStatuses, 'gult' as WeatherStatus]
  : allStatuses

const status = worstStatus(aggregateStatuses.length > 0 ? aggregateStatuses : ['gult'])
```

Equivalent implementation is fine if it preserves this behavior:

- valid green trip -> `graent`
- valid yellow trip -> `gult`
- valid red trip -> `rautt`
- invalid green trip -> `gult`
- invalid red trip -> `rautt`
- no legs / no assessable statuses -> `gult`

Do **not** invent a `worstLegId` for structural validation only. `worstLegId` should remain based on assessed legs only.

### Tests to add/update

Update `lib/__tests__/weather-trip-assessment.test.ts`.

Add/strengthen assertions so these cases are non-green:

1. `unknown_from_stop` with green leg input returns `status: 'gult'`.
2. `unknown_to_stop` with green leg input returns `status: 'gult'`.
3. `single_drive_requires_one_leg` with two green legs returns `status: 'gult'`.
4. Add a missing test for `non_adjacent_leg`, with green leg inputs, returning:
   - `validationIssues` contains `non_adjacent_leg`
   - `status` is `gult`

Also keep the red precedence behavior intact:

- If a trip has a structural validation issue **and** one assessed leg is red, final status should remain `rautt`.

This protects against accidentally downgrading red to yellow.

---

## What not to do

Do not expand scope.

- No `/api/teskeid/trip/*`
- No `/api/teskeid/camping/*`
- No feature flag work
- No UI
- No saved trips
- No SQL or migration
- No admin analytics
- No public nav
- No AI interpretation
- No commit, push or deploy unless Stebbi explicitly asks

This is a small core-contract fix before moving on.

---

## Files Codex reviewed

- `ai-handoff/2026-07-11-0838-todo-078-v016-claude-phase06b-prerelease.md`
- `lib/weather/trip-assessment.ts`
- `lib/__tests__/weather-trip-assessment.test.ts`
- `lib/weather/trip.ts`
- `lib/weather/assessment.ts`
- `lib/weather/travel.ts`

---

## Commands Codex ran

```bash
npm run type-check
```

Result: passed.

```bash
npm run test:run -- lib/__tests__/weather-trip-assessment.test.ts lib/__tests__/weather-trip.test.ts lib/__tests__/weather-assessment.test.ts lib/__tests__/weather-travel.test.ts
```

Result: 4 test files passed, 156 tests passed, 5 skipped.

Note: these tests passed before the fail-closed gap was fixed, so Claude Code must add the missing assertions above.

---

## Expected command checks after fix

Run:

```bash
npm run type-check
```

Run:

```bash
npm run test:run -- lib/__tests__/weather-trip-assessment.test.ts lib/__tests__/weather-trip.test.ts lib/__tests__/weather-assessment.test.ts lib/__tests__/weather-travel.test.ts
```

Expected:

- typecheck passes
- weather trip assessment tests pass
- existing weather assessment/travel tests still pass

---

## Localhost checks for Stebbi

No visible UI change is expected from this fix.

After Claude Code applies the fix:

1. Open `/auth-mvp/vedrid` as an authenticated user.
2. Calculate a normal route, for example Reykjavik -> Akureyri.
3. Expected: route options, departure scrubber, final weather result, route weather points and map behave exactly as before.
4. Open `/vedrid` as a public user if `WEATHER_PUBLIC_ENABLED=true`.
5. Calculate a normal route.
6. Expected: public flow behaves exactly as before.
7. There should be no new Ferðalag UI, no add-stop controls, no campsite controls and no SQL migration.

This fix is internal only. It protects future Ferðalag composition from showing a green aggregate status for malformed trip structures.

---

## Codex recommendation

After this P1 is fixed and tests are green, Phase 0.6B is safe to accept as a clean foundation.

Then the next handoff can discuss Phase 0.7 / hidden flagged trip mode. Do not start that before this fail-closed contract is corrected.
