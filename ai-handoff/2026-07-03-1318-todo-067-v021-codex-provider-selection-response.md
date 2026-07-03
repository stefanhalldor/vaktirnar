# TODO #67 Vedrid - Codex response to provider selection and Stebbi decisions

Created: 2026-07-03 13:18
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Review / planning response. No code, SQL, env, Supabase, commit, push, deploy, or production changes made.

## Summary

Codex agrees with Stebbi's product direction:

- Use Mapbox for route/geocoding provider work.
- Implement golf and route in the same product phase, but keep execution sliced and reviewable.
- Use native `fetch` behind the existing BFF/server-side pattern rather than adding `@mapbox/mapbox-sdk` now.
- Pre-resolve Icelandic informal names through `places.ts` before calling Mapbox.
- Do not use AI for weather scoring. AI may parse/word answers later, but deterministic tools must decide safety, ranking, and reasons.

## Provider recommendation

Approve Mapbox as the provider direction for route geometry and fallback geocoding.

Use native `fetch`, not `@mapbox/mapbox-sdk`, for the first implementation. The API surface we need is small: Directions and Geocoding. Native fetch gives Teskeid full control over server-only tokens, timeouts, retries, response validation, cache keys, error wording, and future provider swapping. An internal adapter is the future-proof part, not the SDK.

Suggested internal shape:

- `resolvePlace(input, context)`:
  - normalize text
  - check `places.ts` aliases first
  - use intent context such as golf vs route
  - call Mapbox only when local resolution is missing or ambiguous
- `getRouteGeometry(from, to, options)`:
  - call Mapbox Directions server-side
  - request full route geometry and duration/distance annotations when needed
  - return unsupported/provider-unavailable on failure
- `getForecastForPoint(lat, lon, timeWindow)`:
  - use existing met.no cache behavior
  - respect `Expires`, `Last-Modified`, and `If-Modified-Since`
  - never call met.no directly from the browser

## met.no caching direction

Stebbi's instinct is right that Iceland/Nordic forecasts are updated hourly: met.no's Locationforecast data model says Nordic forecasts are updated once every hour.

But do not prefetch "all weather in Iceland" by brute-forcing Locationforecast point requests. That would create unnecessary traffic and conflict with met.no's terms, which require caching, respecting `Expires`, avoiding repeated requests until expiry, spreading traffic rather than scheduling a request spike, and using a backend/proxy pattern.

The practical version is:

- lazy weather cache, keyed by quantized/snap-to-grid coordinates;
- route samples deduped into those cache cells;
- cache rows keep `expires_at`, `last_modified`, provider `updated_at`, and forecast payload;
- missing/expired points are fetched with low concurrency and jitter;
- all met.no calls include a proper identifying User-Agent;
- never schedule a full-Iceland refresh on the hour.

If Teskeid later needs true national precomputation, that should be a separate data-ingestion project using proper model data feeds, not Locationforecast point API fan-out.

Official docs checked:

- met.no Locationforecast data model: https://docs.api.met.no/doc/locationforecast/datamodel
- met.no Terms of Service: https://api.met.no/doc/TermsOfService
- Mapbox Directions API: https://docs.mapbox.com/api/navigation/directions/
- Mapbox Geocoding storage docs: https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results

## Route sampling

Codex agrees with Stebbi that 4-8 route points is too thin for a meaningful trailer/hysi answer.

Do not sample every raw Mapbox polyline vertex either. Polyline density reflects road shape and provider encoding, not weather-model resolution. Instead, resample by distance and dedupe by weather cache cell.

Recommended MVP:

- endpoints plus distance-based samples along the route;
- start around 5-10 km spacing for trailer/hysi routes;
- cap total samples defensively, for example 60-80 points, and state if the route was downsampled;
- keep cumulative route duration per sample for departure-time questions;
- report how many sampled points were inspected.

For a simple "er mer ohaett?" question:

- If any sampled point crosses a hard red threshold, it is enough to answer "no / ekki leggja i hann" without fetching every remaining missing point.
- If no red threshold is found, the system must have inspected all sampled points it claims to cover.
- If all relevant points are already cached, compute the actual worst point and report it.
- If the system early-exits, wording should say it found a blocking point, not that it found the worst point on the whole route.

## Latest-departure questions

For "Hvenaer get eg lagt af stad i sidasta lagi med hysid?" the deterministic tool should use route duration, not just static weather at the destination.

MVP approach:

