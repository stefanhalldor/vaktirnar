# TODO-067 v192 - Claude handoff - placeId trace diagnostics added

Created: 2026-07-08 12:07
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Implementation complete. Awaiting Stebbi retest with fresh Google autocomplete selections.

## What was done

Added three dev-only diagnostic trace points to pinpoint exactly where `placeId` enters or is lost before it reaches `getRouteOptions`.

## Diagnosis so far

Terminal diagnostic from v189 (`getRouteOptions`) showed `"originType": "latLng"` and `"destType": "latLng"`.

Most likely cause: Stebbi selected both places from the **saved/recent places list** (shown before typing), not from Google autocomplete suggestions. Saved places are coordinate-based and carry no `placeId` — this is by design until a future migration adds `place_id` to `weather_saved_places`.

## Diagnostic traces added

### 1. `components/weather/PlaceSearch.tsx` — browser DevTools console

Three cases now log to the browser console (`console.log`, visible in Chrome DevTools > Console):

**Google autocomplete path (the one that should have placeId):**
```
[PlaceSearch] selected (google): { name: "Þorlákshöfn", placeId: "ChIJ..." }
```
or if `place.id` was null:
```
[PlaceSearch] selected (google): { name: "Þorlákshöfn", placeId: "null — place.id was null/undefined" }
```

**Server fallback path:**
```
[PlaceSearch] selected (server fallback): { name: "Þorlákshöfn", placeId: "ChIJ..." }
```
or `placeId: "none"` if the geocoding API didn't return one.

**Saved/recent place selection:**
```
[PlaceSearch] selected (saved place): { name: "Garðabær", placeId: "none — saved places have no placeId" }
```

### 2. `app/api/teskeid/weather/travel/routes/route.ts` — Next.js server terminal

Logs what arrived in the HTTP request body before candidates are built:
```
[routes/routes] placeId in request body: {
  origin: "present (ChIJreykjavik...)" | "absent",
  destination: "present (ChIJthorlakshofn...)" | "absent"
}
```

### 3. `lib/weather/google.server.ts` — Next.js server terminal (already in v189)

The existing `[weather/google] getRouteOptions diagnostics` log shows `originType`/`destType` — this is the final confirmation of what reaches Google Routes.

## Complete trace for Stebbi

When searching with Google autocomplete, expect to see in order:

1. **Browser DevTools console** (while typing/selecting):
   ```
   [PlaceSearch] selected (google): { name: "Garðabær", placeId: "ChIJ..." }
   [PlaceSearch] selected (google): { name: "Þorlákshöfn", placeId: "ChIJ..." }
   ```

2. **Next.js server terminal** (when route options are fetched):
   ```
   [routes/routes] placeId in request body: { origin: "present (ChIJ...)", destination: "present (ChIJ...)" }
   [weather/google] getRouteOptions diagnostics: { "originType": "placeId", "destType": "placeId", ... }
   ```

If at step 1 you see `placeId: "null — place.id was null/undefined"`, then `place.id` is null in the Google Maps JS API at the time of selection. This would be a bug in the Google Maps SDK integration or a library version issue.

If at step 1 you see `(saved place)` for either field, that's the cause — selected from saved/recent list.

## Instructions for Stebbi

**Retest steps:**

1. Open `/auth-mvp/vedrid` on localhost.
2. Open browser DevTools > Console tab (keep it visible).
3. Open the Next.js terminal where `npm run dev` is running.
4. **Click the X to clear both origin and destination fields** (or navigate away and back to reset).
5. In the **origin field**, type `Garðabær` and wait for suggestions to appear. Pick the Google suggestion from the dropdown — **do not pick from the saved/recent list** shown before you start typing.
6. In the **destination field**, type `Þorlákshöfn` and wait for suggestions. Pick the Google suggestion from the dropdown — **do not pick a saved/recent item**.
7. Check the browser DevTools console for `[PlaceSearch]` lines.
8. Check the Next.js terminal for `[routes/routes]` and `[weather/google]` lines.
9. Share the output of all three in the next handoff.

**Key distinction:** The saved/recent place list appears when the input field is empty. Once you start typing, the Google autocomplete suggestions appear in the dropdown. Pick from the typed suggestions, not the initial list.

## What each outcome means

| Browser console shows | Next step |
|---|---|
| `(google)` + real `placeId` for both | Check server terminal for `"placeId"` type — if still `"latLng"`, bug is in FerdalagidClient or route fetch body |
| `(google)` + `place.id was null/undefined` | `place.id` is null from Google SDK — check if `id` needs to be in `fetchFields` |
| `(server fallback)` for either | Google autocomplete timed out or failed; server fallback ran; `placeId` may or may not be in result |
| `(saved place)` for either | Confirms this was the cause — repeat test choosing from typed dropdown |

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 58 files, 1883 passed, 27 skipped, 8 todo — all green
```

## Files changed

- `components/weather/PlaceSearch.tsx`
- `app/api/teskeid/weather/travel/routes/route.ts`

## No changes to

- SQL, RLS, auth, Supabase, saved-places schema
- Provider logic, fingerprinting, threshold, weather scoring
- Deployment config
