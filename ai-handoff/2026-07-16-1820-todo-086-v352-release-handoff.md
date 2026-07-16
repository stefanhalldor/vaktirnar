# TODO 086 v352 - Release handoff

Created: 2026-07-16 18:20
Timezone: Atlantic/Reykjavik
Author: Claude

## Tests

123/123 pass. Type-check clean.

---

## Changes in this release

### 1. Öxi — caution detection

`lib/weather/routeCautions.ts`

- `oxi-axarvegur-939` segment enabled (was already in registry from prior session).
- Detection radius widened from 6,000 m to 10,000 m to compensate for approximate corridor coordinates (`source.verified: false`).
- Corridor point: `{ lat: 64.860, lon: -14.365 }`.

### 2. Öxi — "Til að sleppa við Öxi" label on existing non-Öxi base route (A2)

`lib/weather/google.server.ts`

When Google returns both a route with the Öxi caution and a route without it, the non-Öxi route is relabelled `CURATED_AVOID_OXI` in `getRouteOptions`. No extra API call. Happens before `getCuratedRouteOptions` runs.

### 3. Öxi — curated avoid route via Reyðarfjörður (A3)

`lib/weather/routeCautionConstants.ts` — `REYDARFJORDUR_VIA = { lat: 65.0317, lon: -14.2183 }`.

`lib/weather/google.server.ts`:

- `CuratedRouteRule` extended with optional `triggerCautionId`, `origin?`, `destination?`.
- New rule `avoid-oxi-via-reydarfjordur`: triggers when any base route has `oxi-axarvegur-939`, skipped if any base route already avoids it (A2 already covered it), suppressed post-fetch if the curated route still passes through Öxi.
- Labels: `['CURATED_AVOID_OXI']`.

### 4. Öxi — UI label

`components/weather/RouteSelectionStep.tsx`

- `CURATED_AVOID_OXI` label renders as `routeOptionAvoidOxi` translation key.

`messages/is.json` — `"routeOptionAvoidOxi": "Til að sleppa við Öxi"`
`messages/en.json` — `"routeOptionAvoidOxi": "Avoid Öxi"`

### 5. Veðurpúls — public flow restored

`components/weather/VedurstofanPulseInline.tsx`

- Removed `if (messages.length === 0 && !canPost) return null`. Component always renders regardless of auth state.
- Public users (`needs-login`) see messages (if any), empty state text, and a login link.
- Authenticated users (`allowed`) see messages, composer, and view-more link.

### 6. Veðurpúls — split empty state text

`components/weather/VedurstofanPulseInline.tsx`

- `postingAccess === 'needs-login'`: `pulseEmptyPublic` — "Vertu fyrst/ur til að segja frá aðstæðunum"
- `postingAccess === 'allowed'`: `pulseEmpty` — "Engar umferðarfréttir ennþá. Vertu fyrst/ur til að deila þinni upplifun af aðstæðunum."

`messages/is.json` — `"pulseEmptyPublic": "Vertu fyrst/ur til að segja frá aðstæðunum"`
`messages/en.json` — `"pulseEmptyPublic": "Be the first to report on conditions"`

### 7. Route-scoped Safnpúls — always visible when loaded

`components/weather/VedurstofanRoutePulseSummary.tsx`

- Removed `if (!hasAnyMessages) return null`. Collapsed drawer always appears once the route-preview API resolves, even when no messages exist on any station along the route.

---

## Needs localhost verification before treating as done

### Öxi

1. `Höfn → Egilsstaðir` — "Varasamt með eftirvagna" caution appears on the Öxi route.
2. "Til að sleppa við Öxi" appears as a second option (either relabelled base route or curated route via Reyðarfjörður).
3. The avoiding route on the map goes around the fjords, not over Road 939.
4. A coastal Route 1 route (e.g. `Höfn → Vík`) does NOT get the Öxi caution.

If Öxi still not detected: check `/api/teskeid/weather/travel/routes` network response for `cautions` array. If empty, the Google polyline is not passing within 10 km of `{ lat: 64.860, lon: -14.365 }` — adjust coordinates or radius further.

### Veðurpúls

1. Public (incognito), station with messages: header visible, messages visible, login link visible.
2. Public, station with no messages: header visible, "Vertu fyrst/ur til að segja frá aðstæðunum", login link.
3. Authenticated, station with no messages: header, "Engar umferðarfréttir ennþá..." text, composer.
4. Route-scoped Safnpúls collapsed drawer visible at bottom of "Á leiðinni" section on any Veðurstofan-active route, even with no messages on route stations.

---

## Not in this release

- Öxi corridor coordinates not GPS-verified (`source.verified: false`).
- Westfjords Route 60 `missing-via` transitional proxy.
- Bidirectional Hólmavík alternate (`Ísafjörður → Höfn`).
- Vehicle profile filtering (`appliesTo` not used for filtering yet).