1. Resolve route and sampled points.
2. Store cumulative travel time from origin to each sample.
3. Evaluate candidate departure times in 15-30 minute steps.
4. For each candidate, evaluate weather at `departure_time + cumulative_duration_to_sample`.
5. The latest acceptable candidate is the answer.
6. If a bad point creates the limiting constraint, explain it: "Til ad vera kominn framhja X adur en vindurinn fer yfir mark thyrftirdu ad leggja af stad um..."

This can be implemented as candidate scanning first. A more mathematical constraint solver can wait.

## Golf activity window

Golf does not need AI for scoring.

Use deterministic ranking over continuous windows:

- resolve golf place locally first, e.g. Grafarholt/Grafarholtid -> Grafarholtsvollur if that is the chosen alias;
- evaluate 4.5 hour windows for 18 holes;
- score wind first, then gust/precipitation/temperature as supporting reasons;
- return best slot plus second and third best non-overlapping slots when available;
- AI may later phrase the answer conversationally, but the score and reasons should come from deterministic facts.

This should be built together with route in product direction, but not as one huge unreviewable patch. Claude Code should split into small checkpoints: shared intent/tool architecture, golf evaluator, Mapbox provider adapter, route evaluator.

## Informal Icelandic names

Yes: pre-resolve human Icelandic names before Mapbox.

`places.ts` should be the first stop for common names, nicknames, spelling variants, and product-specific places:

- Moso / Moso variants -> Mosfellsbaer or exact local coords
- Rvk / Reykjavik variants -> Reykjavik
- Grafarholtid in golf context -> likely Grafarholtsvollur
- Grafarholt in route context -> neighborhood/area

Mapbox should be called only if local resolution fails or is ambiguous. When called, constrain search to Iceland where possible and validate returned result type/confidence before using it.

## Main correction to v020

v020 is directionally good on Mapbox, but it should be tightened before execution:

1. Native fetch + internal provider adapter is preferred over `@mapbox/mapbox-sdk`.
2. Route sampling must not stay at 4-8 points. Use distance-based sampling with dedupe and caps.
3. Do not prefetch all Iceland from met.no Locationforecast. Use lazy/snap-to-grid cache and respect response headers.
4. Golf and route can move together as one product phase, but must be split into reviewable implementation checkpoints.
5. Informal Icelandic names must resolve locally before provider calls.

## Localhost checks for Stebbi

This file is planning/review only. No localhost checks apply to this file itself.

For the eventual implementation, Stebbi should test:

1. Existing grill regression:
   - Ask: `Er grillvedur i Moso i kvold?`
   - Expected: Moso still resolves locally and existing grill behavior does not regress.
2. Golf:
   - Ask: `Hvenaer er best ad spila 18 holur i Grafarholti a morgun?`
   - Expected: best slot plus useful alternatives, with wind/precipitation/temperature reasons.
3. Route:
   - Ask: `Er mer ohaett ad keyra med hjolhysi fra Reykjavik ad Apavatni i dag?`
   - Expected: answer says it inspected route samples, not just endpoint weather.
4. Latest departure:
   - Ask: `Hvenaer get eg lagt af stad i sidasta lagi med hysid fra Reykjavik ad Apavatni?`
   - Expected: answer uses travel time to the limiting bad point.
5. Unknown route:
   - Ask nonsense place names.
   - Expected: clear unsupported/place-not-found answer, no fake route weather.
6. Provider/privacy:
   - Do not test high-volume loops or production provider billing casually.
   - Do not expose Mapbox token in browser payloads.
   - Do not put met.no calls in client-side code.

## Suggested message to Claude Code

Stebbi's decision direction after v020:

- Use Mapbox for route/geocoding provider work.
- Use native server-side `fetch` behind the BFF/provider-adapter pattern, not `@mapbox/mapbox-sdk` for now.
- Pre-resolve Icelandic informal names through `places.ts` before calling Mapbox.
- Build golf and route together as the next product direction, but slice implementation into reviewable checkpoints.
- Do not prefetch all weather in Iceland from met.no Locationforecast. Use lazy snap-to-grid caching, respect `Expires`/`Last-Modified`/`If-Modified-Since`, include identifying User-Agent, and avoid request spikes.
- Route sampling must be distance-based and denser than 4-8 points, with dedupe and a defensive cap.
- Golf scoring and route safety/departure scoring must be deterministic. AI may parse/word answers later but must not invent weather facts or safety conclusions.

Please produce the next implementation plan from this direction before any code changes.
