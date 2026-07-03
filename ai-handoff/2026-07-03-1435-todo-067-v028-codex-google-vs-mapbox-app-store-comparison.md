# TODO #67 Vedrid - Google Maps vs Mapbox for app-store direction

Created: 2026-07-03 14:35
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Provider comparison / planning handoff. No code, SQL, env, dependency, Supabase, commit, push, deploy, or production changes made.

## Why this exists

v027 assumed Mapbox remained the provider direction for map confirmation.

Stebbi has now clarified a larger product direction: Teskeid should move toward app mode and be submitted into Play Store / App Store review before July ends.

That changes the provider tradeoff. We should not send v027 as final execution direction until Stebbi chooses Mapbox vs Google Maps with this app-store ambition in mind.

## Short answer

Neither Google Maps nor Mapbox is automatically "more professional".

But for an app-store-bound consumer app where the map's job is to make users trust that `fra` / `til` / golf course resolution is correct, **Google Maps has a stronger product argument** than it had earlier.

Codex recommendation:

- If Stebbi prioritizes **native-app familiarity, user comfort, and best ambiguous place resolution**, choose **Google Maps Platform** as the map/search/route provider direction.
- If Stebbi prioritizes **fastest MVP on current web app, custom Teskeid visual style, and generous web/Directions free tiers**, keep **Mapbox**.

Given Stebbi's latest direction, Codex leans slightly toward **Google Maps Platform** now, provided Stebbi accepts the extra provider-review/config/billing work and likely higher usage costs for Routes/Places as usage grows.

## Official pricing facts checked 2026-07-03

Sources:

- Google Maps Platform pricing: https://developers.google.com/maps/billing-and-pricing/pricing
- Google Maps Platform terms: https://cloud.google.com/maps-platform/terms/maps-service-terms
- Mapbox pricing: https://www.mapbox.com/pricing
- Mapbox geocoding storage: https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results

### Google Maps Platform

Relevant pricing from official page:

- **Native Maps SDK**: listed as unlimited free usage cap.
- **Web Dynamic Maps**: 10,000 free monthly loads, then paid per 1,000.
- **Static Maps**: 10,000 free monthly requests, then paid per 1,000.
- **Routes Compute Routes Essentials**: 10,000 free monthly calls, then paid per 1,000.
- **Geocoding**: 10,000 free monthly calls, then paid per 1,000.
- **Autocomplete Requests**: 10,000 free monthly requests, then paid per 1,000.

Important interpretation:

- Google is attractive for native app map display.
- Google route/geocode/place APIs are still metered and can become cost drivers.
- If using Google, prefer one coherent Google provider path rather than mixing Google search with Mapbox map/route.

### Mapbox

Relevant pricing from official page:

- **Mobile Maps SDK**: 25,000 monthly active users free, then paid per 1,000 MAU.
- **Mapbox GL JS web map loads**: 50,000 monthly map loads free, then paid per 1,000 map loads.
- **Directions API**: 100,000 monthly requests free, then paid per 1,000 requests.
- **Temporary Geocoding API**: 100,000 monthly requests free, then paid per 1,000 requests.
- **Search Box API sessions**: free tier exists, then paid per session; details differ for preview/standard pricing.

Important interpretation:

- Mapbox is attractive for current web MVP economics and custom map UI.
- Mapbox mobile SDK is also app-store capable, but billing is MAU-based after free tier.
- Temporary geocoding storage rules remain strict: do not persist temporary geocoding results.

## Product comparison

### User trust / comfort

**Google advantage.**

Users know Google Maps. If the route confirmation UI says "Sudurgata, Reykjavik" with a familiar Google map, many users will trust it faster.

This matters because the map's primary job in Vedrid is not decoration. It is to show that Teskeid understood the right place before making a weather/trailer recommendation.

### Icelandic place ambiguity

**Likely Google advantage, but should be tested.**

Google is probably better for repeated street names, addresses, business/place names, and informal user search. It likely handles "Sudurgata" variants and Icelandic municipalities better.

But this must be verified with real Icelandic test queries:

- Sudurgata Reykjavik / Hafnarfjordur / Akranes / Keflavik
- Grafarholtid / Grafarholtsvollur / Grafarholt
- Moso / Mosfellsbaer
- Apavatn
- summer-house style vague areas
- golf courses outside Reykjavik

### App Store / Play Store future

**Google advantage for familiarity and native defaults.**

Google Maps SDKs are very standard for mobile apps, especially Android. For iOS, both Google and Mapbox are normal, but Google is still more familiar to users.

However, if Teskeid's app-store path is initially a wrapped web/PWA-style app, the first implementation may still use web map APIs. In that case:

- Google web Dynamic Maps has a smaller free monthly cap than Mapbox GL JS.
- Mapbox web custom styling remains simpler and cheaper at likely MVP usage.

Claude Code should not assume the native architecture yet. It should ask/confirm whether "app mode" means:

- PWA/installable web app first;
- Capacitor wrapper;
- React Native/Expo;
- fully native iOS/Android later.

### Visual design / Teskeid feel

**Mapbox advantage.**

Mapbox is easier to make feel like a quiet Teskeid component rather than a Google product embedded inside Teskeid.

