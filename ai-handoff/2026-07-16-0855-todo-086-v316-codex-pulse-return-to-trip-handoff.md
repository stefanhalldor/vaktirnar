# 2026-07-16 08:55 - TODO-086 v316 - Codex handoff: Veðurpúls return-to-trip behavior

Created: 2026-07-16 08:55
Timezone: Atlantic/Reykjavik

Scope: planning/handoff only. Codex did not change product code, SQL, env, data, commits, deployment, or migrations.

## Context

Stebbi tested the full Veðurpúls page after opening it from a weather station and then clicking the top link currently labelled:

`Til baka í ferðaveðrið`

The link landed on:

`/auth-mvp/vedrid/elta-vedrid?stationId=32097`

That is not the same as returning to the route result the user had configured in `/vedrid`. The current label also overpromises: `/elta-vedrid` is the station explorer / pulse overview, not the user's calculated trip.

Relevant current code:

- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:18-25`
  - `resolveBackHref()` falls back to `/auth-mvp/vedrid/elta-vedrid?stationId=${stationId}`.
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:74-80`
  - Always renders one back link using `t('back')`.
- `messages/is.json:912`
  - `back` is currently `"Til baka í ferðaveðrið"`.
- `components/weather/VedurstofanPulseInline.tsx:111-117`
  - Builds the full pulse URL and carries `returnTo` when the caller supplies it.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:88-104` and `218-299`
  - Route result is persisted/restored from `sessionStorage` using `ROUTE_RESTORE_KEY`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1128-1132`
  - Route cards currently pass `returnTo="/auth-mvp/vedrid"` when result exists.
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:389-392`
  - Station explorer passes `returnTo="/auth-mvp/vedrid/elta-vedrid?stationId=..."`.

## Product Decision

The full pulse page should not show a generic "Til baka í ferðaveðrið" link.

Instead:

1. If the pulse was opened from a calculated route result, show:
   `Til baka í ferðalagið mitt`

   This should return the user to `/auth-mvp/vedrid` and restore the route result from the same-tab `sessionStorage` payload.

2. If the pulse was opened from `/auth-mvp/vedrid/elta-vedrid`, the link must not pretend to return to a trip. Either:
   - show a correctly labelled link, e.g. `Til baka í Veðurpúlsinn` or `Til baka í stöðvayfirlit`, pointing to `/auth-mvp/vedrid/elta-vedrid?stationId=...`, or
   - hide the link if the return context is not useful.

3. Do not use `router.back()` for this flow. It is too fragile for public -> login -> auth -> pulse -> trip restore.

4. Do not reintroduce Veðurpúls into the "Á leiðinni" summary. Veðurpúls belongs on Veðurstofan station cards and the full pulse page.

## Recommended Implementation

### 1. Replace single back link with typed return destination

In `VedurstofanPulsClient.tsx`, replace `resolveBackHref()` with a helper that returns both `href` and `labelKey`, or `null` if no safe useful destination exists.

Suggested shape:

```ts
type PulseBackDestination =
  | { kind: 'trip'; href: '/auth-mvp/vedrid'; labelKey: 'backToTrip' }
  | { kind: 'stationExplorer'; href: string; labelKey: 'backToStationExplorer' }
