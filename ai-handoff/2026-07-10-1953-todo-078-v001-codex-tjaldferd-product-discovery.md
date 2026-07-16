# TODO 078 - Tjaldferð / Tjaldveðrið product discovery

Created: 2026-07-10 19:53  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: First draft handoff for Claude Code  
Status: Product/discovery draft. No implementation approval implied.

## Context

Stebbi wants to explore a new derived Teskeið product built on top of the existing Ferðaveðrið work.

Working names:

- `Tjaldferð`
- `Tjaldveðrið`
- `Hvert á ég að tjalda?`

Important direction from Stebbi:

- Start with **no AI**.
- Like Ferðaveðrið, this should be deterministic calculations from forecast values, route duration, route weather, campsite weather and selected thresholds.
- AI can come later as a wording/interpretation layer, but it must not decide whether a trip is safe or good.
- This is not only a simple out-and-back trip. Users must be able to visit multiple campsites in one trip.
- Users should be able to return to a saved trip and see updated values, including whether it is now better to change something from the original plan.

This handoff is a first draft to help Claude Code map product, data, architecture and implementation phases. It is not a request to code yet.

## Design.md Notes

Codex read `Design.md` before writing this handoff.

Relevant constraints:

- Mobile-first app experience, not a marketing page.
- Avoid hero-scale UI inside the app.
- Use structured summary panels for trip/state summaries.
- Avoid nested cards and loose paragraph stacks.
- Stable controls and no horizontal overflow.
- Inputs must be at least 16px on mobile to avoid iOS zoom.
- Route/data waits need clear pending states or the canonical Teskeið loader.
- All user-facing copy belongs in `messages/is.json` and `messages/en.json`.
- Status colors cannot be the only signal.

Implication for this product:

- The core UI should probably be a mobile-first trip builder and a timeline, not a dashboard.
- It should use rows/sections such as `Leggur`, `Dvöl`, `Heimferð`, `Endurmat`, rather than large nested card piles.
- The saved trip detail should be scannable in a screenshot.

## Core Product Idea

The product helps users plan and re-check camping trips using objective weather and route calculations.

Two main modes:

### A. User knows where they are going

User creates a trip:

- origin
- one or more campsites
- arrival/departure times or nights stayed at each campsite
- optional return destination
- equipment profile, for example tent / camper / trailer / no trailer

Teskeið calculates:

- driving route for every leg
- route weather for every leg
- campsite weather at arrival
- campsite weather during the planned stay
- return route and return weather if applicable
- warnings if the plan has worsened since last check

### B. User wants suggestions

User provides constraints:

- start location
- possible dates
- max driving time
- number of nights
- equipment profile
- weather preferences or thresholds
- optional region preferences

System ranks campsites or multi-stop trip options using deterministic scoring:

- best weather at campsite
- best weather over the stay
- best route/weather combination
- best return window
- shortest acceptable drive
- least risky worst point

This can feel like "prompting the system", but in Phase 1 it should be structured filters and deterministic scoring, not LLM interpretation.

## Multi-Stop Trip Model

This must support more than:

`home -> campsite -> home`

It must support:

`home -> campsite A -> campsite B -> campsite C -> home`

Each trip has:

- ordered stops
- a route leg between each stop
- planned arrival/departure for each stop
- one or more forecast windows for each stay
- optional return leg

Suggested conceptual entities:

- `Trip`
- `TripStop`
- `TripLeg`
- `StayWeatherAssessment`
- `RouteWeatherAssessment`
- `TripAssessmentSnapshot`

Important scoring rule:

- The trip score should not be a simple average.
- A single bad leg or bad night can ruin the trip.
- Overall status should heavily weight the worst leg and worst campsite stay.

Example:

- Leg 1 is good.
- Stay A is good.
- Leg 2 is uncomfortable.
- Stay B is dangerous due to wind/rain.
- Overall trip must be flagged, even if other pieces look good.

## Saved / Living Trip Concept

This is one of the strongest logged-in user values.

User saves a trip, then later opens it again and sees:

- latest route weather per leg
- latest campsite weather per stay
- whether conditions improved or worsened since last calculation
- whether the original plan is still good
- whether a different departure time is better
- whether a different next campsite is better
- whether return timing has changed

Possible status copy:

- `Óbreytt plan lítur vel út`
- `Veðrið hefur versnað á öðrum legg`
- `Betra gæti verið að leggja fyrr af stað`
- `Seinni nóttin lítur verr út en síðast`
- `Heimferðarglugginn hefur færst`

No AI needed: compare last assessment snapshot to current assessment snapshot.

## MVP Recommendation

Start with the smallest version that proves product value and reuses existing weather code.

### MVP 1 - Build my camping trip

User manually creates a multi-stop trip:

