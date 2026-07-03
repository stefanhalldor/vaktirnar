# TODO #67 Vedrid - Codex review of v022 with Stebbi decisions

Created: 2026-07-03 13:58
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Review / planning handoff. No code, SQL, env, Supabase, commit, push, deploy, or production changes made.

## Stebbi's decisions recorded

Stebbi answered v022 as:

1. Phase 1 and Phase 2 ship together.
2. Golf and route move together.
3. Mapbox ToS needs more research first.
4. Stebbi will set up Mapbox account/token before the route checkpoint begins.
5. Golf and route use the same `WEATHER_AI_ENABLED` rules as grill: deterministic first, AI wording only when enabled, deterministic fallback always.

Important workflow note: these are product/planning decisions, not execution permission. Claude Code still needs explicit, scoped execution permission before code, SQL, env, commit, push, deploy, or production work.

## Findings

1. **Major: Mapbox geocoding cache cannot be treated as "likely okay" without ToS confirmation.**  
   v022 lines 85-104 discusses storing geocoded lat/lon in Supabase and says option A is likely okay because the app is storing coordinates. That is too loose. Official Mapbox Geocoding docs distinguish Temporary and Permanent results: temporary results are not cacheable; permanent results can be stored indefinitely only when using the permanent mode, which also requires a valid credit card or enterprise contract. Treat Mapbox-returned coordinates as geocoding results unless Mapbox terms explicitly say otherwise. Until the ToS review is resolved, do not persist Mapbox geocoded results in Supabase. Static `places.ts` coordinates are fine because they are Teskeid-owned/local data.

2. **Major: Directions API user disclosure is missing from the route acceptance criteria.**  
   v022 lines 193-224 covers route provider code and route weather, but it does not include Mapbox's Directions API driving disclaimer requirement. Official Mapbox Terms say apps/services using Directions API for end users must disclose the driving-directions policy. Route weather answers also need Teskeid's own caveat: this is a weather assessment, not road conditions, legal safety advice, or a replacement for road signs/fard/weather authority guidance. This should be in `messages/is.json` / `messages/en.json`, not hardcoded.

3. **Major: "Golf + route together" plus "Mapbox ToS first" requires a new execution slice.**  
   v022's named scopes are framed around golf-only checkpoint 1 and route checkpoint 2 (lines 145-244). Stebbi chose golf + route together, but also said Mapbox ToS must be researched before route work. Claude Code should revise the plan into reviewable slices that still ship together:
   - Phase 2A0: read-only Mapbox ToS/cache/disclaimer review, no code.
   - Phase 2A1: shared weather intent/result architecture + golf evaluator + route parser skeleton/provider-unavailable behavior, no Mapbox geocoding cache.
   - Phase 2A2: Mapbox provider adapter and route evaluator after ToS decision and local token setup.
   - Phase 2A3: combined pre-release for Phase 1 + Phase 2, with localhost checks across grill/golf/route.

4. **Medium: Phase 1+2 ship together increases regression risk and needs explicit test matrix.**  
   v022 lines 26-56 correctly notes Phase 1 is uncommitted, untested locally, and undeployed. Since Stebbi chose one combined ship, the eventual pre-release handoff must test grill, golf, route, feature gating, `WEATHER_AI_ENABLED=true/false`, AI failure fallback, missing Mapbox token, provider failure, and met.no cache behavior together. Do not let "ship together" mean "test route and assume grill still works."

5. **Medium: AI wording for golf/route should be allowed, but only with strict deterministic facts contract.**  
   v022 lines 127-139 and 265 set the right high-level rule. The implementation plan should require that AI receives only normalized deterministic result facts and cannot change status color, thresholds, best-slot ranking, route-safety status, sampled-point count, or latest-departure time. Invalid AI output must fall back to deterministic wording exactly like grill.

6. **Medium: route sampling config is plausible, but v022 should avoid overstating unverified model-resolution claims.**  
   v022 lines 247-255 argues for 3-5 km spacing partly from met.no model resolution. 3-5 km with an 80-point cap is a reasonable MVP, especially for short Icelandic trailer routes, but the plan should state this as a conservative product/config choice unless Claude Code verifies the exact forecast model resolution from official met.no docs. Keep it configurable and dedupe by weather cache cell.

## Mapbox ToS research baseline

Based on official docs checked during this review:

