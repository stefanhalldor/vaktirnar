# TODO 086 v145 - Codex review of v144 prerelease

Created: 2026-07-14 08:09 Atlantic/Reykjavik
Agent: Codex
Reviews: `2026-07-14-0806-todo-086-v144-claude-v143-done-prerelease.md`

## Findings

### Low - v144 tie-break test does not exercise production logic

`lib/__tests__/weather-vedurstofan-blend.test.ts:176`

The new test documents the desired same-severity behavior, but it re-implements the decision inline:

```ts
const decisiveIsVedurstofan = metnoWindMs <= vedurstofanWindMs
```

It does not call the production decision code in `app/auth-mvp/vedrid/FerdalagidClient.tsx:779`. If the component tie-break regresses later, this test can still pass.

This is not a prerelease blocker because the production code itself now matches the agreed rule:

1. Worse severity wins.
2. If severity is equal, higher `windMs` wins.
3. If severity and wind are equal or missing, stable provider order lets Veðurstofan win.

Recommended next cleanup: extract the provider-decision comparator into a small pure helper under `lib/weather/`, then test the actual helper for MET/Yr, Veðurstofan, and soon Vegagerðin. That will also make the Vegagerðin add easier and safer.

## What Looks Good

- v143 Medium is fixed in production code: `combinedDecisiveVedurstofan` now compares severity first and `windMs` second before deciding whether the summary should show MET/Yr or Veðurstofan.
- The old `vedurstofanLayerDisclaimer` key is no longer found in `app/`, `components/`, `lib/`, or `messages/`.
- The MVP limitation around map/selected-point still being MET/Yr-oriented when a non-MET provider is decisive is acknowledged in v144 as next feature work, not hidden.
- No SQL, Supabase, cron, Vercel, commit, push, or deployment changes were made in v144.

## Tests Run By Codex

```powershell
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result: exit 0, 2 test files passed, 36 tests passed.

```powershell
npm run type-check
```

Result: exit 0.

## Recommended Next Step For Claude Code

Proceed with the next provider-selection architecture patch, but keep it small:

1. Extract a provider-neutral comparator/helper for "which provider is decisive for this slot".
2. Make it support the current fields first: provider key, display status, wind speed, source timestamp, and display payload.
3. Move current MET/Yr + Veðurstofan tie-break logic into that helper.
4. Add direct unit tests for the helper:
   - Veðurstofan worse severity beats MET/Yr.
   - MET/Yr worse severity beats Veðurstofan.
   - Same severity, MET/Yr higher wind beats Veðurstofan.
   - Same severity, Veðurstofan higher wind beats MET/Yr.
   - Same severity and same wind uses stable provider order.
5. Then wire map selected point / summary / selected provider display through the same provider-neutral result.

This should be done before Vegagerðin is added, because otherwise we risk copying the same conditional logic a third time.

## Localhost Checks for Stebbi

Preconditions:

- Localhost is running.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- Veðurstofan travel layer is enabled and product data has been warmed.
- Do not run migrations, cron jobs, Supabase changes, push, deploy, or commit for this check.

Checks:

1. Open Ferðaveðrið and use a route where both MET/Yr and Veðurstofan have data.
2. Turn on both `met.no` and `Veðurstofan`.
3. Find a slot where both providers are in the same severity color, but MET/Yr has higher wind.
   - Expected: summary should show MET/Yr as the decisive on-route source.
4. Find a slot where Veðurstofan has worse severity than MET/Yr.
   - Expected: summary should show Veðurstofan as decisive.
5. Turn off MET/Yr and leave only Veðurstofan on.
   - Expected: scrubber, summary status, map colors, and "Á leiðinni" should all be based on Veðurstofan.
6. Confirm the old paragraph "Veðurstofugögn eru í prófun. MET/Yr er áfram grunnspáin. Vegagerðin er ekki komin inn." is gone.

Known residual after v144:

- Clicking/selecting Veðurstofan map points is still not fully provider-neutral. Treat that as the next feature patch, not as fixed by v144.
