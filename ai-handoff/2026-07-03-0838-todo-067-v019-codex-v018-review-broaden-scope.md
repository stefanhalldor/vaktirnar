# TODO #67 Vedrid - Codex v019 review of v018 and broadened Phase 2 direction

Created: 2026-07-03 08:38  
From: Codex  
To: Stebbi and Claude Code  
Status: Review / planning handoff. No code, SQL, env, Supabase, or deployment changes made.

## Verdict

Do not approve `2026-07-03-0830-todo-067-v018-claude-phase2a-plan.md` for execution as written.

v018 is too narrow. It effectively implements one curated route, `Reykjavik -> Apavatn`, and explicitly says no routing provider, no geocoding, and no arbitrary routes. Stebbi has now clarified that the feature should be able to evaluate routes generally, not only one hand-picked route.

This means we are moving back toward the product direction in `2026-07-03-0000-todo-067-v001-codex-vedrid-ai-first-handoff.md`: AI-worded weather decisions backed by deterministic tools, with route weather only when real route geometry exists, and golf included as a first-class activity.

## Findings

1. **Major: v018 solves the wrong route problem.**  
   v018 asks whether `Reykjavik -> Apavatn` is enough and proposes curated sample points for only that route. See v018 lines 43-67 and 81-113. Stebbi's direction is now explicit: the feature must be able to inspect all routes in principle. A curated one-route table would create a product dead end and a misleading mental model.

2. **Major: arbitrary route support requires a provider decision before implementation.**  
   v018 explicitly excludes routing provider APIs, geocoding, and arbitrary routes. That conflicts with v001, which says `routeWeather(from, to, options)` needs a directions/polyline provider and must not fake route safety with endpoint-only weather. Before Claude implements general route sampling, Claude should produce a short read-only provider-selection handoff comparing viable routing/geocoding options, costs, terms, caching, privacy, and Iceland support.

3. **Major: do not fake "all routes" with destination weather or a growing manual table.**  
   If a route geometry cannot be obtained, the app should return a clear unsupported/provider-unavailable answer. It must not silently use only the destination, only endpoints, or a partial curated approximation while sounding like it inspected the route.

4. **Medium: golf needs to come back into the plan.**  
   v001 includes `activity_window` / `golfPlayable(hours)` and acceptance examples for golf in Grafarholt. Stebbi asked whether we are going all the way with v001; yes, the next plan should include golf as a first-class activity path, not leave it as a forgotten later idea.

5. **Medium: split the work into checkpoints without changing the product goal.**  
   The product goal can be broad, but the implementation should still be sliced. Claude should not create one huge unreviewable PR that adds routing providers, geocoding, golf windows, trailer rules, AI changes, and UI changes all at once.

## Updated Product Direction

Stebbi's clarified direction:

- We are not building a one-off `Reykjavik -> Apavatn` feature.
- We are building toward v001: a practical AI-first weather assistant that answers action questions.
- Deterministic tools remain the source of truth.
- AI may classify, select the correct tool, and word the answer, but must not invent weather facts, thresholds, or safety conclusions.
- Route questions should inspect the actual route between origin and destination when supported.
- Golf should be treated as part of the core concept, not as a separate forgotten future feature.
- Per-user feature gate remains the standard rollout pattern.
- AI answer layer stays behind its own flag for cost/quality control.

## Replacement Plan For Claude

### Phase 2A0 - Read-only provider selection

Before route implementation, Claude should create a provider-selection handoff. No code changes in this step.

Evaluate at least:

- routing / directions provider options that can return route geometry or waypoints for Icelandic driving routes
- geocoding / place resolution options for Icelandic place names
- whether one provider can cover both directions and geocoding
- free tier and likely cost
- terms of use, especially caching route geometry and displaying attribution
- privacy implications of sending origin/destination strings
- rate limits and failure modes
- whether provider requires a secret, server-only calls, or billing setup
- how this interacts with the existing Supabase weather cache

Acceptance for this phase:

- Claude does not add API keys, dependencies, env vars, or provider code.
- Claude recommends one provider path and one fallback path.
- Claude states what Stebbi must approve before implementation.
- Claude explains what happens when route lookup fails.

### Phase 2A1 - Intent and tool architecture update

After provider direction is approved, update the plan around these intents:

- `place_weather_decision`: existing grill/simple place questions.
- `activity_window_golf`: golf questions such as "Er betra ad spila golf i Grafarholti kl. 10 eda 14?" and "Hvenaer er best ad spila 18 holur i Grafarholti a morgun?"
- `route_towable_trailer`: route questions with trailer categories like `tjaldvagn`, `fellihysi`, `hjolhysi`, and `hestakerra`.
- `unsupported`: clear and helpful answer when the app cannot yet support the question.

