# 2026-07-16 07:26 - Codex review: v301 prerelease

Created: 2026-07-16 07:26  
Timezone: Atlantic/Reykjavik  
Related TODO: todo-086  
Reviewed handoff: `2026-07-16-0723-todo-086-v301-claude-v300-done-prerelease.md`

## Findings

### High - Existing `guard.test.ts` still encodes the old Veðurstofan provider contract

The runtime code now says:

- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` = per-user gate
- unset/deleted = open

That is in `lib/loans/guard.ts:93-101`.

But `lib/__tests__/guard.test.ts` still contains old expectations:

- line 967: "requires per-user access when ... is not set (default restricted)"
- line 975: "legacy ... true ... new var absent = default restricted"
- line 990: `WEATHER_ENABLED=All` + deleted access var expects no row = false
- line 998: `WEATHER_ENABLED=All` + deleted access var still expects row-based access

Those tests are now stale and likely fail if run. This should block commit/release until updated, because it means the test suite no longer documents the provider graduation contract we just shipped in v297.

Recommended fix:

- Update the weather-provider-vedurstofan tests so absent/deleted access var expects `true` and does not hit the DB.
- Keep the explicit `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` tests as the per-user gate contract.
- Add a test for `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false` as transitional/non-true open if desired.

### Medium - `weather-pulse` branch in `checkFeatureAccess()` lacks direct unit coverage

v301 updates `lib/loans/guard.ts` for `weather-pulse`, but only `lib/__tests__/chat-access.test.ts` is updated.

`chat-access.test.ts` mocks `checkFeatureAccess`, so it does not exercise the actual `weather-pulse` branch in `lib/loans/guard.ts`.

Recommended fix:

- Add `checkFeatureAccess — weather-pulse` tests in `lib/__tests__/guard.test.ts`:
  - `WEATHER_ENABLED=off` -> false
  - `TESKEID_CHAT_ENABLED` missing/false -> false
  - `WEATHER_PULSE_ACCESS_REQUIRED` absent/deleted -> true, no DB lookup
  - `WEATHER_PULSE_ACCESS_REQUIRED=false` -> true, no DB lookup
  - `WEATHER_PULSE_ACCESS_REQUIRED=true` + row -> true
  - `WEATHER_PULSE_ACCESS_REQUIRED=true` + no row/error/invalid email -> false

This keeps the reusable access model honest outside the `checkChatAccess()` facade.

### Low - v301 did not run tests

The code diff itself is small and mostly correct, but because there is known stale test content, tests should run before commit:

```bash
npm run test:run -- lib/__tests__/guard.test.ts lib/__tests__/chat-access.test.ts
npm run type-check
```

No need to run full build before this local blocker is fixed.

## What Looks Good

- `FerdalagidClient` already receives `isGuest`, and the public refresh-button fix uses the correct prop.
- Public `/vedrid` uses `<FerdalagidClient isGuest />`; authenticated `/auth-mvp/vedrid` does not, so the basic UI gate is correct.
- Route-selection map changed from `zoom: 6`/48px padding to `zoom: 5`/32px padding, matching the `/elta-vedrid` overview direction.
- The stale banner text changed exactly as requested in Icelandic.
- `checkChatAccess()` now treats non-`true` `WEATHER_PULSE_ACCESS_REQUIRED` as graduated/open, which matches the new env model.

## Env Contract After Fixes

For the desired current production behavior after v301:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
TESKEID_CHAT_ENABLED=true
```

Delete/omit:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
WEATHER_PULSE_ACCESS_REQUIRED
```

Meaning:

- public users can see Veðurstofan layer and existing pulse previews,
- public users cannot post and cannot manually fetch Veðurstofan data,
- signed-in users can see Veðurstofan and post in Veðurpúls,
- setting either access var to `true` re-enables that per-user gate.

## Localhost Checks for Stebbi

After Claude Code fixes the tests:

1. Start with local env:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
TESKEID_CHAT_ENABLED=true
```

and remove:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
WEATHER_PULSE_ACCESS_REQUIRED
```

2. Open `/vedrid` signed out:
   - Veðurstofan layer can appear.
   - `Sækja ný gögn` does not appear.
   - Empty Veðurpúls is hidden.
   - Existing Veðurpúls preview can appear if messages exist.

3. Open `/auth-mvp/vedrid` signed in:
   - Veðurpúls composer appears on Veðurstofan cards.
   - If stale banner appears, headline is `Ný gögn frá Veðurstofunni verða vonandi aðgengileg fljótlega`.

4. Set `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` and restart:
   - signed-out users should not see Veðurstofan.
   - signed-in users need `weather-provider-vedurstofan` row.

5. Set `WEATHER_PULSE_ACCESS_REQUIRED=true` and restart:
   - signed-in users without `weather-pulse` row should not get composer.

6. Route-selection map:
   - initial `/vedrid` route step shows Iceland context.
   - after selecting origin/destination, the route is readable and not too zoomed in on mobile.

## Recommendation

Do not commit v301 yet. Ask Claude Code to update the stale `guard.test.ts` provider tests and add direct weather-pulse guard tests, then run the targeted tests and type-check.

## Óvissa / þarf að staðfesta

- I did not run tests; the `guard.test.ts` issue is based on code/test inspection.
- I did not inspect all Vercel env values.
- If Claude Code already has additional unshown test updates outside the diff I reviewed, re-check `git diff` before acting.
