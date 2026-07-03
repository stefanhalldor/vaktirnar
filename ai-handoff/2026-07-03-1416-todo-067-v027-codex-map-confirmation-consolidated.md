# TODO #67 Vedrid - Consolidated map confirmation plan replacing v025/v026

Created: 2026-07-03 14:16
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Consolidated planning handoff. This replaces v025 and v026 as the current Codex direction. No code, SQL, env, Supabase, commit, push, deploy, or production changes made.

## What this replaces

Use this v027 instead of sending both:

- `2026-07-03-1412-todo-067-v025-codex-v024-review-places-growth.md`
- `2026-07-03-1416-todo-067-v026-codex-map-confirmation-direction.md`

v025 and v026 are still historical context, but v027 is the single copy/paste handoff for Claude Code.

## Updated product direction

Stebbi wants route/golf place confirmation on a map soon, not as distant polish.

Codex agrees. The map is not decorative. It is a trust and ambiguity layer:

- For route questions, show `fra` and `til` visually.
- For golf questions, show one map/pin for the golf course.
- Use the map to make the user comfortable that Teskeid understood the right place before it gives a route-weather or activity recommendation.
- Do not silently choose among ambiguous Icelandic names, e.g. multiple `Sudurgata` locations.

## Is this Google Maps?

Recommendation: no. Do not introduce Google Maps for this unless Stebbi explicitly changes provider direction.

The current provider direction is Mapbox. The map confirmation component should therefore be a Mapbox-powered map preview/confirmation UI, not Google Maps.

Why:

- Mapbox is already the chosen direction for route geometry and fallback geocoding.
- One provider/account/token model is simpler than Mapbox for route/geocode plus Google for map rendering.
- Google Maps would mean separate API keys, billing, terms, SDK/API choices, and a new provider review.

## Cost note

Official pricing checked 2026-07-03:

- Mapbox GL JS map loads: up to 50,000 monthly loads free, then paid per 1,000 loads. A map load happens when a Mapbox GL JS map object is initialized. Source: https://www.mapbox.com/pricing
- Mapbox Directions API: up to 100,000 monthly requests free, then paid per 1,000 requests. Source: https://www.mapbox.com/pricing
- Google Maps Dynamic Maps: pricing is separate; Google lists a 10,000 monthly free usage cap for Dynamic Maps and paid tiers after that. Source: https://developers.google.com/maps/billing-and-pricing/pricing

Implication: Mapbox map confirmation should be low/no cost at Teskeid's likely MVP volume, but it is not "free forever". Avoid mounting many maps at once. Use one reusable map panel per confirmation flow.

## Recommended map UX

### Route question

For route weather, show:

- A endpoint (`Fra`)
- B endpoint (`Til`)
- route line when route geometry is available
- `Thetta er rett` primary action
- `Breyta` secondary action

If one or both endpoints are ambiguous:

```text
Eg fann fleiri en eina Sudurgotu. Hver þeirra a thetta ad vera?
```

Show 2-5 candidates with:

- display name
- municipality/area
- one shared map preview that updates/focuses on the selected candidate, or a compact static preview if Claude Code argues that is simpler
- clear `Velja` action

Do not render 2-5 separate interactive maps at once. That is noisy on mobile and can increase map-load cost.

### Golf question

For golf, show one course confirmation:

- one pin/map for the resolved golf course
- course/place name
- `Thetta er rett` / `Breyta` when the place is ambiguous or provider-derived

No route line. No `fra/til`. Just "this is the course Teskeid is evaluating".

## Resolution rules

1. `places.ts` is still first.
2. Curated/local places can skip heavy confirmation or use lightweight confirmation.
3. Ambiguous, provider-derived, or low-confidence places require confirmation.
4. If the user does not confirm, do not produce a route-weather safety answer.
5. If a place cannot be resolved, return a friendly unknown-place answer.

For route/weather questions with hysi/kerru, be more cautious than for casual place weather:

- It is acceptable to require confirmation more often.
- Never let AI choose between ambiguous locations.
- Deterministic code must decide whether confirmation is required.

## Storage and ToS boundaries

Map confirmation does not remove Mapbox geocoding storage rules.

If a user selects a Mapbox geocoding candidate:

- use it for the current request/flow;
- do not persist it globally in Supabase;
- do not write it into `places.ts`;
- do not use it to auto-grow the global place list.

If the user manually pins a coordinate:

- treat it as user-provided input for the current request;
- do not persist it globally in MVP;
- saved personal places need a separate SQL/RLS/privacy plan.

If Teskeid later wants saved places:

- create a user-owned `saved_places` design with RLS;
- store minimal data;
- avoid storing full weather questions;
- do a fresh ToS review if coordinates originate from Mapbox geocoding.

Relevant docs:

- Mapbox geocoding storage: https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results
- Mapbox attribution: https://docs.mapbox.com/help/dive-deeper/attribution/
- Mapbox pricing: https://www.mapbox.com/pricing

## Tokens and secrets

