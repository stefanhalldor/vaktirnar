# TODO 078 - Codex review of v019 and workflow rule hardening

Created: 2026-07-11 08:50
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Review + workflow/process update
Related TODO: #78 Ferðalagið / shared route-weather core
Reviews: `2026-07-11-0847-todo-078-v019-claude-phase06b-failclosed-fix-prerelease.md`

Status: v019 is accepted from Codex review perspective. Phase 0.7 may be planned next, but only under explicit scope and feature flag rules.

---

## Findings

No blocker findings.

The P1 fail-closed issue from v017 is fixed:

- `lib/weather/trip-assessment.ts` now injects a `gult` floor whenever `validationIssues.length > 0`.
- Malformed trips no longer aggregate to `graent` when all assessed legs are green.
- Red leg status still wins over the validation floor, so invalid + red remains `rautt`.
- `worstLegId` remains based on assessed legs only, which is correct.

The new/strengthened tests cover the intended cases:

- `unknown_from_stop` + green leg -> `gult`
- `unknown_to_stop` + green leg -> `gult`
- `single_drive_requires_one_leg` + green legs -> `gult`
- `non_adjacent_leg` + green legs -> `gult`
- structural issue + red leg -> `rautt`

---

## Commands Codex ran

```bash
npm run type-check
```

Result: passed.

```bash
npm run test:run -- lib/__tests__/weather-trip-assessment.test.ts lib/__tests__/weather-trip.test.ts lib/__tests__/weather-assessment.test.ts lib/__tests__/weather-travel.test.ts
```

Result: 4 test files passed, 158 tests passed, 5 skipped.

---

## Files Codex reviewed

- `ai-handoff/2026-07-11-0847-todo-078-v019-claude-phase06b-failclosed-fix-prerelease.md`
- `lib/weather/trip-assessment.ts`
- `lib/__tests__/weather-trip-assessment.test.ts`

---

## Workflow update made by Codex

Stebbi asked Codex to stop putting this kind of result only in chat and to harden the workflow so Codex creates handoff files by default.

Codex updated:

- `WORKFLOW.md`

Change:

- The `Handoff skjöl` rule now applies explicitly to both Codex and Claude Code.
- Review/status/plan answers to handoff files should go into `ai-handoff/`, not only chat.
- Prompts like "áfram gakk?", "halda áfram?" or similar after a handoff/prerelease now explicitly require a new handoff/review file unless Stebbi asks for a short chat-only answer.
- Chat should then contain only a short summary and a link to the new handoff file.
- The rule still does not permit code changes, SQL, migrations, env changes, TODO/DONE changes, commit, push, deploy or production changes.

This is a process/documentation change only.

---

## Recommendation

Continue to Phase 0.7 planning next.

Suggested constraints for the next Claude Code handoff:

- Hidden / feature-flagged only.
- No public UI surprise.
- No SQL.
- No saved trips.
- No new route/weather engine.
- Reuse `WeatherTrip`, `TripLeg`, `assessRouteLeg()` and `assessWeatherTrip()`.
- Treat current one-drive flow as the first/default trip shape, not a fork.
- Any UI work must read `Design.md` first and keep mobile app behavior clean.

Do not implement Phase 0.7 without an explicit implementation approval from Stebbi.

---

## Localhost checks for Stebbi

There is no user-visible product change in v019 or in the workflow documentation update.

For v019 core validation:

1. Open `/auth-mvp/vedrid` as an authenticated user.
2. Calculate a normal route, for example Reykjavik -> Akureyri.
3. Expected: route options, weather result, departure scrubber, route weather points and map behave exactly as before.
4. Open `/vedrid` as a public user if `WEATHER_PUBLIC_ENABLED=true`.
5. Calculate a normal route.
6. Expected: public weather flow behaves exactly as before.
7. There should be no Ferðalag UI, no add-stop controls, no campsite controls and no SQL migration.

For workflow:

1. Ask Codex or Claude Code to review a future handoff/prerelease.
2. Expected: the answer should create a new `ai-handoff/` review/plan file by default.
3. Expected: chat should only summarize and link to the handoff file, unless Stebbi explicitly asks for chat-only.
