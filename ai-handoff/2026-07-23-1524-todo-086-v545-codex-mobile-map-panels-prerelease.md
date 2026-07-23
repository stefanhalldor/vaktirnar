# TODO-086 v545 - Codex handoff: mobile map panels and controls

Created: 2026-07-23 15:24  
Timezone: Atlantic/Reykjavik

## Skilningur á samþykki

Stebbi gave Codex explicit permission to fix the mobile layout according to
`Design.md`, specifically the route panel overlapping the shared emoji controls,
and then create a handoff.

Authorized:

- scoped code changes
- local type-check, tests, and production build
- this handoff

Not authorized and not performed:

- commit, push, deploy, migration, Supabase, SQL, auth, production, or external
  service changes

## Plan

1. Read the latest Claude handoff and inspect current map panel JSX.
2. Compare route and Mitt veður fields/controls against the mandatory mobile
   rules in `Design.md`.
3. Move the route panel below the shared emoji row.
4. Bring changed inputs and touch controls to the mobile minimums.
5. Verify with type-check, tests, build, and diff checks.

## What was actually done

### Route panel no longer sits behind the emoji controls

File: `components/weather/RoadMapPrototypeMap.tsx`

Root cause:

- Mitt veður begins at `top-14`.
- Púlsinn begins at `top-14`.
- The route drawer used `top-0`, so its header occupied the same top-left region
  as the shared 🌦️ / 🚗 / 💬 controls.

Fix:

- Route panel now begins at `top-14`.
- It uses the same `left-3` page inset as the other floating panels.
- Mobile width is `calc(100% - 1.5rem)` with `max-w-[360px]`, preventing
  horizontal overflow at 360, 390, and 460 px.
- It has a rounded top edge and a complete border except at the bottom.
- Its closed transform includes the left inset so it leaves the viewport fully.

Component tree after the change:

```text
Map
├── shared emoji controls (top-3, 40 px controls)
├── Mitt veður panel (top-14)
├── Púlsinn panel (top-14)
└── Akstur panel (top-14, left-3, responsive width)
```

### Route controls aligned with mobile Design.md minimums

File: `components/weather/RoadMapPrototypeMap.tsx`

- Shared emoji controls changed from 36x36 to 40x40 px.
- Route close button changed from 28x28 to 40x40 px.
- “Til baka í núna”, route clear, and layer toggles now have a 40 px minimum
  height.
- Route caution/danger input wrappers changed from 36 to 40 px height.
- Existing route text/number inputs already used `text-base` (16 px), so their
  mobile anti-zoom behavior was preserved.
- Púlsinn close control now has a 40 px minimum touch height.

### Mitt veður criteria fields made mobile-safe

File: `components/weather/WeatherChasePanel.tsx`

The three criteria fields introduced/standardized in v349 were only 24-28 px
high, used `text-xs` inside editable inputs, and were forced into three columns
on narrow phones.

Fix:

- Criteria use one column on mobile and three columns from `sm` upward.
- Editable input text is now `text-base` (16 px), preventing Safari/iOS
  auto-zoom.
- Minus/plus buttons are 40x40 px touch targets.
- Field wrappers and inputs are at least 40 px high.
- Unit labels and field labels remain compact but readable.
- Focus-visible rings were added to stepper buttons.
- Save-default control now has a 40 px minimum height.

The value parsing and stepping behavior was not changed:

- temperature: ±1, negative values allowed
- wind: ±1, floor 0
- precipitation: ±0.1, floor 0
- direct decimal text entry remains supported

## Design.md compliance

Relevant rules followed:

- mobile-first at 360-460 px
- 16 px minimum text inside `input`, `textarea`, and `select`
- no horizontal overflow
- touch targets generally at least 40x40 px
- fixed controls use stable sizes
- no control overlap

No new canonical component was needed. Existing Tailwind primitives and the
existing floating-panel pattern were reused.

The changes do not add navigation or async data behavior, so no new
`loading.tsx` or pending-state work is required.

## Files inspected

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-23-1445-todo-086-v349-route-chase-lifecycle-stepper-standardization.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `package.json`

## Files changed

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `ai-handoff/2026-07-23-1524-todo-086-v545-codex-mobile-map-panels-prerelease.md`

Unrelated existing change preserved and not edited by Codex:

- `.obsidian/workspace.json`

## Commands and results

1. `git diff --check`
   - Exit code 0.
2. `npm run type-check`
   - Exit code 0.
3. `npm run test:run`
   - Exit code 0.
   - 129 test files passed.
   - 3577 tests passed, 27 skipped, 8 todo.
4. `npm run build`
   - Exit code 0.
   - Next.js production build compiled and generated successfully.
   - Build reported pre-existing lint warnings in several files, including
     existing hook-dependency warnings in `RoadMapPrototypeMap.tsx`; no new
     compile failure or warning attributable to these class-only changes.
