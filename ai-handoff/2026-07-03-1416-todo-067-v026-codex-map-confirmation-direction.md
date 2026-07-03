# TODO #67 Vedrid - Map confirmation as route confidence layer

Created: 2026-07-03 14:16
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Product/technical planning handoff. No code, SQL, env, Supabase, commit, push, deploy, or production changes made.

## Stebbi decision / direction

Stebbi wants to move soon toward letting the user confirm on a map which place is meant.

This is the right direction. The map should not be decorative. It should solve a real problem:

- Iceland has repeated street/place names, e.g. many "Sudurgata" locations.
- Human place input is ambiguous.
- Route/weather decisions with trailers feel higher stakes.
- Seeing `from` and `to` visually gives the user comfort that Teskeid understood correctly.

## Recommendation

Add **map confirmation** as a near-term route checkpoint, not as a far-future polish item.

The product flow should be:

1. User asks a route question.
2. Teskeid extracts `from`, `to`, trailer kind, time intent.
3. Teskeid resolves places through `places.ts` first.
4. If a place is ambiguous or provider-derived, show a confirmation step before final answer.
5. User confirms or changes the endpoint(s).
6. Teskeid fetches route geometry and weather samples.
7. Answer includes weather result plus a compact note of what route/endpoints were evaluated.

## UX shape

For ambiguous input:

```text
Eg fann fleiri en eina Sudurgotu. Hver þeirra a thetta ad vera?
```

Show 2-5 candidates, each with:

- display name;
- municipality/area;
- small map preview or map with candidate pin;
- "Velja" action.

After both endpoints are known, show:

```text
Fra: Sudurgata, Reykjavik
Til: Apavatn
```

Then show a compact map with:

- A pin;
- B pin;
- route line if route geometry is already available;
- "Thetta er rett" primary action;
- "Breyta" secondary action.

Only after confirmation should Teskeid present a route-weather conclusion for ambiguous/provider-derived locations.

## MVP scope proposal

Do not start with a full map editor.

Recommended first map checkpoint:

- route endpoint confirmation UI;
- Mapbox map preview with A/B pins;
- candidate list for ambiguous geocoding results;
- no global persistence of Mapbox geocoding results;
- no saved personal places yet;
- route answer uses confirmed endpoints for this request only.

Later:

- "Pikkaðu a kortid" manual pin selection;
- "Vista sem minn stadur" user-owned saved places;
- admin-reviewed unknown-place suggestions.

Saved places need a separate SQL/RLS/privacy plan. They should not be slipped into Phase 2 as incidental state.

## Technical boundaries

Use two different token concepts:

- `MAPBOX_SECRET_TOKEN`: server-only for Directions/Geocoding. Never exposed to browser.
- Public Mapbox token for map rendering, likely `NEXT_PUBLIC_MAPBOX_TOKEN`, restricted in Mapbox settings by domain where possible.

If a public token is added, that is an env/config change and needs explicit Stebbi approval before execution.

Prefer server-side geocoding for route resolution:

- client sends normalized place strings / selected candidate ids;
- server calls Mapbox geocoding/directions when needed;
- client receives only the safe candidate/route preview data it needs;
- do not send the secret token to client;
- do not persist temporary geocoding results.

Map rendering can be client-side because Mapbox browser maps require a public token. That is normal, but it must be treated separately from the secret token.

## ToS/storage implications

Map confirmation improves UX but does not erase Mapbox storage rules.

If user chooses a Mapbox geocoding candidate:

- using it for the current request/session is compatible with the "temporary" model;
- storing it globally in Supabase or `places.ts` is still storing a Mapbox geocoding result unless permanent geocoding terms allow it.

If user manually pins a coordinate on a map:

- it is closer to user-provided input than geocoding output;
- still do not persist it globally in MVP;
- if saved personal places are added later, review Mapbox/map data terms and privacy first.

Relevant docs already discussed:

- Mapbox geocoding storage: https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results
- Mapbox attribution: https://docs.mapbox.com/help/dive-deeper/attribution/

## Design.md implications

This is UI/navigation work, so Claude Code must follow `Design.md`.

Important constraints:

- Mobile-first at 360, 390, and 460 px.
- Map preview must not cause horizontal overflow.
- Input text remains at least 16 px on mobile.
- Confirmation action must be reachable without awkward zoom/scroll.
- Map attribution must be legible and not hidden.
- Route transition / provider lookup must show pending/loading state.
- Do not build a marketing-style map page. This stays inside the practical Teskeid app flow.

## Product rule

For route weather:

- If endpoints are unambiguous local `places.ts` entries, confirmation can be lightweight.
- If either endpoint is ambiguous, provider-derived, or low-confidence, require confirmation.
- If user does not confirm, do not produce a route-weather safety answer.
- Never silently pick among ambiguous places like repeated street names.

## Suggested revised phase slices

### Phase 2A1

Golf + route parser skeleton can proceed without map rendering if needed, but route answers should still return "needs place confirmation" rather than guessing.

### Phase 2A2

Mapbox provider adapter and map confirmation:

- server geocoding candidates;
- route geometry fetch;
- route preview data;
- client map confirmation UI;
- no persistent geocoding cache.

### Phase 2A3

Route weather evaluation after endpoint confirmation:

- sample route;
- fetch cached met.no points;
- deterministic trailer evaluation;
- AI wording only from deterministic facts when `WEATHER_AI_ENABLED=true`.

### Later

Saved personal places / unknown-place suggestions:

- separate SQL/RLS/privacy/security plan;
- manual review/promotion rules;
- no full question logging.

## Localhost checks for Stebbi

This planning file has no localhost checks because it changes no app code.

For implementation, Stebbi should test:

1. Ambiguous street:
   - Ask a route with `Sudurgata` and another endpoint.
   - Expected: Teskeid asks which Sudurgata, not guess.
2. Endpoint confirmation:
   - Pick candidates for from/to.
   - Expected: map shows A/B pins and route preview before weather conclusion.
3. Correction:
   - Use `Breyta`.
   - Expected: user can change endpoint without restarting whole flow.
4. Known places:
   - Ask `Reykjavik ad Apavatni`.
   - Expected: local/known places resolve with lightweight confirmation or direct route preview.
5. Mobile:
   - Test 360, 390, 460 px.
   - Expected: no horizontal overflow, no input zoom, attribution visible, actions reachable.
6. Secrets:
   - Confirm browser never receives `MAPBOX_SECRET_TOKEN`.
   - Public token, if used, is only the map-rendering token.
7. Storage:
   - Confirm selected Mapbox candidates are not stored globally or written to `places.ts`.

## Suggested message to Claude Code

Stebbi wants map confirmation soon, not as distant polish. Please revise the Phase 2 plan so route weather includes a map-confirmation layer for ambiguous/provider-derived places.

The goal is not a decorative map. It is to show the user that `from` and `to` are correct, especially where Iceland has repeated names like Sudurgata. Do not silently choose among ambiguous places.

Keep storage rules intact:

- `places.ts` first.
- Mapbox candidates may be used for the current request.
- Do not persist Mapbox temporary geocoding results in Supabase or `places.ts`.
- Use a public Mapbox token only for browser map rendering; keep `MAPBOX_SECRET_TOKEN` server-only.

Please include mobile-first UI constraints from `Design.md`, Mapbox attribution, loading/pending states, and localhost checks for ambiguous endpoint confirmation.
