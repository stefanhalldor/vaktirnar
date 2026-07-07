# todo-067 v096 - Codex handoff: route timeline map first, Iceland map later

Created: 2026-07-06 19:58
Timezone: Atlantic/Reykjavik
Author: Codex
Relevant TODO: `todo-067` Ferðalagið weather work
Builds on:
- `2026-07-06-1632-todo-067-v087-codex-iceland-travel-conditions-map.md`
- `2026-07-06-1745-todo-067-v095-claude-v087-iceland-map-review.md`

## Stebbi decision after v095

Stebbi agrees the Iceland-wide travel-conditions map is a strong idea, but wants the next formal step to be narrower and more immediately useful:

1. We already have a weather feature flag. Do **not** add a separate rollout phase just for this idea unless implementation needs a temporary internal subflag.
2. It is probably allowed to fetch/cache Icelandic forecast points from met.no if we follow their rules, but we should not start with a dense "all Iceland" grid.
3. First phase should make the **existing selected route map** much richer:
   - route map for the chosen `frá` and `til`
   - weather points/forecast points on that route
   - horizontally scrollable time axis like the mental model on vedur.is
   - selected time changes marker colors and point details
   - user can see which part of the chosen route becomes risky and when
4. Iceland-wide road-aware model-lab map comes after that. It remains valuable, but it should be built on top of the same data/evaluation primitives proven in route timeline mode.

This handoff therefore supersedes the v087/v095 sequencing for the immediate next milestone. Do **route timeline audit map first**, not Iceland-wide snapshot first.

## met.no policy conclusion

Based on official met.no docs, "fetch/cache all Iceland" is not automatically forbidden, but it must be done carefully.

Allowed direction, if implemented later:

- server-side/BFF calls only for non-trivial traffic
- identifying `User-Agent` with app/contact
- local cache
- respect `Expires` and `Last-Modified` / `If-Modified-Since`
- do not repeat requests before expiry
- spread automated requests over time with jitter
- truncate lat/lon to max 4 decimals
- avoid synchronized hourly spikes
- attribution and beta framing
- keep total traffic comfortably below met.no limits, or get agreement if ever approaching >20 requests/sec per application

Not acceptable:

- browser calls to met.no for every map point
- dense grid requests on each page load
- polling every route/user independently when shared cache could serve it
- pretending Teskeið is Yr, met.no, Veðurstofan or Vegagerðin
- showing unofficial travel status without timestamp, source and explanation

Important interpretation: "all Iceland" should initially mean **road-aware Iceland**: curated route/road points, not every mountain/grid coordinate. Dense gridded model data or THREDDS can remain a research path, but it is not the next implementation step.

Official sources checked:

- met.no Terms of Service: https://api.met.no/doc/TermsOfService
- met.no Locationforecast docs: https://api.met.no/weatherapi/locationforecast/2.0/documentation

## Recommended next milestone: Route Timeline Audit Map

### Goal

Give Stebbi and users an auditable, interactive view of the actual route-weather model over time.

The user should be able to answer:

- "Hvaða leið er Teskeiðin að meta?"
- "Hvaða veðurpunktar/stöðvar liggja til grundvallar?"
- "Hvenær verður næst varasamt á þessari leið?"
- "Hvar á leiðinni verður það varasamt?"
- "Hvaða mæligildi veldur stöðunni?"
- "Er þetta rauða/gula slot stutt með gögnum eða bara texta?"

### UX shape

On the final Ferðalagið result screen:

1. Show the route map as an interactive Google map, not a static image.
2. Draw the chosen route polyline.
3. Show origin/destination pins.
4. Show all weather/forecast points used in the route analysis.
5. Add a horizontal time scrubber tied to the selected route:
   - hours as chips/ticks
   - visible day/date label while horizontally scrolling
   - status color per hour
   - outbound and return separated if return exists
6. When a time is selected:
   - recolor all route weather points for that time
   - highlight the worst point for that selected time
   - update the point detail sheet/card
   - show exact reason: wind/gust/precipitation/no data
7. When a point is tapped:
   - show point/station label when available
   - show distance along route
   - show forecast valid time
   - show wind
   - show gust only when gust > wind
   - show precipitation only when it is meaningful or threshold-related
   - show threshold and reason if warning/red
   - link out to external forecast and map
