# TODO-067 v162 - Saved-place filtering + permanent Google Maps referrer fix

Created: 2026-07-07 23:08
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Handoff/plan. No code, SQL, migration, commit, push, deploy, or Google Cloud setting changed by Codex.

## Context

Stebbi found two issues on production after saved places and route selection went live:

1. Saved/recent places show the already selected `Frá` place inside the `Til` recent list. Example: `Egilsstaðir` is selected as `Frá`, but still appears as a `Til` option. This is useless and can let users choose the same point for both ends.
2. Google Maps fails on production with:

```txt
Google Maps JavaScript API error: RefererNotAllowedMapError
Your site URL to be authorized: https://www.xn--teskei-uwa.is/auth-mvp/vedrid
```

Google's own Maps JavaScript error docs say `RefererNotAllowedMapError` means the current URL loading the API has not been added to the allowed referrers for the API key. Source: https://developers.google.com/maps/documentation/javascript/error-messages

## Important diagnosis

The console shows the referrer as:

```txt
https://www.xn--teskei-uwa.is/auth-mvp/vedrid
```

That is the punycode/ASCII browser form of the Icelandic domain. If the Google browser key currently only allows:

- `https://teskeid.is/*`
- `https://www.teskeid.is/*`

then the actual IDN production site can still be blocked because Google sees the request under:

- `https://xn--teskei-uwa.is/*`
- `https://www.xn--teskei-uwa.is/*`

This should be fixed in Google Cloud API key website restrictions. Code-side fallback should also remain robust, but the root cause in this screenshot is the browser-key referrer list.

## Work item A - Hide already selected place from the opposite saved-place list

### Current code shape

`components/weather/RouteSelectionStep.tsx` passes the same `savedPlaces` list to both `PlaceSearch` instances:

```tsx
<PlaceSearch savedPlaces={savedPlaces} ... />
```

for both origin and destination.

`components/weather/PlaceSearch.tsx` simply renders all `savedPlaces` when the input is empty.

### Required behavior

When choosing `Til`, hide the currently selected `Frá` place from the saved/recent list.

When choosing `Frá`, hide the currently selected `Til` place from the saved/recent list.

Examples:

- `Frá = Egilsstaðir`; user opens `Til`; recent list must not show `Egilsstaðir`.
- `Til = Akranes`; user reopens `Frá`; recent list must not show `Akranes`.
- If neither side is selected, show all saved places.
- If a selected place is cleared, it may reappear in the opposite list.

### Implementation recommendation

Keep this logic in `RouteSelectionStep.tsx`, not inside `PlaceSearch`, because `RouteSelectionStep` knows origin/destination semantics.

Add a small comparison helper. Prefer the same coordinate-key logic used by saved places:

```ts
function placeKey(p: { lat: number; lon: number }) {
  return `${p.lat.toFixed(5)}:${p.lon.toFixed(5)}`
}
```

Then:

```ts
const originSavedPlaces = destination
  ? savedPlaces?.filter(p => placeKey(p) !== placeKey(destination))
  : savedPlaces

const destinationSavedPlaces = origin
  ? savedPlaces?.filter(p => placeKey(p) !== placeKey(origin))
  : savedPlaces
```

Pass:

- `originSavedPlaces` to origin `PlaceSearch`
- `destinationSavedPlaces` to destination `PlaceSearch`

Do not delete rows from saved places just because they are filtered from the current picker. This is only a view filter.

### Tests

Add or update component/static tests if the repo has a good pattern for this. If not, this can be covered by a focused unit helper test:

- same lat/lon rounded to 5 decimals is hidden
- different place remains visible
- empty/null selected opposite place returns full list

Manual test is mandatory either way.

## Work item B - Fix Google Maps permanently for production IDN domain

### Immediate Google Cloud setting

In Google Cloud Console, update the browser key used by:

```env
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
```

Add these Website restrictions if missing:

```txt
https://teskeid.is/*
https://www.teskeid.is/*
https://xn--teskei-uwa.is/*
https://www.xn--teskei-uwa.is/*
```

Keep localhost entries for development:

```txt
http://localhost:3004/*
http://127.0.0.1:3004/*
```

If dev/prod may use other local ports, add only the actual ports Stebbi uses, not a broad wildcard.

Do not remove API restrictions. The browser key should still be restricted to the needed client APIs, currently:

- Maps JavaScript API
- Maps Static API
- Places API (New)