Use two separate concepts:

- `MAPBOX_SECRET_TOKEN`: server-only. Used for geocoding/directions. Never sent to browser.
- Public map-rendering token, likely `NEXT_PUBLIC_MAPBOX_TOKEN`: browser-visible. Must be restricted in Mapbox settings where possible.

Adding a public token/env var is an env/config change and still needs explicit Stebbi approval before execution.

Client map rendering may use a public token. Server route/geocode calls must continue to use server-only calls.

## Implementation shape

Recommended first map checkpoint:

- server resolves route/golf candidates;
- client receives safe candidate data;
- client shows map confirmation;
- route flow shows A/B pins and route line when available;
- golf flow shows one course pin;
- no persistent geocoding cache;
- no saved personal places yet.

Dependency choice:

- Claude Code should inspect current dependencies first.
- If no map dependency exists, propose the smallest appropriate addition before implementing.
- `mapbox-gl` or a React wrapper may be reasonable, but this requires explicit approval because it changes dependencies.
- Do not use Google Maps component unless Stebbi explicitly changes provider decision.

## Design.md constraints

This is UI/navigation work. Claude Code must follow `Design.md`.

Important:

- Mobile-first at 360, 390, 460 px.
- No horizontal overflow.
- Inputs at least 16 px on mobile.
- Confirmation action reachable without awkward scrolling.
- Map attribution visible and legible.
- Loading/pending state while resolving candidates, route geometry, and weather.
- Do not build a marketing map page. Keep it inside the practical Vedrid flow.

## Suggested phase update

### Phase 2A1

Intent architecture, golf evaluator, route parser skeleton, and deterministic "needs confirmation" state.

### Phase 2A2

Mapbox provider adapter plus map confirmation UI:

- route candidate resolution;
- route preview with A/B pins and route line;
- golf course confirmation with one pin;
- no persistent geocoding storage.

### Phase 2A3

Route weather evaluation after confirmed endpoints:

- route sampling;
- met.no cache;
- deterministic trailer evaluation;
- AI wording only from deterministic facts when `WEATHER_AI_ENABLED=true`.

### Later

Saved personal places / unknown-place suggestions:

- separate SQL/RLS/security/privacy plan;
- manual/admin review rules;
- no full question logging.

## Localhost checks for Stebbi

This file is planning only. No localhost checks apply to v027 itself.

For implementation, Stebbi should test:

1. Route known places:
   - Ask `Er mer ohaett ad keyra med hjolhysi fra Reykjavik ad Apavatni?`
   - Expected: route confirmation shows `fra` and `til`, A/B pins, and route line before weather answer.
2. Route ambiguous place:
   - Ask a route using `Sudurgata`.
   - Expected: Teskeid asks which Sudurgata, not guess.
3. Route correction:
   - Use `Breyta`.
   - Expected: user can change endpoint without restarting the whole flow.
4. Golf:
   - Ask `Hvenaer er best ad spila golf i Grafarholti a morgun?`
   - Expected: one course map/pin, no route line or `fra/til` UI.
5. Mobile:
   - Test 360, 390, 460 px.
   - Expected: no horizontal overflow, no input zoom, map attribution visible, actions reachable.
6. Secrets:
   - Browser must never receive `MAPBOX_SECRET_TOKEN`.
   - Public token, if used, is only for map rendering.
7. Storage:
   - Selected Mapbox candidates are not stored globally or written to `places.ts`.
8. Cost sanity:
   - Map should not remount repeatedly during one confirmation flow.
   - Candidate list should not render many separate interactive maps at once.

## Copy/paste message for Claude Code

Use v027 as the current Codex direction replacing v025 and v026.

Stebbi wants map confirmation soon. For route questions, show `fra` and `til` visually with A/B pins and route line when available. For golf questions, show one map/pin for the golf course only. The map is a trust/ambiguity layer, not decoration.

Do not introduce Google Maps unless Stebbi explicitly changes provider direction. Continue with Mapbox. Official Mapbox pricing currently has a free tier for Mapbox GL JS map loads, but map loads are still metered, so use one reusable map panel per confirmation flow and avoid multiple interactive maps in candidate lists.

Keep storage/ToS boundaries:

- `places.ts` first.
- provider-derived or ambiguous places require confirmation.
- Mapbox geocoding candidates may be used for the current request/flow.
- Do not persist Mapbox temporary geocoding results in Supabase or `places.ts`.
- Saved personal places are later work with separate SQL/RLS/privacy review.
- Keep `MAPBOX_SECRET_TOKEN` server-only; use a separate public map token only for browser map rendering.

Please revise the Phase 2 plan around:

1. Phase 2A1: intent + golf evaluator + route parser + needs-confirmation state.
2. Phase 2A2: Mapbox provider adapter + map confirmation UI for route/golf.
3. Phase 2A3: route weather evaluation after confirmed endpoints.

No code, SQL, env, dependency, commit, push, deploy, or production changes should happen until Stebbi gives explicit scoped execution permission.
