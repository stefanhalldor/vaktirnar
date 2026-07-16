# TODO 086 v351 - Claude handoff: v348–v350 done, prerelease

Created: 2026-07-16 18:10
Timezone: Atlantic/Reykjavik
Author: Claude
Related handoffs:
- `2026-07-16-1742-todo-086-v349-claude-v348-done-prerelease.md`
- `2026-07-16-1757-todo-086-v350-codex-v349-prerelease-review.md`

## Status

All v348–v350 items implemented. 123/123 tests pass, type-check clean.

---

## Changes in this pass

### 1. Veðurpúls — public empty state text split

`components/weather/VedurstofanPulseInline.tsx` — different empty label for public vs authenticated:

- `postingAccess === 'needs-login'` (public): `pulseEmptyPublic` → "Vertu fyrst/ur til að segja frá aðstæðunum"
- `postingAccess === 'allowed'` (authenticated): `pulseEmpty` → "Engar umferðarfréttir ennþá. Vertu fyrst/ur til að deila þinni upplifun af aðstæðunum."

New translation key added to `messages/is.json` and `messages/en.json`.

Codex v350 finding 1 (hide empty state from public users) — **intentionally ignored** per Stebbi's product decision. The component always renders for all user states.

### 2. Veðurpúls — route-scoped Safnpúls always visible

`components/weather/VedurstofanRoutePulseSummary.tsx` — removed `if (!hasAnyMessages) return null`. The collapsed drawer now always appears once the route-preview API resolves, even when no messages exist on any station along the route.

### 3. Veðurpúls — public flow restored

`components/weather/VedurstofanPulseInline.tsx` — removed the `if (messages.length === 0 && !canPost) return null` early-return that was hiding the component from public users on empty stations.

### 4. Öxi — A1: wider detection radius

`lib/weather/routeCautions.ts` — Öxi corridor `radiusM` widened from 6_000 to 10_000 m. Detection point is still approximate (`source.verified: false`). Coastal Route 1 roads are ~25 km from the point so no false-positive risk from widening.

### 5. Öxi — A2: relabel non-Öxi base route

`lib/weather/google.server.ts` — when Google returns both an Öxi route and a non-Öxi route as base alternatives, the non-Öxi route is now labelled `CURATED_AVOID_OXI` so the UI presents it as "Til að sleppa við Öxi" without an extra Google request.

---

## Pending / needs localhost verification

### Öxi

1. `Höfn → Egilsstaðir` — confirm "Varasamt með eftirvagna" appears on the Öxi route.
2. Confirm "Til að sleppa við Öxi" appears (either from relabelled base route or curated route).
3. Map: the avoiding route should visually go around the fjords, not over Road 939.
4. Confirm no coastal Route 1 route incorrectly gets the Öxi caution. If it does: tighten `radiusM` back to 6_000 or move the corridor point.

If Öxi still not detected after radius increase: inspect `/api/teskeid/weather/travel/routes` in browser network for `cautions` array. If empty, the real Google polyline is not passing within 10 km of `{ lat: 64.860, lon: -14.365 }` — adjust coordinates.

### Veðurpúls

1. Public (incognito), station with messages → "Nýjast af staðnum frá notendum Teskeið.is" header, messages, "Sjá fleiri skilaboð eða segja frá aðstæðum" link.
2. Public, station with no messages → "Nýjast af staðnum frá notendum Teskeið.is" header, "Vertu fyrst/ur til að segja frá aðstæðunum", login link.
3. Authenticated, station with no messages → header, "Engar umferðarfréttir ennþá...", composer.
4. Route-scoped Safnpúls collapsed drawer visible at bottom of "Á leiðinni" section on any Veðurstofan-active route, even with no messages.

---

## Pending not addressed in this session

- Öxi corridor coordinates not GPS-verified (`source.verified: false`).
- Westfjords `missing-via` transitional proxy remains.
- Bidirectional Hólmavík alternate (`Ísafjörður → Höfn`).
- Vehicle profile filtering (`appliesTo` not used for filtering).
- Pulse realtime via shared chat core (noted in v350 finding 2, long-term direction).
