# TODO-090 v122 — Live-location heading, wind direction and overview zoom prerelease

**Date/time:** 2026-07-28 13:34 Atlantic/Reykjavik
**Agent:** Codex
**Status:** Prerelease gates green. Scoped commit, push, deployment and production smoke are authorized but had not yet been performed when this handoff was written.

## Findings first

1. **The spinning user arrow had two concrete causes.** Every finite browser course was trusted at low speed/weak accuracy and always overrode the independent GPS displacement bearing. A single 180-degree spike therefore moved the filtered result by 81 degrees. Separately, CSS could animate 359 degrees to 1 degree around the long side of the circle.
2. **The route-field wind conversion was already correct and must not be flipped.** Vegagerðin reports the meteorological direction the wind comes from; the road arrows correctly add 180 degrees to show where it travels. The visible contradiction came primarily from station-card arrows remaining viewport-fixed while live follow rotated the map.
3. **The Vegagerðin raw direction contract was reversed in the provider types/parser.** The official and live contract is `Vindatt` = numeric degrees and `VindattAsc` = Icelandic compass text. The old implementation often appeared to work only because the numeric value was converted to text and parsed again downstream.
4. **Follow zoom 10 was too close for a trip overview.** The lower bound is now 5; default 14, upper bound 18, one-level steps and storage/privacy behavior are unchanged.
5. **No release blocker remains in automated validation.** Targeted tests, type-check, lint, the full suite and a clean-room production build are green. Real iOS/Android driving behavior remains the necessary post-deploy manual gate because raw location/course is deliberately neither logged nor transmitted.

## Plan

1. Audit device heading, GPS-derived heading, visual rotation and follow zoom.
2. Verify Vegagerðin direction semantics against the official contract and live public endpoint.
3. Implement bounded browser-local course filtering, visual angle unwrapping, map-aligned station-card arrows, provider correction and wider zoom.
4. Add regression coverage and run all prerelease gates.
5. Commit only this scope plus this handoff, deploy, smoke-test and request mobile verification.

## What was implemented

### Live-location heading

- Tightened device-course use to actual movement and better horizontal accuracy.
- Ignores duplicate/out-of-order geolocation callbacks and requests fresh positions with `maximumAgeMs: 0` in driving follow mode.
- Keeps a GPS displacement anchor until movement exceeds combined positional uncertainty.
- Uses derived course to corroborate device course and prefers the independent derived course when they disagree strongly.
- Rejects isolated and repeated opposite device-only spikes at motorway speed.
- Applies speed/time-bounded turn rates plus shortest-angle smoothing; real corroborated bends continue to move the course.
- Expires an unsupported direction after 10 seconds rather than showing a stale heading for 30 seconds.
- Unwraps the puck's viewport angle so CSS uses 359 -> 361 rather than making a full turn to 1.

### Wind direction

- Preserved the correct meteorological `FROM + 180 = TOWARD` route-arrow logic.
- Corrected the provider contract to official `Vindatt` degrees and `VindattAsc` text.
- Added a narrow type-discriminated fallback for legacy reversed input without accepting partial/out-of-range numeric values.
- Station-card arrows now use the same continuous TOWARD bearing as the road field, subtract current map bearing, and resynchronize whenever the map rotates.
- Both overview and active-route Vegagerðin cards pass numeric direction when available; numeric-text legacy data remains supported.

### Follow zoom

- Changed the lower bound from 10 to 5 so the user can see an Iceland/trip-scale overview while following.
- Kept default 14, maximum 18, step 1 and the existing bounded zoom-only localStorage preference.

## Files inspected

- `WORKFLOW.md`
- relevant mobile/map sections of `Design.md`
- `IcelandRoadmap.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/places/liveLocation.client.ts`
- `lib/road-intelligence/routeWindArrowField.ts`
- `lib/weather/providers/vegagerdinCurrent.server.ts`
- `lib/weather/providers/vegagerdinCurrentTypes.ts`
- related live-location, map UI, wind-field and provider tests
- official Vegagerðin weather data contract and public `vedur2014_1` response

