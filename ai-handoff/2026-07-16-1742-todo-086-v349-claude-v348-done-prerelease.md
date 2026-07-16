# TODO 086 v349 - Claude handoff: v348 done, prerelease

Created: 2026-07-16 17:42
Timezone: Atlantic/Reykjavik
Author: Claude
Related handoffs:
- `2026-07-16-1731-todo-086-v348-codex-v347-localhost-regression-handoff.md`

## Status

v348 fully implemented. 123/123 tests pass, type-check clean.

---

## Fix 1: Veðurpúls — public user flow restored

### Root cause

`VedurstofanPulseInline.tsx` had a condition added (without being asked) that hid the component from public users when there were no messages:

```ts
const canPost = postingAccess === 'allowed'
if (messages.length === 0 && !canPost) return null
```

This prevented the login CTA ("Skoða fleiri skilaboð eða setja inn athugasemd" / `pulseLoginCta`) from being shown to public users on empty stations.

### Fix

Removed the early return. The component now always renders. The existing conditional rendering already handles all states correctly:

- `postingAccess === 'allowed'` → shows composer + view-more link
- `postingAccess === 'needs-login'` → shows preview (empty or with messages) + login CTA link
- `postingAccess === 'denied'` → shows preview only
- `postingAccess === 'unknown'` (loading) → shows preview in loading state

The `canPost` variable is kept (still used for the conditional rendering of composer/view-more).

---

## Fix 2: Öxi not visible — A1 + A2

Two causes addressed without being able to inspect the actual network response.

### A1: Wider detection radius

`lib/weather/routeCautions.ts` — Öxi corridor point radius increased from 6_000 m to 10_000 m:

```ts
{ lat: 64.860, lon: -14.365, radiusM: 10_000 },
```

The detection point is still approximate (unverified GPS coordinates). 10 km radius compensates for coordinate imprecision while remaining far enough from the coastal Route 1 fjord roads (which are ~25–30 km away from the summit area).

### A2: Relabel non-Öxi base route when Google returns both

When Google already returns a coastal alternative alongside the Öxi route (no extra curated fetch needed), the coastal base route was left with the generic label ("Önnur leið"). It is now relabelled `CURATED_AVOID_OXI` so the UI shows it as "Til að sleppa við Öxi".

`lib/weather/google.server.ts` — added before `getCuratedRouteOptions` call:

```ts
const OXI_CAUTION_ID = 'oxi-axarvegur-939'
const hasOxiRoutes = routeOptions.some(r => r.cautions?.some(c => c.id === OXI_CAUTION_ID))
if (hasOxiRoutes) {
  for (const route of routeOptions) {
    if (!route.cautions?.some(c => c.id === OXI_CAUTION_ID) && !route.labels.includes('CURATED_AVOID_OXI')) {
      route.labels = [...route.labels, 'CURATED_AVOID_OXI']
    }
  }
}
```

This runs before `getCuratedRouteOptions`. The curated route logic was unchanged — it still correctly skips the extra fetch when a non-Öxi base route already exists (the `anyBaseAvoidsCaution` check uses cautions, not labels).

### Tests updated

`lib/__tests__/weather-google.test.ts` — updated the "already avoids" test:

Before: expected `CURATED_AVOID_OXI` not present.
After: expects no extra fetch AND the coastal base route IS labelled `CURATED_AVOID_OXI`.

---

## What still needs localhost verification

### Öxi

Since the corridor coordinates are still approximate (`source.verified: false`), Stebbi needs to verify:

1. `Höfn → Egilsstaðir`: does the default route now show "Varasamt með eftirvagna"?
2. Does "Til að sleppa við Öxi" appear (either from relabelled base route or curated route)?
3. Does the avoiding route visually go around the fjords on the map?
4. Does any coastal Route 1 route incorrectly get the Öxi caution? (If yes: tighten radius back to 6_000 or move the corridor point)

### If Öxi still not visible after radius increase

Most likely cause: the real Google polyline for `Höfn → Egilsstaðir` doesn't pass within 10 km of `{ lat: 64.860, lon: -14.365 }`. Next step: inspect `/api/teskeid/weather/travel/routes` response in browser network to check `cautions` array on each route option, then adjust coordinates.

### Veðurpúls

1. As public user (incognito), open a station that has messages.
2. Should see latest message preview + "Skoða fleiri skilaboð..." CTA link.
3. As public user, open a station with no messages.
4. Should see empty preview + login CTA link (not a blank page).
5. Authenticated user should still see composer on empty stations.
