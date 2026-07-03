# TODO #67 Vedrid - Codex review of v029 native Google direction

Created: 2026-07-03 14:59
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Review handoff. No code, SQL, env, dependency, Supabase, commit, push, deploy, or production changes made.

## Verdict

Approve the broad direction, but do not execute v029 as written.

The Google + Capacitor direction is coherent with Stebbi's app-store goal, and static map confirmation is a good MVP simplification. However, v029 has several concrete issues around Google key exposure, pricing numbers, Places session handling, and route-weather sequencing that should be corrected before implementation.

## Findings

1. **Major: Static Maps URL cannot use `GOOGLE_MAPS_SERVER_KEY` if the URL is sent to the browser.**  
   v029 lines 48-55 says the server key is used for Static Maps. Lines 152-155 say `staticMapUrl(...)` returns a URL sent to the client and that the key is never sent to the browser. That is not correct for a normal Static Maps `<img src>`. Google Static Maps URLs include a required `key` parameter, and the docs describe embedding the URL in an image tag. If the URL goes to the browser, the key in that URL is visible.  
   Correction: use a restricted browser/static maps key for Static Maps image URLs, ideally with URL signing if appropriate, or explicitly proxy the image server-side only after a separate ToS/cache/security review. Do not put the unrestricted server key in a client-visible image URL.  
   Sources: https://developers.google.com/maps/documentation/maps-static/start and https://developers.google.com/maps/api-security-best-practices

2. **Major: v029 pricing table is materially wrong or outdated.**  
   v029 lines 170-179 says Static Maps has 100,000 free requests/month, Geocoding 40,000 free requests/month, Routes ~$10/1000, and Places Autocomplete $17/1000 sessions. Current Google pricing page checked 2026-07-03 says:
   - Static Maps: 10,000 free, then $2/1000 at first paid tier.
   - Geocoding: 10,000 free, then $5/1000.
   - Routes Compute Routes Essentials: 10,000 free, then $5/1000.
   - Autocomplete Requests: 10,000 free, then $2.83/1000.
   - Places UI Kit Autocomplete Per Session: 10,000 free, then $10/1000.
   The old `$200/month free credit` framing should also be removed unless Stebbi has confirmed that billing account is under a program where that credit still applies. Google now presents product-specific free usage caps on the pricing page.  
   Source: https://developers.google.com/maps/billing-and-pricing/pricing

3. **Major: Places Autocomplete implementation is underspecified and could create unnecessary cost or weak data flow.**  
   v029 lines 157-160 and 296 mention Places Autocomplete and session billing, but do not specify which Google Places product/API is used, which fields are requested, how session tokens are created/closed, or whether a selected candidate is resolved through Place Details or Geocoding. This matters for billing, data minimization, and correctness.  
   Correction: Claude Code should pick one explicit Places path before implementation:
   - Places Library / Autocomplete in Maps JS with session token + fields limited to place id, display name/address, geometry if allowed/needed; or
   - Places API New server-side autocomplete/details flow; or
   - Places UI Kit if it materially reduces implementation risk.  
   The plan must include fields, session-token lifecycle, and what is stored in client state only.

4. **Medium: "No Google API calls" for `places.ts` locations is false if a Static Maps image is shown.**  
   v029 line 83 says no Google API calls are needed when both places are in `places.ts`, only a Static Maps image. But a Static Maps image request is itself a Google API request and billable event unless served from some separately reviewed proxy/cache.  
   Correction: say no Google geocoding/routing calls are needed; Static Maps still uses Google API and billing.

5. **Medium: Phase 2A1 route skeleton acceptance is internally inconsistent.**  
   v029 lines 185-196 say Phase 2A1 needs no Google keys, but line 190 says route intent returns `needs_place_confirmation` until a place is confirmed. If there is no Google/static map/Places UI in Phase 2A1, then "needs confirmation" must be a non-map deterministic state, not a working confirmation flow.  
   Correction: Phase 2A1 can return `provider_not_configured` / `needs_provider_confirmation_ui`, or it can render a non-map textual confirmation for curated `places.ts` entries. Full map confirmation belongs in 2A2.

6. **Medium: Google Maps Content caching/storage rules should be called out more positively, not only "not cached".**  
   v029 lines 21-22 correctly say no persistent Phase 2 geocoding storage. But Google terms now give specific caching rules: Geocoding API content may be used without a Google Map, not with a non-Google map, and lat/lon can be cached for 30 days; indefinite caching is only for the direct end-user-facing functionality of the initiating app, logically isolated to that specific end user, and not a replacement for future service calls. Routes lat/lon may be cached for 30 days. Places lat/lon may be cached for 30 days.  
   Correction: keep MVP simple with no provider-derived persistent storage, but document that future saved places are user-owned/end-user-isolated work, not a global shared place registry.  
   Source: https://cloud.google.com/maps-platform/terms/maps-service-terms