## Files changed

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/places/liveLocation.client.ts`
- `lib/weather/providers/vegagerdinCurrent.server.ts`
- `lib/weather/providers/vegagerdinCurrentTypes.ts`
- `lib/__tests__/live-location-client.test.ts`
- `lib/__tests__/road-map-vegagerdin-live-ui.test.ts`
- `lib/__tests__/weather-vegagerdin-current.test.ts`
- this handoff

The pre-existing user-owned `.obsidian/workspace.json` change and all older untracked handoffs were preserved and excluded from scope.

## Commands and results

1. Targeted provider test run by the wind audit agent:

   `npm.cmd run test:run -- lib/__tests__/weather-vegagerdin-current.test.ts`

   Exit 0 — 47/47 tests passed.

2. Combined targeted regression gate:

   `npm.cmd run test:run -- lib/__tests__/live-location-client.test.ts lib/__tests__/road-map-vegagerdin-live-ui.test.ts lib/__tests__/road-intelligence-route-wind-arrow-field.test.ts lib/__tests__/weather-vegagerdin-current.test.ts`

   Exit 0 — 4 files, 90/90 tests passed.

3. Final live-location targeted rerun after adding the real-bend regression:

   `npm.cmd run test:run -- lib/__tests__/live-location-client.test.ts`

   Exit 0 — 20/20 tests passed.

4. `npm.cmd run type-check`

   Exit 0.

5. `npm.cmd run lint`

   Exit 0. Only pre-existing React-hook/image warnings were emitted.

6. Final full suite:

   `npm.cmd run test:run`

   Exit 0 — 197 files passed, 1 skipped; 4,248 tests passed, 28 skipped and 8 todo.

7. Clean-room `npm.cmd run build` from a unique Windows TEMP copy excluding `.git`, `.env*`, `.obsidian`, `.next` and `node_modules`, with a dependency junction and obvious process-only public placeholders:

   - sandboxed attempt: exit 1 solely because `next/font` could not fetch public Inter data;
   - one-time network retry: exit 0 — compile, lint/type validation, page data, 118 static pages and traces completed;
   - cleanup verification: `cleanRoomExists=False`.

8. `git diff --check`

   Exit 0; Windows line-ending notices only.

## Decisions

- No magnetometer/DeviceOrientation input was added. In a moving car the GPS course-over-ground and displacement course are the appropriate signals; phone orientation is not vehicle direction.
- A large device-only turn at motorway speed is not accepted without GPS corroboration. At lower speed a second consistent sample can confirm a turn.
- The road-field arrows were not flipped because official Vegagerðin material explicitly defines wind direction as where wind comes from.
- No raw heading/location diagnostic logging was added; device uncertainty must be validated manually without collecting movement history.

## Route intelligence check

- Provider matching, station influence distance, route geometry, route choice, caution ranking, surface classification and safety thresholds are unchanged.
- Current-measurement direction fields are now normalized according to the official provider contract. Wind speed and gust semantics are unchanged.
- Legacy direction shapes are accepted only at the parser boundary; no new long-lived compatibility model or schema was introduced.
- No reusable route facts, canonical segments, matching evidence or cache keys changed, so `IcelandRoadmap.md` did not require an update.

## Privacy and safety

- Coordinates, speed, heading, anchors and pending outliers remain browser-memory-only.
- No location fetch, reverse geocoding, analytics, console logging, Supabase write, screenshot or storage was added.
- Only the bounded follow-zoom preference is stored locally.
- Location watching still requires explicit opt-in, authentication, an active route and Vegagerðin/Núna mode, and stops at all existing exit/visibility boundaries.
- This visualization is current measurement context, not a guarantee of safe conditions.

## Supabase / SQL / environment

- No SQL was written or run.
- Supabase was neither read nor written.
- No `.env.local`, secret or real environment value was read or changed.
- No Vercel environment variable was changed.

## Remaining risk

- Hardware/browser course quality varies. The filters have synthetic coverage, but straight-road, bend, weak-GPS and background/resume behavior still needs real iOS Safari and Android Chrome verification.
- Wind anchors still use the nearest matched station by along-route distance within the existing 15 km influence. On folded/parallel route geometry, the visually nearest station can differ; this behavior was not changed.
- Source-contract UI tests do not replace a real rendered mobile rotation check.

## Localhost checks for Stebbi

Only test while stopped or let a passenger operate the phone.

1. Sign in and open `/auth-mvp/vedrid`; calculate a route, open the large route map, select `Vegagerðin` and `Núna`, then opt in to current location.
2. On a straight stretch at normal road speed, verify the blue direction puck stays forward and never reverses or spins. On a genuine bend, verify it turns smoothly rather than freezing.
3. Briefly enter an area with weaker GPS or background/foreground the browser. The direction should hold briefly and then disappear rather than claim a stale/opposite course; location should recover without a full spin.
4. Pan or rotate the map manually. It should enter free mode and show `Elta mig aftur`; the location keeps updating. Recenter should resume following without a jump.
5. Press minus repeatedly. The follow zoom should reach 5, allowing a broad trip/Iceland view; plus should return up to 18. In free mode the chosen zoom should apply only after recenter.
6. Rotate the map and compare a Vegagerðin station-card arrow with nearby road arrows. Both must keep the same geographic wind direction as the map turns; the card remains viewport-upright.
7. Check 360, 390 and 460 px widths for compact controls, 40 px touch targets, safe-area clearance and no horizontal overflow.
8. Regression-check route selection, station names, wind filters, attribution, sticky route CTA and public sign-in CTA.

Do not interact with these controls while driving. Do not treat the arrow display as a driving-safety assurance.

## Next step

Create one scoped commit containing only the seven implementation/test files and this handoff, push `main`, monitor Vercel to Ready, run read-only production smoke checks, then email Stebbi with the stopped/passenger-only mobile test list.
