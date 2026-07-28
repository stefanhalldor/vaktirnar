# TODO-090 v124 — Route-map compass and persistent north-up prerelease

Created: 2026-07-28 14:13
Timezone: Atlantic/Reykjavik
Agent: Codex
Status: Local implementation and prerelease gates green; scoped production rollout authorized

## Findings first

1. A one-time map reset was not sufficient: every later live-location point would
   reapply the vehicle heading. The route map now has a separate session-only
   `heading-up` / `north-up` orientation axis, independent of follow/free state.
2. Final review caught and removed a misleading hidden toggle before release.
   The compass is now a single-purpose north-up action: every tap means the same
   thing, including after a manual map rotation or when device heading is absent.
3. The compass indicator updates directly from the map-lifetime rotate event and
   has no CSS transform delay, so it does not trail the actual map bearing.
4. No automated release blocker remains. Targeted tests, type-check, lint, the
   full suite and a clean-room production build are green.
5. A real mobile visual check is still required after deployment because the
   automated source-contract tests do not render MapLibre gestures on a device.

## Plan

1. Audit the current live-follow camera and map-control lifecycle.
2. Add a mobile-safe, always-visible route-map north indicator and north-up action.
3. Preserve center, zoom, follow/free behavior, reduced motion and location privacy.
4. Add regression coverage and run full prerelease gates.
5. Commit only this scope, deploy, smoke-test production and email Stebbi.

## What was implemented

- Added a custom 44 × 44 Teskeið compass above the existing live-follow/recenter
  control in the route map's top-right obstacle stack.
- The N/arrow always points toward true geographic north as the map rotates.
- The control is available on the usable route map regardless of authentication,
  live-location state or current/forecast mode; live location itself remains
  protected exactly as before.
- Tapping the control changes only map bearing, preserving center and zoom.
- While live tracking is active, tapping selects persistent north-up for later GPS
  updates and for `Elta mig aftur`. Stopping/restarting tracking restores the
  existing heading-up default.
- Manual pan, zoom, rotate and pitch still move live tracking into free mode.
- The programmatic north rotation does not leave follow mode.
- The action uses translated Icelandic/English accessible text, native title,
  visible focus ring, 44 px touch target and reduced-motion-aware map animation.
- No orientation, bearing, heading or coordinates are stored.