```

Behavior:

- Decode `returnTo` safely.
- Reject external/protocol-relative paths.
- Prefer using the same boundary-safe logic style as `lib/auth/loginNext.ts`.
- Treat `/auth-mvp/vedrid` and `/auth-mvp/vedrid?restore=1` as `trip`.
- Treat `/auth-mvp/vedrid/elta-vedrid` and `/auth-mvp/vedrid/elta-vedrid?...` as `stationExplorer`.
- Reject weird lookalikes such as `/auth-mvp/vedrid-anything`.
- If there is no valid `returnTo`, either:
  - return `null` and hide the back link, or
  - return station explorer fallback with a station-explorer label, not a trip label.

Codex preference: hide the link when there is no valid `returnTo`, because a misleading fallback is worse than no link. If Claude Code wants a fallback, it must use a truthful label.

### 2. Add explicit message keys

In `messages/is.json` under `teskeid.vedrid.eltaVedrid`:

```json
"backToTrip": "Til baka í ferðalagið mitt",
"backToStationExplorer": "Til baka í Veðurpúlsinn"
```

In `messages/en.json`:

```json
"backToTrip": "Back to my trip",
"backToStationExplorer": "Back to Veðurpúls"
```

Keep the old `back` key only if another UI still uses it. Do not keep using `back` for the full pulse page unless the text is no longer misleading.

### 3. Ensure route-origin pulse links pass route returnTo

Route result station cards already appear to pass:

`returnTo="/auth-mvp/vedrid"`

from `FerdalagidClient.tsx:1128-1132`. Verify this is true for:

- worst Veðurstofan card
- selected Veðurstofan card
- all Veðurstofan point cards

Important: the same-tab route restore is currently the actual state carrier. The URL only needs to route back to `/auth-mvp/vedrid`; `FerdalagidClient` restores result state on mount from `sessionStorage`.

### 4. Preserve public -> login -> pulse -> trip context

The full flow should remain:

1. Public user calculates route on `/vedrid`.
2. Public user clicks station pulse CTA.
3. User is sent to login with `next=/auth-mvp/vedrid/puls/stod/[id]?returnTo=/auth-mvp/vedrid`.
4. After login, user lands on the full pulse page.
5. Full pulse page shows `Til baka í ferðalagið mitt`.
6. Clicking it opens `/auth-mvp/vedrid`.
7. `/auth-mvp/vedrid` restores the same route result from `sessionStorage`.

Do not route this flow through `/auth-mvp/vedrid/elta-vedrid`.

### 5. Keep station explorer behavior truthful

When a pulse is opened from `/auth-mvp/vedrid/elta-vedrid?stationId=...`, it is acceptable to return to that same station in the station explorer. But the label must not mention the user's trip/ferðalag unless a route result is actually being restored.

## Design.md Notes

Relevant rules read:

- Navigation must give truthful, predictable feedback.
- Client navigation should not feel dead or misleading.
- Buttons and links must match what they actually do.
- Mobile-first UI must avoid overflow and focus/keyboard weirdness.

This change is mostly navigation semantics, not visual redesign. If Claude Code adds or changes button styling, keep the link compact, readable, and consistent with the full pulse page header.

## Risks / Edge Cases

- **Route restore TTL:** `FerdalagidClient` currently drops route restore after 30 minutes. If a user spends longer in pulse and then clicks `Til baka í ferðalagið mitt`, `/auth-mvp/vedrid` may open without the old result. That is acceptable for now, but localhost checks should include a normal short-session case.
- **No sessionStorage:** If sessionStorage is unavailable, the route cannot be restored. Do not promise a server-side permanent saved trip yet.
- **Malformed returnTo:** Must not throw. Must not create open redirects.
- **Station explorer return:** If the full pulse was opened from station explorer, a return to `/elta-vedrid` is fine, but the label must say that.
- **Auth/profile redirects:** Keep existing `next` preservation through login/profile intact.

## Suggested Tests

Automated tests would be useful but should stay small:

- Unit test the new return destination resolver:
  - `/auth-mvp/vedrid` -> `trip`
  - `/auth-mvp/vedrid?restore=1` -> `trip`
  - `/auth-mvp/vedrid/elta-vedrid?stationId=32097` -> `stationExplorer`
  - `https://evil.example` -> rejected/null
  - `//evil.example` -> rejected/null
  - `/auth-mvp/vedrid-anything` -> rejected/null
- Existing login-next tests should not need broad changes unless the resolver is shared.

## Localhost Checks For Stebbi

1. Public user: open `/vedrid`, calculate a route with Veðurstofan station cards visible, and click `Sjá fleiri skilaboð eða segja frá aðstæðum` on a station card.
   Expected: login opens.

2. Complete login as an existing user.
   Expected: you land on `/auth-mvp/vedrid/puls/stod/[stationId]?...`.

3. On the full pulse page, check the top link.
   Expected: it says `Til baka í ferðalagið mitt`, not `Til baka í ferðaveðrið`.

4. Click `Til baka í ferðalagið mitt`.
   Expected: you land on `/auth-mvp/vedrid` and the same route result/calculations are restored. You should not land on `/auth-mvp/vedrid/elta-vedrid`.

5. Repeat from an already logged-in user with a route result open.
   Expected: same behavior, without login in the middle.

6. Open `/auth-mvp/vedrid/elta-vedrid`, select a station, open its full pulse page.
   Expected: the return link either says `Til baka í Veðurpúlsinn` / station overview wording and returns to the selected station, or no back link is shown. It must not say `Til baka í ferðalagið mitt`.

7. Refresh the full pulse page, then use its return link.
   Expected: if the original route restore payload is still within TTL, route result returns. If it is expired or absent, `/auth-mvp/vedrid` may show the normal start state, but it must not fall back to `/elta-vedrid` while pretending to be a trip.

8. Mobile width around 390px.
   Expected: the top return link text wraps or fits cleanly, no horizontal overflow, no clipped header.

## Recommendation

Claude Code should implement this as a small navigation semantics fix before further pulse polish:

1. Add typed return destination resolver.
2. Add explicit i18n labels.
3. Render the full pulse back link only when there is a truthful destination.
4. Verify public -> login -> pulse -> route-result restore.

Do not broaden scope into SQL, chat schema, env flags, realtime, or station-card UI unless Stebbi explicitly asks.

## Óvissa / þarf að staðfesta

- Codex assumes route result restore through `sessionStorage` is acceptable as the "real trip" return mechanism for now. A durable URL-encoded or saved-trip route is a separate future enhancement.
- Codex has not run localhost or tests. This handoff is based on code inspection and Stebbi's production/localhost observation.