8. Move the explanatory copy below the map:
   - `Reiknað úr veðurspá og leið, ekki giskað af gervigreind.`
   - details and all points live under `Hvernig er þetta metið?`

### Design.md alignment

Claude Code must keep this mobile-first and app-like:

- 360-460 px mobile width is the primary design target.
- Map height should be useful but not eat the whole page; likely around 260-340 px on mobile depending on surrounding content.
- Horizontal timeline must not create page-level horizontal overflow.
- Touch targets should be at least 40x40 px where practical.
- Status colors cannot be the only information; include labels/icons or selected detail text.
- Avoid nested cards. The map can have a detail sheet/card, but do not put cards inside cards inside cards.
- All user-facing text belongs in `messages/is.json` and `messages/en.json`.
- No hardcoded `kl.` in English.
- Navigation/back/recalculate flows need visible pending/loading state if async.

## Implementation phases for Claude Code

### Phase A - Inspect and plan only

Do this first unless Stebbi has explicitly granted implementation permission.

Tasks:

1. Read `WORKFLOW.md`, `Design.md`, this handoff, and the latest todo-067 handoffs after v092/v094.
2. Inspect current route-weather payload shape:
   - what per-point weather time series is already available
   - what is only computed for selected departure
   - how departure candidates are calculated
   - how outbound and return are represented
3. Confirm whether the timeline can reuse existing data without adding new met.no calls.
4. Confirm how `TravelAuditMap`, `DepartureHeatmap`, and `FerdalagidClient` currently sync selected slots and map selection.
5. Produce a short plan for implementation. Do not code until Stebbi says Claude Code may execute.

Stop with handoff if any major data-shape change is needed.

### Phase B - Shared route-time evaluation helper

Goal: one deterministic function can answer "what is the status of this route at this departure time?"

Requirements:

- Reuse current threshold engine.
- Support outbound and return separately.
- Return point-level summaries for the selected time:
  - status
  - metric
  - value
  - threshold
  - unit
  - forecast valid time
  - distance along the correct leg
  - point/station label if available
  - forecast coordinates
- Green selections must still produce a stable default selected point, usually worst/most relevant point for that time, not stale red/yellow state from a previous selection.
- Return leg distance must be calculated from the return origin, not accidentally from outbound origin.

Tests:

- green slot after red/yellow selection clears stale highlighted issue
- outbound and return distances are correct
- gust display is hidden when gust <= wind
- precipitation under threshold does not create warning status
- English locale does not include hardcoded Icelandic time text

### Phase C - Timeline-controlled audit map

Goal: the route map becomes the visual explanation for the selected time.

Requirements:

- Add/extend props so map accepts a selected leg and selected departure/arrival candidate.
- Draw route polyline.
- Draw all weather points used by analysis.
- Color markers by selected time status.
- Highlight selected/worst point.
- Tapping marker selects point and updates detail panel.
- Time scrubber click/tap updates map and detail panel.
- Outbound and return timelines are separate, never mixed into one strip when both are present.
- Day/date label remains visible while scrolling horizontally.
- If map library/key is unavailable, fallback must still show useful non-map details; no blank panel.

Important UX detail:

If the main result is green but a later time becomes yellow/red, show a concise line near the result:

`Næsta varasama brottför: þri. 7. júl. kl. 16:00, vegna úrkomu við [stað/punkt].`

If there is no risky slot in the searched window:

`Engin varasöm brottför fannst í þessu tímabili.`

The selected timeline slot and this "next risky" line must be backed by the same deterministic data.

### Phase D - Make the first-step place selection feel more like maps

This is part of "alla leið", but should come after the route result timeline unless Claude Code can do it without touching the same files too broadly.

Goal:

- Replace the weak static origin/destination confirmation feel with a more maps-like selection flow.

Direction:

- origin and destination on the same screen if practical
- interactive map preview after both are selected
- pins for both places
- route preview once route is known or confirmed
- clear correction affordance if Google resolves the wrong place
- no mobile zoom/overflow

This should still avoid a massive rewrite of the whole Ferðalagið flow in the same pass as the route timeline map.

### Phase E - Road-aware Iceland model-lab map

Only after route timeline is stable:

- Create road-aware curated point set.
- Generate server-side snapshot.
- Use BFF/cache only.
- Use same route-time evaluation helper where possible.
- Let Stebbi scroll/scrub Iceland travel conditions by time.
- Public beta can use the existing weather feature flag/kill switch; add a temporary internal subflag only if implementation is incomplete or risky.