5. Final scoped `git diff --check`
   - Exit code 0.

No dev server was started or restarted.

## What failed or was skipped

- Browser/mobile visual testing was not run because Stebbi controls localhost
  and dev servers.
- No screenshot test or component test exists for these overlay positions.
- No automated tests were added because the change is CSS/layout-only and the
  current suite has no MapLibre viewport harness. Manual viewport checks remain
  required.

## Decisions

- The route panel uses the same `top-14` vertical start as Mitt veður and
  Púlsinn, making the hierarchy consistent.
- The route panel stays a left-side panel rather than becoming a modal; this is
  the smallest safe change and preserves the existing product behavior.
- Criteria fields stack on mobile because three 40 px steppers plus units cannot
  fit safely in three columns at 360 px.
- Desktop retains the three-column criteria layout.

## Remaining risks

- Exact visual interaction with mobile browser chrome and an open keyboard needs
  Safari/iOS or equivalent browser testing.
- The route panel still extends to the bottom of the viewport and intentionally
  sits above the lower strip by z-index when open, matching its existing drawer
  behavior.
- Several older small controls elsewhere inside the large weather comparison
  table/reorder UI remain below 40 px. They were not editable fields and were
  outside the reported panel/field overlap scope. A broader accessibility pass
  could standardize those separately without mixing it into this fix.

## Route intelligence check

- This change affects only presentation of the generic map panels and form
  controls.
- No route, road segment, region, route family, control point, caution, provider
  matching rule, cache key, or fixture changes.
- No new route knowledge belongs in `IcelandRoadmap.md` or
  `lib/iceland-routes/`.
- No route data is stored, counted, or exposed; privacy is unchanged.
- No `IcelandRoadmap.md` update is needed.

## Localhost checks for Stebbi

Page:

`http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Setup:

- Sign in with access to the road-map prototype.
- Test widths 360 px, 390 px, and 460 px.
- Repeat the input checks with the mobile keyboard open and closed.

### Shared controls and route panel

1. Confirm 🌦️, 🚗, and 💬 controls are 40 px and remain in one row without
   overlap.
2. Tap 🚗.
3. Confirm the route panel begins below the emoji row; its header and close
   button must not sit behind any emoji.
4. Confirm the panel stays inside the viewport with equal-looking left/right
   breathing room and no horizontal scrolling.
5. Close and reopen the panel. Confirm the slide transition fully hides it and
   leaves no clickable sliver at the left edge.
6. Enter Frá and Til. Confirm focusing either field does not zoom Safari/iOS.
7. Focus both wind-threshold number fields. Confirm no zoom, clipping, or layout
   jump when the keyboard opens/closes.
8. Calculate a route and confirm the summary, clear button, and bottom controls
   remain reachable by scrolling inside the panel.

Expected:

- route content always starts below the emoji controls
- no overlap or horizontal overflow
- inputs remain at normal viewport scale
- all changed route actions have comfortable touch targets

### Mitt veður fields

1. Tap 🌦️ and inspect the three criteria fields at 360/390/460 px.
2. Confirm temperature, wind, and precipitation are stacked one per row on
   mobile, with no squeezed/cropped values or units.
3. Focus and type into each field. Confirm no automatic mobile zoom.
4. Use every −/+ button. Confirm each target is easy to tap and has visible
   keyboard focus.
5. Confirm stepping remains:
   - temperature ±1 and may be negative
   - wind ±1 and never below 0
   - precipitation ±0.1 and never below 0
6. At a desktop/tablet width of at least 640 px, confirm the three criteria
   fields return to one three-column row.

Expected:

- 16 px editable text
- 40 px stepper targets
- no horizontal overflow
- values and units remain visible
- comparison criteria still dim weather rows correctly

### Púlsinn regression

1. Tap 💬.
2. Confirm the panel still starts below the emoji row.
3. Confirm its close action is comfortably tappable and the route panel is not
   visible underneath.

No Supabase, auth, RLS, user-data, secrets, billing, deployment, or production
action is required for these localhost checks.

## Suggested next step

Stebbi should run the localhost checks above and send screenshots at 360 or
390 px if any panel still overlaps. After visual confirmation, Claude Code or
Codex can perform a final diff review. Commit/push/deploy require separate,
explicit permission.

## Óvissa / þarf að staðfesta

- Confidence: high that the code-level overlap root cause is fixed because the
  route panel now shares the same `top-14` boundary as the other two panels.
- Confidence: high that the changed editable fields meet the explicit Design.md
  16 px and 40 px rules.
- Browser/mobile visual behavior remains unconfirmed until Stebbi completes the
  localhost checks.