If this key is also used by Static Maps URLs, keep Maps Static API enabled. If server-side Routes uses a separate server key, do not add browser referrer restrictions to the server key.

### Why punycode matters

The browser/devtools console reports the referrer as `www.xn--teskei-uwa.is`, not `www.teskeid.is`.

The Google Cloud referrer restriction must match what Google's loader sees. For the Icelandic domain, that means allowing the punycode domain in addition to the ASCII domain.

### Code-side resilience

The app already shows a map-unavailable message in `RouteSelectionStep` when `loadMapsLibrary()` throws:

- `components/weather/RouteSelectionStep.tsx:104-130`
- `components/weather/RouteSelectionStep.tsx:351-363`

However, for a permanent product-grade fix Claude Code should verify:

1. Place search still falls back to `/api/place/search` when Google Places fails.
2. Route calculation can still proceed with selected places even if the map canvas fails.
3. If the map is unavailable, the gray fallback panel is informative enough and does not look like a fatal product error.
4. If Static Maps fallback exists in result maps, it also works under the same browser key restrictions.

Do not hide the error silently during beta. A clear non-blocking fallback is better than a dead gray box.

## Suggested sequencing

1. **Stebbi / Google Cloud:** add punycode website restrictions to the browser key.
2. Wait a few minutes for Google key restriction propagation.
3. Hard-refresh production `/auth-mvp/vedrid`.
4. Confirm the console no longer shows `RefererNotAllowedMapError`.
5. Claude Code implements Work item A saved-place filtering.
6. Claude Code verifies Work item B fallback behavior and only changes code if fallback is insufficient.
7. Run:
   - `npm run type-check`
   - `npm run test:run`
   - `npm run build`
8. Commit/push/deploy only after explicit Stebbi approval.

## Localhost checks for Stebbi

### Saved-place filtering

Setup:

- SQL 69 has been applied.
- Logged in with `vedrid` access.
- At least three saved places exist, including `Egilsstaðir`, `Akranes`, `Garðabær`.

Checks:

1. Open `/auth-mvp/vedrid`.
2. Choose `Frá = Egilsstaðir`.
3. Open the `Til` field.
4. Expected: `Egilsstaðir` is not shown under `Nýlegir staðir`.
5. Expected: other saved places, e.g. `Akranes` and `Garðabær`, still show.
6. Choose `Til = Akranes`.
7. Reopen/change `Frá`.
8. Expected: `Akranes` is not shown in the `Frá` recent list.
9. Clear `Til`.
10. Expected: `Akranes` may appear again in `Frá` recents.
11. Delete a saved place with `X`.
12. Expected: it is deleted from saved places, not merely filtered.

### Google Maps production verification

After Google Cloud referrer restrictions are updated:

1. Open production `https://www.teskeið.is/auth-mvp/vedrid`.
2. Open DevTools console.
3. Hard refresh.
4. Expected: no `RefererNotAllowedMapError`.
5. Expected: route selection map loads.
6. Search/select origin and destination.
7. Expected: autocomplete/search works.
8. Expected: map route lines/pins work after both places are selected.

Also test:

1. Open `https://www.xn--teskei-uwa.is/auth-mvp/vedrid` directly if browser allows.
2. Expected: same behavior, no referrer error.

### Failure fallback check

This is harder to force safely in production. On localhost, temporarily using an invalid browser key can confirm fallback behavior, but do not change production env just to test this.

Expected fallback:

- Place search should use server fallback.
- The route can still be calculated.
- Map area shows a friendly non-blocking message.

## Production caution

- Do not make the browser key unrestricted.
- Do not set Website restrictions to overly broad wildcards.
- Do not mix the browser key and server key restrictions.
- Do not remove API restrictions.
- If Google Console takes a few minutes to apply restrictions, wait before changing code again.

## Commands and sources used by Codex

Local read-only inspection:

- Read `components/weather/PlaceSearch.tsx`
- Read `components/weather/RouteSelectionStep.tsx`
- Read `lib/weather/googleMaps.client.ts`
- Searched for map fallback and Google Maps usage with `rg`
- Read relevant `messages/is.json` keys
- Ran `Get-Date -Format "yyyy-MM-dd HH:mm"` before file creation

External source:

- Google Maps JavaScript API error messages docs, specifically `RefererNotAllowedMapError`: https://developers.google.com/maps/documentation/javascript/error-messages