Do not start with dense all-country grid.

## Data and API notes for the route-first phase

The route timeline should ideally reuse forecasts already fetched for the route. Claude Code should verify this in code, but the intended shape is:

- one route calculation
- a bounded set of route/weather points
- met.no forecast per point, cached server-side
- client receives point forecasts or normalized per-time summaries
- timeline uses those summaries locally

If the current API only returns the selected departure summary and not enough per-time data, extend the BFF response carefully rather than adding client-side met.no calls.

Guardrails:

- Do not increase route sample count without a reason.
- Do not fetch on every timeline hover/scroll.
- Do not refetch forecasts when selecting a timeline slot if the data is already in the result payload.
- Keep payload compact; if needed, send normalized hourly summaries instead of raw met.no JSON.
- Preserve met.no attribution and current disclaimer.

## Product copy to include

Use the existing deterministic-AI explanation, but place it in the right hierarchy:

Main short line below map:

`Reiknað úr veðurspá og leið, ekki giskað af gervigreind.`

Expandable explanation:

`Veðurmatið er reiknað úr leiðinni, tímasetningu og veðurspá á punktum meðfram leiðinni. Gervigreind tekur ekki ákvörðunina sjálf. Hún má hjálpa okkur að orða niðurstöðuna, en vindur, hviður, úrkoma, tími og staðsetning ráða matinu.`

Keep this in both `messages/is.json` and `messages/en.json`.

## Explicit non-goals for the next implementation pass

- No new Supabase tables.
- No SQL migration.
- No cron job.
- No public Iceland-wide route.
- No dense grid over Iceland.
- No browser calls to met.no.
- No production env changes.
- No commit/push/deploy unless Stebbi separately requests it.

## What Codex wants Claude Code to be careful about

1. Do not let the map and timeline show different truth.
2. Do not mix outbound and return in the same heatmap/timeline.
3. Do not show warning status for harmless drizzle below threshold.
4. Do not show gusts unless gust > wind.
5. Do not leave selected map state stale after user selects a green slot.
6. Do not calculate return distances from outbound origin.
7. Do not add more weather calls merely to make the UI nicer.
8. Do not make the map a decorative proof-image; it must be the explanation.

## Suggested Claude Code response format

Claude Code should respond with a new handoff/review file, not just chat text, containing:

1. Whether Claude Code agrees route timeline should come before Iceland map.
2. What current data already supports this.
3. What data shape is missing, if any.
4. Proposed file-level implementation plan.
5. Tests to add/update.
6. Localhost checks for Stebbi.
7. Any reason this should wait until current v094/v095 work is committed.

## Localhost checks for Stebbi

For Phase A planning only:

1. No localhost UI change is expected.
2. Stebbi should not need to restart dev server.
3. Claude Code should state exactly which current localhost flows would be affected if implementation begins.

For Phase C implementation later, Stebbi should test:

1. Open `/auth-mvp/vedrid`.
2. Choose a route with known enough distance, e.g. Garðabær to Akranes or Reykjavík to Selfoss.
3. Confirm final result shows interactive route map, not a dead static proof image.
4. Confirm all weather points used by the answer appear on the route map.
5. Scroll the time axis horizontally and verify day/date context remains visible.
6. Tap a green slot after a yellow/red slot and confirm old warning details do not remain selected.
7. Tap a yellow/red slot and confirm the map highlights the exact point that caused it.
8. Tap route markers and confirm the detail panel shows station/place label if available, forecast time, wind, gust only if higher than wind, precipitation, threshold and reason.
9. If return trip is selected, confirm outbound and return are shown in separate timeline sections.
10. Confirm no page-level horizontal overflow at 360 px, 390 px and 430 px mobile widths.
11. Confirm English locale has no hardcoded Icelandic `kl.` text.
12. Confirm missing Google map key or map failure does not produce a blank result; fallback details still explain the route weather.

## Uncertainty / needs confirmation

- Codex has not inspected the post-v094 code diff in this specific handoff. Claude Code should verify current file state before planning implementation.
- It is not yet confirmed whether the current BFF response includes enough per-point/per-time summaries for the route timeline without expanding payload shape.
- met.no allows substantial use when terms are followed, but a future public Iceland-wide map should still keep traffic conservative and observable.