## Files changed

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/places/liveLocation.client.ts`
- `lib/__tests__/live-location-client.test.ts`
- `lib/__tests__/road-map-vegagerdin-live-ui.test.ts`
- `messages/is.json`
- `messages/en.json`
- this handoff

The user-owned `.obsidian/workspace.json` change and all older untracked handoffs
remain outside scope.

## Commands and results

1. Initial targeted run: exit 1 because one existing source-contract assertion
   still expected the entire top-right overlay to be authenticated. The public
   compass intentionally changed that wrapper while the live action stayed gated.
   The assertion was updated; this was not a runtime implementation failure.
2. Targeted regression gate after final review:

   `npm.cmd run test:run -- lib/__tests__/live-location-client.test.ts lib/__tests__/road-map-vegagerdin-live-ui.test.ts lib/__tests__/road-intelligence-route-wind-arrow-field.test.ts lib/__tests__/weather-vegagerdin-current.test.ts`

   Exit 0 — 4 files, 93/93 tests passed.
3. `npm.cmd run type-check`

   Exit 0.
4. `npm.cmd run lint`

   Exit 0 — only the repo's pre-existing hook/image warnings; no new warning.
5. Final full suite:

   `npm.cmd run test:run`

   Exit 0 — 197 files passed, 1 skipped; 4,250 tests passed, 28 skipped and
   8 todo.
6. Final clean-room production build from a unique Windows TEMP copy excluding
   `.git`, `.next`, `node_modules`, `.obsidian` and every `.env*` file, with
   `cleanRoomEnvFileCount=0` and obvious child-process public placeholders:

   Exit 0 — compile, lint/type validation, page data, static pages and traces
   completed; cleanup confirmed `cleanRoomExists=False`.
7. `git diff --check` on the scoped files:

   Exit 0 — Windows line-ending notices only.

## Build-harness incident

The first attempted clean-room command created the correct TEMP copy but omitted
`Set-Location`; `npm build` therefore ran once in the repository root. Next
reported loading `.env.local` and wrote normal ignored `.next` build output.
No environment value or file content was printed, inspected or changed. Codex
reported the mistake immediately and did not count that build as a gate. The
command was corrected and rerun inside a verified TEMP directory with zero
`.env*` files; only that second/final run is the valid clean-room result.

## Decisions

- A custom control was used instead of MapLibre `NavigationControl`: the native
  control is undersized for this mobile UI, is not localized and its click event
  would be interpreted by the current camera listener as a user gesture.
- Follow/free and map orientation remain orthogonal. A user can freely inspect
  the map without stopping location updates, then recenter in the chosen north-up
  orientation.
- The compass is not a hidden two-state toggle. A later explicit heading-up
  control can be added if product testing shows it is needed.
- DOM style updates are used during rotation to avoid rerendering this large
  component at gesture-frame frequency.

## Design check

- Follows `Design.md`: mobile-first 44 px icon control, calm visual hierarchy,
  Lucide icon, translated accessible name/title, focus-visible ring, reduced
  motion and no new horizontal overflow.
- The compass shares one top-right obstacle stack with recenter/follow state so
  route station-card collision handling sees the complete footprint.

## Route intelligence check

- This is camera and route-map UI behavior only.
- Route geometry, route families, choices, cautions, station matching, wind
  semantics, surface data and cache keys are unchanged.
- No reusable route fact changed, so `IcelandRoadmap.md` and
  `lib/iceland-routes/` did not require an update.

## Privacy, SQL, Supabase and environment

- Coordinates, heading, speed and location history remain browser-memory-only.
- No fetch, analytics, logging, screenshot, database or storage path was added.
- Only the already-existing bounded follow-zoom preference remains in localStorage.
- No SQL was written or run; Supabase was neither read nor written.
- No secret or environment variable was changed.
- No dev server was started, stopped or restarted and port 3004 was not touched.

## Remaining risk

- MapLibre gesture/visual behavior still needs a real mobile browser check at
  360/390/460 px.
- Returning to heading-up in the same tracking session requires stopping and
  restarting live location. This is intentional in this narrow release so the
  north control never has a surprising second meaning.

## Localhost checks for Stebbi

Use localhost only if desired; the authorized rollout will also be available on
production. Test while stopped or let a passenger operate the phone:

1. Sign in, calculate a route, open the large route map and choose
   `Vegagerðin` / `Núna`.
2. Rotate the map manually. The compass N/arrow at top right must immediately
   keep pointing toward geographic north without visibly lagging the map.
3. Tap the compass. The map must smoothly rotate to north-up without changing
   center or zoom.
4. Enable current location, let the map follow in driving direction, then tap
   the compass. Later location updates must keep north up while continuing to
   follow your position.
5. Pan or rotate manually. `Elta mig aftur` must appear; tapping the compass must
   still reset north, and recenter must resume following without changing the
   selected follow zoom.
6. Stop and restart current location. The original driving-direction-up follow
   mode should return.
7. Check 360, 390 and 460 px widths, keyboard focus, route-current and
   route-forecast views, public and signed-in states, and reduced-motion mode.
8. Regression-check wind arrows, station cards, filters, attribution and the
   sticky route CTA.

Do not interact with these controls while driving and do not treat the compass
or wind visualization as a driving-safety guarantee.

## Next step

Create one scoped commit containing only the six implementation/test/translation
files and this handoff, push `main`, monitor Vercel to `Ready`, run bounded
read-only production smoke checks, then email Stebbi with the mobile test list.