Google is familiar, but familiarity can also make the UI feel less owned by Teskeid. That is not fatal; for map trust it may be acceptable or even beneficial.

### Cost / free tier

**Mapbox advantage for current web + route/weather MVP.**

Mapbox gives much larger free tiers for web map loads, Directions API, and temporary geocoding than Google appears to give for comparable web/routes/geocoding APIs.

**Google advantage for native map display only**, because Google's pricing page lists native Maps SDK free usage cap as unlimited. But route/geocode/autocomplete remain metered.

### Terms / storage complexity

**Neither is "free and easy" for persistent place storage.**

Mapbox has explicit temporary/permanent geocoding storage rules.

Google Maps Platform has its own service terms and restrictions. Do not assume Google allows global caching of geocoded coordinates or provider-derived place data into `places.ts` / Supabase without review.

Regardless of provider:

- provider-derived candidates can be used for the current request;
- do not persist global geocoding results in MVP;
- saved personal places require separate ToS/security/privacy plan;
- `places.ts` remains curated/local.

## Architecture implications

### If choosing Google

Use Google as a coherent provider path:

- Google Maps JS or native SDK for map confirmation.
- Google Places/Geocoding for ambiguous place candidates.
- Google Routes API for route geometry/duration.
- Server-side provider adapter for secret/server calls.
- Browser/mobile public key restricted by domain/app bundle where possible.

Do not mix Google place results into Mapbox maps/routes unless a ToS review explicitly approves that combination.

Potential env names:

- `GOOGLE_MAPS_BROWSER_KEY` or equivalent public/restricted key for map display.
- `GOOGLE_MAPS_SERVER_KEY` for server-side geocoding/routes if used.

Exact naming should match repo conventions and must not be implemented without explicit Stebbi approval.

### If choosing Mapbox

Continue v027 direction:

- Mapbox map confirmation.
- Mapbox geocoding/directions server-side.
- `MAPBOX_SECRET_TOKEN` server-only.
- `NEXT_PUBLIC_MAPBOX_TOKEN` or equivalent public token for browser map rendering.

## Decision recommendation

Codex recommends Stebbi chooses one of these explicitly:

### Option G - Google Maps Platform

Choose this if:

- app-store trust and native-app feel are now the main priority;
- familiar Google map UI is considered a product advantage;
- ambiguous Icelandic place resolution quality matters more than MVP cost simplicity;
- Stebbi accepts extra review and possible higher metered API costs for Routes/Places/Geocoding.

### Option M - Mapbox

Choose this if:

- the current July goal is mainly shipping a strong web/PWA MVP;
- cost simplicity and generous MVP free tiers matter most;
- custom Teskeid visual style matters more than Google familiarity;
- route/weather can rely on curated `places.ts` + Mapbox provider support.

## Codex recommendation for July 2026

Because Stebbi wants app-store review before July ends, do not let provider comparison expand into a huge research project.

Recommended path:

1. Spend one short review loop choosing **Google vs Mapbox**.
2. Once chosen, do not mix providers for this feature.
3. Keep map confirmation MVP small:
   - route: A/B pins + route line + confirm/change;
   - golf: one course pin + confirm/change;
   - no saved places yet;
   - no global geocoding cache.
4. Defer saved personal places, unknown-place learning, and persistent provider-derived coordinates.

Codex's current bias after app-store clarification:

**Choose Google if Stebbi wants the map to feel maximally familiar and trustworthy to mainstream users.**

**Choose Mapbox if Stebbi wants the fastest, cheapest, most Teskeid-styled MVP.**

## Localhost checks for Stebbi

This comparison file has no localhost checks because it changes no app code.

Once a provider is chosen and implemented, Stebbi should test:

1. Route known places:
   - `Reykjavik -> Apavatn`
   - Expected: A/B map confirmation before weather answer.
2. Ambiguous street:
   - route with `Sudurgata`
   - Expected: candidate selection, no guessing.
3. Golf:
   - `Grafarholtid` / `Grafarholtsvollur`
   - Expected: one course pin, no route UI.
4. Mobile/app mode:
   - 360, 390, 460 px web viewport.
   - If app wrapper exists later: Android and iOS simulator/device.
5. Cost sanity:
   - one map panel per flow, no repeated remount loops.
6. Secrets:
   - browser/mobile app sees only restricted public key.
   - server keys are never exposed.
7. Storage:
   - no provider-derived geocoding result is persisted globally.

## Suggested message to Claude Code

Do not treat v027 as final provider direction yet.

Stebbi is now prioritizing app mode plus Play Store / App Store review before the end of July 2026. Please review v028 and respond with a concise provider recommendation: Google Maps Platform vs Mapbox for the Vedrid map-confirmation/route/golf flow.

Important constraints:

- If Google is chosen, use Google coherently for map/search/geocoding/routes; do not mix Google place results into Mapbox unless ToS is reviewed.
- If Mapbox is chosen, continue v027.
- Either way: no persistent global geocoding cache, no saved places in MVP, no source-file auto-growth from provider results.
- Keep implementation small enough for July review.
- No code, SQL, env, dependency, commit, push, deploy, or production changes until Stebbi gives explicit scoped execution permission.