1. Pick origin.
2. Add campsite stop.
3. Add date/time and nights/stay length.
4. Add optional more campsite stops.
5. Add optional return.
6. Calculate.

Output:

- timeline of legs and stays
- route weather per leg
- campsite weather per stay
- overall trip status
- worst issue clearly called out
- save trip for logged-in users

This avoids the combinatorial complexity of automatically ranking all campsites on day one.

### MVP 2 - Re-open and re-check saved trip

Logged-in user opens saved trip:

- app recomputes current assessment
- app shows difference from last saved snapshot
- app suggests deterministic changes such as:
  - earlier/later departure window
  - skip a stop if it now looks bad
  - stay longer/shorter only if the data clearly supports it

### MVP 3 - Find me a campsite

Structured search:

- max drive time
- date range
- number of nights
- equipment profile
- region optional

System evaluates a curated shortlist of campsites and ranks them.

Important: avoid calling Google/Met.no for every campsite blindly. Use a staged ranking/caching strategy.

### Later - AI interpretation

Only after deterministic scoring is stable:

- AI can summarize why a plan looks good/bad.
- AI can help phrase tradeoffs.
- AI can turn structured user intent into filters.

AI must not be the source of safety decisions.

## Data Sources

### Campsites

Need a curated campsite dataset:

- name
- lat/lon
- address/area
- region
- opening season if known
- facilities later, optional
- source/verification status

First phase should probably use a static curated file or admin-managed rows, not scrape/live integrate.

Potential storage options:

- `lib/camping/campsites.ts` static list for early prototype
- later `public.campsites` table with admin management

### Routes

Reuse existing Ferðaveðrið route work:

- Google route options
- route sampling
- route weather assessment
- route labels
- route selection UI patterns