7. **Medium: App-store timeline depends on Capacitor auth/session risk more than v029 implies.**  
   v029 lines 36-42 lists Capacitor auth/cookies/deep links as later, and says weather code needs no Capacitor changes. That's technically plausible, but if Stebbi wants App Store / Play Store review before July ends, Capacitor auth/session/deep-link behavior cannot wait until after all weather work.  
   Correction: keep Capacitor setup as a separate workstream, but start a read-only app-store readiness plan soon. Auth, callback redirects, cookie/session persistence, app icons, privacy policy, and store metadata can become blockers independent of Vedrid.

8. **Minor: Design.md coverage should be explicit.**  
   v029 includes mobile checks, but should explicitly require `Design.md` compliance for the Static Maps confirmation UI, Places search input, loading states, and correction flow. Inputs must remain 16 px on mobile, map image must not create horizontal overflow, and client navigation/provider lookup needs pending state.

## What v029 gets right

- Google as a coherent provider is a reasonable answer after Stebbi's app-store direction.
- Capacitor is a pragmatic app-store path if the near-term goal is wrapping the existing Next.js app.
- Static map confirmation is a good MVP reduction compared with full interactive map editing.
- Manual pin is correctly deferred.
- `places.ts` first and no global provider-derived geocoding cache is the right MVP safety posture.
- Phase separation between weather work and Capacitor setup is directionally sensible, as long as app-store readiness starts in parallel.

## Recommended corrections before execution

Claude Code should revise v029 into v031 before any implementation:

1. Replace the Static Maps key model:
   - `GOOGLE_MAPS_SERVER_KEY`: Geocoding/Routes server-side only.
   - `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` or separate restricted static/browser key: Places + Static Maps image URLs.
   - If server-proxying Static Maps is proposed, add ToS/cache/security analysis first.
2. Correct Google pricing table to the current official values and remove unsupported `$200/month free credit` wording.
3. Specify the exact Places Autocomplete product/API and session-token lifecycle.
4. Clarify that `places.ts` route previews still make a Static Maps request.
5. Split Phase 2A1 route skeleton from Phase 2A2 map confirmation cleanly.
6. Add explicit Google Terms storage constraints for future saved places.
7. Start a separate app-store/Capacitor readiness handoff soon, especially auth/session/deep-link/privacy policy.

## Localhost checks for Stebbi

This review file has no localhost checks because it changes no app code.

For the corrected implementation, Stebbi should test:

1. Static map key exposure:
   - Open DevTools Network.
   - Expected: unrestricted `GOOGLE_MAPS_SERVER_KEY` never appears in any client-visible URL or request.
   - Expected: only restricted browser/static key appears where browser-visible map APIs require it.
2. Known places:
   - `Reykjavik -> Apavatn`
   - Expected: no Google geocoding call if both are local, but Static Maps request may happen for preview.
3. Unknown/correction flow:
   - Search unknown place.
   - Expected: one clear Places session, selection, confirmation, no repeated uncontrolled autocomplete calls.
4. Provider failure:
   - Missing/invalid Google server key.
   - Expected: clear provider unavailable message, no crash and no fake route answer.
5. Mobile:
   - 360, 390, 460 px.
   - Expected: static map image fits, Places input is 16 px or larger, buttons reachable, no horizontal overflow.
6. Storage:
   - Selecting a Places candidate does not write global coordinates into `places.ts` or Supabase.
7. Billing sanity:
   - Static map does not remount repeatedly in one flow.
   - Autocomplete does not fire uncontrolled high-volume loops.

## Sources checked

- Google Maps Platform pricing, last updated 2026-06-29 UTC: https://developers.google.com/maps/billing-and-pricing/pricing
- Google Maps Platform Service Specific Terms: https://cloud.google.com/maps-platform/terms/maps-service-terms
- Google Maps Static API docs: https://developers.google.com/maps/documentation/maps-static/start
- Google Maps API security best practices: https://developers.google.com/maps/api-security-best-practices

## Suggested message to Claude Code

Do not execute v029 as written. Codex approves the broad Google + Capacitor + static-map-confirmation direction, but v029 needs a revision first.

Key fixes:

- Static Maps image URLs cannot use an unrestricted server key if the URL is sent to the browser. Use a restricted browser/static key, or propose a server proxy only with a ToS/cache/security review.
- Correct the Google pricing table using the current pricing page. Static Maps and Geocoding free caps are 10,000/month, not 100,000/40,000, and Routes Essentials first paid tier is $5/1000, not ~$10/1000.
- Specify the exact Places Autocomplete product/API, requested fields, and session-token lifecycle.
- Clarify that `places.ts` entries avoid Google geocoding/routing, but Static Maps preview is still a Google API request.
- Keep no global provider-derived geocoding cache in MVP.
- Add explicit `Design.md` mobile/input/loading constraints.

Please produce a revised v031 plan before any code, SQL, env, dependency, commit, push, deploy, or production work.