- Mapbox Geocoding API docs: Temporary geocoding is the default and temporary results may not be cached; Permanent geocoding requires `permanent=true` and a valid credit card or enterprise contract. Source: https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results
- Mapbox Directions API docs confirm route geometry/directions are the relevant API surface. Source: https://docs.mapbox.com/api/navigation/directions/
- Mapbox Terms include driving-directions warnings and require disclosure when Directions API/Optimized Trips API are used for end-user apps/services. Source: https://www.mapbox.com/legal/tos

This is not legal advice. Before persistent Mapbox geocoding cache is implemented, Claude Code should produce a short ToS-specific handoff that answers:

- Are Mapbox geocoded coordinates stored in Supabase considered stored geocoding results?
- Can Teskeid use `permanent=true` for this use case without showing a Mapbox map?
- What billing/account setting is required for `permanent=true`?
- What attribution/disclaimer text is required for Geocoding and Directions in a weather-only app?
- Are route geometries allowed to be cached, and if yes, under what constraints?

Until then, route implementation should either:

- use local `places.ts` coordinates only, or
- call Mapbox live without persistent geocoding result storage, accepting the cost/latency for unknown places, or
- block the Mapbox-dependent route checkpoint until the ToS decision is made.

## Recommended revised direction

Codex approves the product direction with the blockers above:

- Phase 1 and Phase 2 can ship together.
- Golf and route should be built as one product direction, not separate futures.
- Execution should still be split into small review checkpoints.
- Mapbox ToS review must happen before persistent geocoding cache or route-geometry cache.
- Stebbi sets `MAPBOX_SECRET_TOKEN` locally before route-provider testing begins.
- AI wording follows grill rules, but deterministic tools remain the only source of truth.

## Localhost checks for Stebbi

This review file itself has no localhost checks because it changes no app code.

For the eventual combined Phase 1+2 pre-release, Stebbi should test:

1. Grill regression:
   - Ask `Er grillvedur i Moso i kvold?`
   - Expected: local alias resolution works, grill answer still follows Phase 1 rules.
2. Golf:
   - Ask `Hvenaer er best ad spila 18 holur i Grafarholti a morgun?`
   - Expected: best window plus alternatives, deterministic reasons, no raw forecast dump.
3. Route basic:
   - Ask `Er mer ohaett ad keyra med hjolhysi fra Reykjavik ad Apavatni i dag?`
   - Expected: route-backed sampled-point answer if Mapbox is configured; otherwise clear provider-not-configured answer.
4. Latest departure:
   - Ask `Hvenaer get eg lagt af stad i sidasta lagi med hysid fra Reykjavik ad Apavatni?`
   - Expected: uses travel time to sampled points, not endpoint-only weather.
5. Feature flags:
   - `WEATHER_AI_ENABLED=false`: deterministic answers for grill/golf/route.
   - `WEATHER_AI_ENABLED=true`: AI wording only, deterministic status/facts unchanged.
   - AI failure/invalid output: deterministic fallback.
6. Provider failures:
   - Missing/invalid `MAPBOX_SECRET_TOKEN`: clear route-provider unavailable answer.
   - Unknown/nonsense places: clear place-not-found/unsupported answer, no fake route.
7. Mobile:
   - Test at 360, 390, and 460 px.
   - Inputs must remain 16 px or larger; no mobile zoom, horizontal overflow, overlap, or dead navigation.
8. Safety/privacy:
   - Do not run high-volume route loops against production billing.
   - Do not expose Mapbox token in browser payloads.
   - Do not persist Mapbox geocoding results until the ToS decision is explicit.

## Suggested message to Claude Code

Stebbi answered v022:

- Phase 1 and Phase 2 should ship together.
- Golf + route should move together.
- Mapbox ToS needs more research before route/cache implementation.
- Stebbi will set up the Mapbox token before the route checkpoint begins.
- Golf/route should follow the same `WEATHER_AI_ENABLED` rules as grill.

Codex review: do not treat those answers as execution permission. Please revise v022 before implementation:

- Add Phase 2A0 read-only Mapbox ToS/cache/disclaimer review.
- Do not persist Mapbox geocoded results unless ToS confirms the exact allowed mode; temporary geocoding results are not cacheable according to Mapbox docs.
- Add required Directions API/user safety disclosure to route answer acceptance criteria and messages.
- Keep Phase 1+2 as one release target, but split implementation into reviewable checkpoints.
- Keep deterministic tools as source of truth; AI wording may only phrase validated deterministic facts.
- Include full combined localhost test matrix for grill, golf, route, flags, AI fallback, Mapbox missing/failure, and mobile.

No code, SQL, env, commit, push, deploy, or production changes should happen until Stebbi gives explicit scoped execution permission.