Relevant existing files to inspect:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `app/auth-mvp/vedrid/VedridClient.tsx`
- `app/vedrid/page.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/ForecastDrawer.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `lib/weather/travel.ts`
- `lib/weather/routeSampling.ts`
- `lib/weather/forecast.ts`
- `lib/weather/metno.server.ts`
- `lib/weather/google.server.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`

### Forecast

Reuse existing Met.no forecast integration and threshold logic:

- `lib/weather/thresholds.ts`
- `lib/weather/metno.server.ts`
- `lib/weather/forecast.ts`

Need explicit caution copy similar to Ferðaveðrið:

> Athugaðu sérstaklega hviður og færð á vef Vegagerðarinnar. Þetta mat byggir á almennum spágögnum og kemur ekki í stað opinberra upplýsinga.

May need campsite-specific version.

## Architecture Concerns

### Avoid copying Ferðaveðrið into a fork

Do not duplicate the whole weather flow into a new product.

Preferred direction:

- extract reusable domain functions for:
  - route leg assessment
  - point/stay forecast assessment
  - threshold evaluation
  - summary formatting inputs
- build Tjaldferð on top of those functions
- keep UI separate where the workflow differs

### API cost and request volume

Automatic campsite suggestions can explode in API calls.

Example:

- 100 campsites
- 3 route options each
- multiple departure windows
- multi-stop combinations

This must be staged:

1. Filter by geography and max drive time using cheap local distance estimate.
2. Evaluate only a small shortlist with Google routes.
3. Cache route/weather results where safe.
4. Rate limit guest use.
5. Require login for heavier multi-stop/saved/suggestion workflows.

### Public vs logged-in

Potential split:

- Public users can preview/calculate a simple one-trip assessment with stricter limits.
- Logged-in users can save trips, re-open, compare snapshots, and use heavier suggestion mode.

This aligns with current direction: reduce login friction, but give real value for login.

### Privacy / RLS

Saved trips may include personal origins, future travel plans, and preferences.

If persisted in Supabase:

- all trip tables must include `user_id`
- RLS must enforce `user_id = auth.uid()`
- no anonymous access to saved trips
- service-role only where required
- do not store raw provider payloads unnecessarily
- do not leak place IDs or addresses across users

Possible tables later:

- `camping_trips`
- `camping_trip_stops`
- `camping_trip_assessment_snapshots`

But do not write SQL until data model is reviewed.

## Suggested UX Shape

### Trip Builder

Mobile-first vertical flow:

1. `Hvaðan leggurðu af stað?`
2. `Bæta við tjaldsvæði`
3. `Hvenær kemurðu?`
4. `Hve lengi gistirðu?`
5. `Bæta við næsta stað`
6. `Reikna ferð`

Controls:

- place search for origin and campsite
- date/time picker
- stepper or segmented control for nights
- equipment segmented control
- primary button with loader overlay when routes/forecast are fetched

### Trip Result

Structured timeline:

- `Leggur 1`
  - route, drive time, route weather status
- `Dvöl á [tjaldsvæði]`
  - overnight/day weather status
- `Leggur 2`
  - same
- `Heimferð`
  - same if present

Top summary:

- overall status
- worst issue
- best next action
- last calculated timestamp

Avoid huge card stacks. Prefer structured rows and collapsible details.

### Saved Trip Recheck

When user opens saved trip:

- show `Síðast reiknað` and `Núna`
- show changed status markers
- call out worsened/improved segments
- show “Reikna aftur” if not auto-refreshed

## Deterministic Scoring Draft

Use existing weather thresholds first.

For each route leg:

- evaluate route points based on estimated time at point
- status: good / uncomfortable / dangerous / insufficient data
- store worst point and why

For each campsite stay:

- evaluate arrival weather
- evaluate overnight/stay window
- aggregate:
  - max wind
  - total/peak precipitation
  - min/max temperature
  - worst hourly status

Overall trip:

- worst route leg status
- worst stay status
- return status if present
- tie-break by route duration and amount of bad weather

Do not average away bad weather.

## Open Product Questions For Stebbi

1. Should the first shipped concept be called `Tjaldferð` or `Tjaldveðrið`?
2. Is the first MVP manual trip creation, or automatic "where should I go?" search?
3. Should public users be allowed to calculate simple campsite trips?
4. Should saving trips require login from day one?
5. Which camping equipment profiles matter first?
   - tent
   - camper van
   - trailer
   - no special equipment
6. Do we need official campsite opening/season data before launch, or can the first list be “best effort”?
7. Should "multiple campsites" be in MVP 1 or immediately after one-stop MVP?

Codex recommendation:

- Multi-stop should be in the data model from day one.
- UI can still ship with one stop first if needed, but avoid a data model that assumes only out-and-back trips.

## Questions For Claude Code

Please review the existing weather code and answer:

1. Which Ferðaveðrið functions can be reused directly for campsite trips?
2. Which functions are too UI-coupled and should be extracted?
3. What minimal campsite data shape is needed?
4. What API endpoints would be needed for:
   - manual multi-stop trip assessment
   - saved trip recheck
   - campsite suggestion search
5. What is the safest data model with RLS for saved trips?
6. What request-volume limits/caching are needed before suggestion mode?
7. What should be Phase 1, Phase 2, Phase 3?
8. What can be implemented without SQL first?

## Suggested Phase Plan

### Phase 0 - Technical discovery

No product UI yet.

- inspect weather domain functions
- propose reusable assessment API shape
- propose campsite data shape
- estimate API cost risk
- propose persisted trip model
- return handoff for Codex review

### Phase 1 - Static campsite list + manual one/multi-stop trip calculation

- curated campsite list in code
- manual trip builder
- route/weather calculations
- no saved trips initially, unless SQL is approved
- public or auth-gated TBD

### Phase 2 - Saved trips and recheck

- Supabase tables with strict RLS
- saved itinerary
- current vs previous snapshot
- login value

### Phase 3 - Suggestion mode

- shortlist and rank campsites
- max drive time
- date window
- deterministic scoring
- caching/rate limits

### Phase 4 - AI copy layer

- explain results
- summarize tradeoffs
- never decide safety

## Localhost checks for Stebbi

For this first discovery handoff, there is nothing new to test on localhost yet.

When Claude Code returns the technical discovery, Stebbi should be able to review:

1. Proposed user flow on mobile.
2. Proposed phase split.
3. Which existing Ferðaveðrið screens/components would be reused.
4. Which data would be stored for logged-in users.
5. Whether multi-stop trips are supported from the start.
6. Whether the plan avoids AI in Phase 1.

When an actual prototype exists later, localhost checks should include:

- mobile viewport 360/390/460 px
- keyboard open/closed for place search and date/time fields
- one campsite trip
- two campsite trip
- saved trip reopen/recalculate
- no horizontal overflow
- route/forecast loader visible while calculating
- logged-out vs logged-in behavior

## Risks / Things To Avoid

- Building a separate copied weather engine for camping.
- Calling Google/Met.no too many times in suggestion mode.
- Scoring by average and hiding one dangerous leg.
- Making AI sound like the decision-maker.
- Saving private future travel data without strict RLS.
- Launching with a campsite dataset whose source/accuracy is unclear.
- UI becoming a big dashboard instead of a mobile-first trip tool.
- Forgetting loader/pending state for route/forecast calculations.

## Codex Recommendation

Do Phase 0 next:

Ask Claude Code to inspect current Ferðaveðrið architecture and return a technical discovery handoff. The output should not implement anything yet. It should identify reusable code, missing abstractions, data-model options, and a realistic MVP path for deterministic multi-stop campsite trip planning.

