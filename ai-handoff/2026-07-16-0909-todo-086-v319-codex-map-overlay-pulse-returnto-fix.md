# 2026-07-16 09:09 - TODO-086 v319 - Codex handoff: map overlay pulse must preserve trip returnTo

Created: 2026-07-16 09:09
Timezone: Atlantic/Reykjavik

Scope: planning/handoff only. Codex did not change product code, SQL, env, data, commits, deployment, or migrations.

## Context

Stebbi tested the public -> login -> full Veðurpúls flow and landed correctly on:

`/auth-mvp/vedrid/puls/stod/32097`

But the full pulse page did not show `Til baka í ferðalagið mitt`.

The URL has no `returnTo` query. That means the full pulse page cannot know it should return to the user's calculated trip. The v317 resolver is doing the right thing by hiding the link when `returnTo` is missing; the missing part is that one source component is not passing `returnTo`.

## Root Cause

Route-result Veðurstofan cards in the "Allir spápunktar" list do pass `returnTo`:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1128-1132`
  defines `vedurstofanReturnTo = '/auth-mvp/vedrid'`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1983-1991`
  passes `returnTo={vedurstofanReturnTo}` into `VedurstofanPointCard`.

But the selected/worst Veðurstofan card inside the map overlay does not:

- `components/weather/TravelAuditMap.tsx:713-727`
  `OverlayPointDetailsPanel` receives station/ETA context, but no `returnTo`.
- `components/weather/TravelAuditMap.tsx:747-755`
  renders `VedurstofanPointCard` without `returnTo`.

So if the public user opens Veðurpúls from the map-selected/worst station panel, `VedurstofanPulseInline` builds:

`/auth-mvp/vedrid/puls/stod/32097`

instead of:

`/auth-mvp/vedrid/puls/stod/32097?returnTo=%2Fauth-mvp%2Fvedrid`

That matches Stebbi's screenshot exactly.

## Required Fix

Add the same route-result `returnTo` contract to the map overlay path.

Recommended minimal implementation:

1. Add a prop to `TravelAuditMap`, for example:

```ts
vedurstofanReturnTo?: string
```

2. Pass it from `FerdalagidClient` where `TravelAuditMap` is rendered:

```tsx
<TravelAuditMap
  ...
  vedurstofanReturnTo={vedurstofanReturnTo}
/>
```

3. Thread it through `OverlayPointDetailsPanel`:

```ts
function OverlayPointDetailsPanel({
  ...
  vedurstofanReturnTo,
}: {
  ...
  vedurstofanReturnTo?: string
})
```

4. Pass it into `VedurstofanPointCard`:

```tsx
<VedurstofanPointCard
  ...
  returnTo={vedurstofanReturnTo}
/>
```

5. Do not change the full pulse resolver from v317. It is correct to hide the back link when no safe `returnTo` exists.

## Important Product Rule

Every Veðurstofan station card shown inside a calculated `/vedrid` route result must pass the same trip return target:

`/auth-mvp/vedrid`

This includes:

- worst station card
- selected station card
- map overlay selected/worst station card
- "Allir spápunktar" station cards

The full pulse page then says:

`Til baka í ferðalagið mitt`

and returns to `/auth-mvp/vedrid`, where the route-result restore logic brings the same trip back from same-tab `sessionStorage`.

## Design.md Notes

Relevant design rules:

- Navigation text must match the actual destination.
- Client navigation should preserve user context and avoid surprising resets.
- Mobile app-like flows should not drop the user out of their task context.

This is not a visual redesign. It is a context propagation fix.

## Risks / Edge Cases

- Keep direct full pulse URLs without `returnTo` unchanged: no back link is better than a misleading one.
- Keep `/auth-mvp/vedrid/elta-vedrid` station explorer behavior unchanged: station explorer can pass its own `returnTo`, and the full pulse page should label that separately.
- Route restore is still same-tab `sessionStorage` with 30 minute TTL. This fix only ensures the full pulse page gets the right link back to `/auth-mvp/vedrid`.

## Localhost Checks For Stebbi

1. Public user: open `/vedrid`, calculate a route, then open Veðurpúls from a Veðurstofan card in "Allir spápunktar".
   Expected: after login, full pulse URL includes `returnTo` and shows `Til baka í ferðalagið mitt`.

2. Public user: open `/vedrid`, calculate a route, tap a Veðurstofan marker/card in the map overlay, then open Veðurpúls from that map-selected station panel.
   Expected: after login, full pulse URL includes `returnTo` and shows `Til baka í ferðalagið mitt`.

3. Click `Til baka í ferðalagið mitt`.
   Expected: returns to `/auth-mvp/vedrid` and restores the same calculated route result. It must not go to `/auth-mvp/vedrid/elta-vedrid`.

4. Already logged-in user: repeat from the map overlay station panel.
   Expected: no login step, full pulse still shows `Til baka í ferðalagið mitt`, and returning restores the same route result.

5. Station explorer: open `/auth-mvp/vedrid/elta-vedrid`, select a station, open full pulse.
   Expected: it should not say `Til baka í ferðalagið mitt`; it should use the station-explorer return behavior from v317.

6. Direct URL: open `/auth-mvp/vedrid/puls/stod/32097` manually.
   Expected: no back link is shown, because there is no safe context to return to.

## Recommendation

Claude Code should do this as a small targeted follow-up to v317 before release:

- add `vedurstofanReturnTo` to `TravelAuditMap`
- thread it through to `OverlayPointDetailsPanel`
- pass it into `VedurstofanPointCard`
- rerun type-check

No SQL, env, auth, chat access, or realtime changes are needed.

## Óvissa / þarf að staðfesta

- Codex assumes Stebbi opened the full pulse from the map-selected/worst Veðurstofan station card, because that is the path currently missing `returnTo`. If the click came from a different UI element, Claude Code should trace that element and apply the same rule: route-result context must pass `returnTo="/auth-mvp/vedrid"`.