The parser can be deterministic first, AI-assisted later, but output must be validated before any tool runs. AI cannot call arbitrary tools with unvalidated slots.

### Phase 2A2 - Golf activity window

Golf can be implemented before full arbitrary routing because it only needs a place and a time window, not route geometry.

Suggested deterministic behavior:

- Use existing forecast tooling and cache.
- Resolve known golf places initially, for example `Grafarholt` -> `Grafarholtsvollur`.
- Evaluate 4.5 hour windows for 18 holes.
- Use v001 threshold direction:
  - 10-11 m/s is not automatically red for Icelandic golf.
  - discomfort around 13 m/s.
  - hard/red around 17 m/s.
- Consider precipitation and temperature as secondary reasons.
- Return one practical recommendation, with facts behind "Af hverju?"

Important: keep thresholds in one deterministic constants location. Do not put an independent threshold table into the AI prompt as a second source of truth.

### Phase 2A3 - General route weather

Only after provider approval:

- Parse origin and destination from Icelandic route questions.
- Resolve origin and destination through approved geocoding/place resolution.
- Fetch actual route geometry from approved provider.
- Sample points along the route at a defined interval, plus endpoints.
- Fetch met.no forecast for sampled points using existing cache strategy.
- Aggregate worst-case weather across route samples.
- Return a cautious action answer that discloses the basis, for example:
  - "Skodadi X punkta a leidinni..."
  - "Versti punkturinn var..."
  - "Thetta er vedurmat, ekki umferdar- eda faerdartrygging."

Do not:

- answer arbitrary routes from destination-only weather
- answer arbitrary routes from only origin and destination
- pretend a manually curated point list covers "all routes"
- promise safety
- add paid provider secrets without Stebbi approval

## Suggested Sequencing

Best next step:

1. Claude writes **v020 provider-selection handoff** for arbitrary route support, read-only.
2. Codex reviews provider-selection handoff.
3. Stebbi chooses provider path.
4. Claude implements the next execution slice:
   - either golf first, because it is provider-light, or
   - route foundation if provider is approved and Stebbi wants that first.

My recommendation: do provider-selection first, then implement golf while route-provider setup is being approved if route provider work needs billing/API-key decisions. That keeps momentum without pretending route weather is solved.

## What To Send Back To Claude

Stebbi can send Claude this instruction:

> v018 is superseded. Do not implement the curated Reykjavik -> Apavatn route table. The product direction is arbitrary route support, aligned with v001. Create a read-only provider-selection handoff for routing/geocoding first, and include golf as a first-class `activity_window_golf` path. Route weather must use real route geometry when supported; if route geometry is unavailable, return unsupported/provider-unavailable rather than endpoint-only weather.

## Localhost checks for Stebbi

No localhost checks apply to this review file itself because it changes no code.

For the eventual implementation, Stebbi should test these before any release:

1. Existing grill regression:
   - Open `/hugmyndir/vedrid` or the final Vedrid route.
   - Ask: `Er grillvedur i Moso i kvold?`
   - Expected: still works, still resolves Moso/Mosfellsbaer, and AI fallback behavior is unchanged.

2. Golf activity window:
   - Ask: `Hvenaer er best ad spila 18 holur i Grafarholti a morgun?`
   - Expected: one practical time-window recommendation, not a raw forecast table.
   - "Af hverju?" should show wind/precipitation/temperature facts and the 4.5 hour assumption.
   - 10-11 m/s wind should not automatically be red.

3. Route sampling, supported route:
   - Ask: `Er mer ohaett ad keyra med hjolhysi fra Reykjavik ad Apavatni i dag?`
   - Expected: answer says it inspected multiple sampled route points and names the worst point or reason.
   - Expected: answer does not sound like it only checked Apavatn.

4. Route sampling, another route:
   - Ask a different route, for example `Er mer ohaett ad keyra med fellihysi fra Selfossi til Reykjavikur i dag?`
   - Expected: either real provider-backed route sampling, or a clear unsupported/provider-unavailable answer.
   - Not acceptable: destination-only answer that sounds like full route analysis.

5. Unknown or impossible route:
   - Ask a nonsense route.
   - Expected: clear "eg get ekki metid thessa leid" style response, no hallucinated route points.

6. Feature flags:
   - With Vedrid disabled globally: route is hidden or gated.
   - With per-user gate enabled: only allowed users can use it.
   - With AI disabled: deterministic answer still works.
   - With AI enabled but failing/invalid: deterministic fallback is shown.

7. Do not casually test against production provider billing, production secrets, or high-volume AI loops without explicit approval.

## Open Questions For Stebbi

1. Should Claude prioritize provider-selection first and golf implementation second, or provider-selection first and route implementation second?
2. Is "all routes" limited to Icelandic driving routes for now?
3. Is it acceptable that arbitrary route support depends on provider availability and may return unsupported if the provider cannot route it?

