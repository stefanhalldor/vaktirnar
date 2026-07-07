# 2026-07-06-1125-todo-067-v078-codex-v077-interactive-map-review

Created: 2026-07-06 11:25  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Scope: Review of `2026-07-06-1115-todo-067-v077-claude-v076-interactive-map-done.md` and related code. Codex changed only this review file. No app code, SQL, Supabase, env, commit, push, deploy, or production changes were made.

## Findings

### P1 - Interactive markers likely fail at runtime because `Marker` is loaded from the wrong library

Files:

- `components/weather/TravelAuditMap.tsx:6`
- `components/weather/TravelAuditMap.tsx:68`
- `components/weather/TravelAuditMap.tsx:120`
- `lib/weather/googleMaps.client.ts:30-36`

`TravelAuditMap` loads only `loadMapsLibrary()` and then creates markers with:

```ts
const marker = new (mapsLib as any).Marker(...)
```

But local `@types/google.maps` confirms:

- `MapsLibrary` has `Map`, `Polyline`, etc.
- `MarkerLibrary` has `Marker`, `AdvancedMarkerElement`, `PinElement`, etc.

The `any` cast hides this from TypeScript. If `mapsLib.Marker` is undefined in the browser, marker creation throws, the catch sets `mapError`, and the UI silently falls back to the static map. That means the main v076 goal, interactive weather points, may not actually appear even though type-check, tests and build pass.

Recommended fix:

1. Add `loadMarkerLibrary()` in `lib/weather/googleMaps.client.ts`:

```ts
export async function loadMarkerLibrary(): Promise<google.maps.MarkerLibrary> {
  ensureInitialized()
  return importLibrary('marker') as Promise<google.maps.MarkerLibrary>
}
```

2. In `TravelAuditMap`, load both:

```ts
const [mapsLib, markerLib] = await Promise.all([
  loadMapsLibrary(),
  loadMarkerLibrary(),
])
```

3. Create markers with:

```ts
const marker = new markerLib.Marker(...)
```

Using classic `Marker` is acceptable for now if Claude Code wants to avoid `AdvancedMarkerElement` + `mapId` risk. The important part is that the marker class comes from the marker library, not from `MapsLibrary`.

### P2 - `LatLngBounds` should not rely on a vague global side effect

Files:

- `components/weather/TravelAuditMap.tsx:96-100`

v077 asks whether this is acceptable:

```ts
const bounds = new google.maps.LatLngBounds()
```

Local `@types/google.maps` documents `LatLngBounds` as a core library class:

```ts
const {LatLngBounds} = await google.maps.importLibrary("core")
```

This may work after maps load, but the implementation should avoid relying on "some import makes all globals available" for correctness.

Recommended fix:

- Add `loadCoreLibrary()` if needed:

```ts
export async function loadCoreLibrary(): Promise<google.maps.CoreLibrary> {
  ensureInitialized()
  return importLibrary('core') as Promise<google.maps.CoreLibrary>
}
```

- Then use:

```ts
const [mapsLib, markerLib, coreLib] = await Promise.all([
  loadMapsLibrary(),
  loadMarkerLibrary(),
  loadCoreLibrary(),
])
const bounds = new coreLib.LatLngBounds()
```

If Claude Code confirms `mapsLib` itself exposes a typed `LatLngBounds`, use that. Do not keep the current untyped global assumption without checking in localhost.

### P2 - The mount-only effect warning is still present and the stated remount guarantee is not quite true

Files:

- `components/weather/TravelAuditMap.tsx:59-154`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:437-445`

Build still reports:

```txt
components/weather/TravelAuditMap.tsx
154:6 Warning: React Hook useEffect has missing dependencies: 'highlightedIssue', 'routePoints', 'tf', and 'weatherPoints'.
```

v077 says this is intentionally safe because the component remounts on new results via "parent key change", but the rendered component currently has no `key`:

```tsx
<TravelAuditMap ... />
```

Current submit flow does call `setResult(null)` before fetching, so a normal new submit probably unmounts the map. Still, the implementation and the handoff disagree, and the lint suppression did not actually suppress the warning.

Recommended fix:

- Add an explicit key in the parent:

```tsx
<TravelAuditMap
  key={result.id}
  ...
/>
```

- Either include the missing dependencies and make reinitialization safe, or move the eslint disable so it actually suppresses the warning and add a code comment that references the explicit `key`.
- If including dependencies, reset `selectedIndex` to `initialSelectedIndex(weatherPoints, highlightedIssue)` when input data changes.

This is not as severe as the marker library bug, but it is exactly the kind of stale-map issue that can become confusing later.

### P2 - QA handoff names the wrong browser env var

File:

- `ai-handoff/2026-07-06-1115-todo-067-v077-claude-v076-interactive-map-done.md:65`

v077 says:

```txt
If NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set...
```

The code uses:

```txt
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
```

This is easy to correct in the next handoff. It matters because Stebbi is actively setting these keys by hand and the wrong name sends him hunting in the wrong place.

### P2 - Green result needs "when does this route next become risky?"

Context from Stebbi after viewing localhost:

When the current result is green, e.g. Garðabær → Akranes:

```txt
Ferðaveður lítur vel út
Ferðin frá kl. 11:24 lítur vel út veðurfarslega.
```

This is correct but incomplete. The user also needs practical forward-looking context:

> When, on this same route, does it next become questionable or risky to drive?

Product requirement:

- If current departure is green, show a small line/card telling the user the next time the same route becomes `gult` or `rautt` within available forecast coverage.
- If no future warning exists within the supported forecast window, say that plainly.
- This must be deterministic. Do not ask AI to infer it.
- Use the same route, same sampled weather points, same trailer setting, same thresholds, and same travel duration.

Suggested Icelandic copy:

- If future caution exists:
  - `Næst verður varasamt að leggja af stað um kl. {time}.`
  - `Ástæða: {reason} við {place/distance}.`
- If no caution exists:
  - `Engin varúð sést á þessari leið í spánni næstu {hours} klst.`

Recommended data model:

Add a small field to `TravelPlan.outbound`, for example:

```ts
nextCaution?: {
  departureIso: string
  arrivalIso: string
  status: Exclude<WeatherStatus, 'graent'>
  reasonCode?: string
  issue?: TravelIssue
}
```

Implementation guidance:

- In `checkTravelWeather`, after calculating the current/best result, scan future departure candidates from the relevant starting point:
  - start at current `earliestDeparture` rounded/stepped to the next hour after the current assessed departure
  - step hourly
  - stop when the forecast data can no longer cover the full drive window, or at a conservative cap such as 48 hours
- For each future departure:
  - arrival = departure + route duration
  - use `evaluateCandidate(...)`
  - first candidate with `status !== 'graent'` becomes `nextCaution`
- Build `nextCaution.issue` with the same issue-building logic used for highlighted issues, but do not let it change the current overall `stada`.
- If `latestArrivalBy` window mode already generates outbound candidates, reuse those candidates where possible instead of duplicating logic.
- Keep return-trip warnings separate. This new field answers "when does the outbound route next become risky if I leave later?"

UI placement:

- Show this below the main result text inside or just under the result card.
- It should be lower-key than the main status.
- On green status, it is highly useful.
- On yellow/red status, it can be omitted for this pass unless implementation is trivial.
- On the interactive map, if `nextCaution.issue` exists and there is no current highlighted issue, consider allowing the map to select/show that point as "Næsta varúð" rather than "Versti punktur". If this complicates v078, keep map behavior unchanged and only add the text line first.

Tests to add:

- Current departure green, future departure yellow due to wind: `travelPlan.outbound.nextCaution` exists and has the future departure time.
- Current departure green, future departure yellow due to precipitation `> 1.0 mm/klst`: next caution reason is precipitation.
- No future warning within forecast coverage: `nextCaution` is undefined and UI shows the "no warning in forecast window" copy.
- Current result status remains green even when `nextCaution` exists.

### P3 - Minor UI polish: units/date copy should be handled intentionally

Files:

- `components/weather/TravelAuditMap.tsx:263-274`
- `components/weather/travelAuditMap.helpers.ts:50-55`

Not blocking for localhost testing once P1 is fixed, but clean up if touching the file:

- `mm/klst` is hardcoded in the component. Existing app copy often uses this, but English UI will also show Icelandic `klst`. Either accept as a weather unit convention or add a message key.
- `formatKlTime()` uses UTC hours. Iceland is UTC year-round, so this is fine for Icelandic route weather. For multi-day forecast windows, consider showing date when not same day. This can wait unless Stebbi sees confusing output.

## Answers to Claude Code's review questions

1. Empty deps array: not acceptable as-is because the warning remains and the parent does not currently provide the claimed key. Add `key={result.id}` and either fix or intentionally suppress the warning correctly.
2. `new google.maps.LatLngBounds()` global: safer to explicitly import `core` and use `coreLib.LatLngBounds`, or use a typed export if available. Avoid vague global side-effect reliance.
3. Classic Marker vs AdvancedMarker: classic `Marker` is acceptable for now, but load it from `MarkerLibrary`.
4. `staticMapUrl` fallback: keep it. It is useful while Google JS/keys are flaky and reduces QA dead-ends.
5. `mm/klst` hardcoded: minor. Prefer translation/unit helper eventually; not a blocker.
6. `pointTimeLine`: `kl. HH:mm` is fine for same-day Icelandic forecast. Add date later if multi-day UX becomes confusing.

## Verification run by Codex

Commands:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-forecast.test.ts lib/__tests__/travelAuditMap.helpers.test.ts
npm run build
```

Results:

- `npm run type-check`: exit 0.
- Targeted tests: exit 0, 3 files passed, 81 tests passed, 5 skipped.
- `npm run build`: exit 0.

Build warnings still include:

- pre-existing `app/s/[sessionId]/page.tsx` hook warnings
- pre-existing `components/landing/Avatar.tsx` `<img>` warning
- new `components/weather/TravelAuditMap.tsx` missing deps warning

## Recommended follow-up for Claude Code

Do a small v078 fix pass, not a redesign:

1. Add `loadMarkerLibrary()` to `lib/weather/googleMaps.client.ts`.
2. Optionally add `loadCoreLibrary()` for `LatLngBounds`.
3. Update `TravelAuditMap` to load `maps`, `marker`, and optionally `core`.
4. Replace `(mapsLib as any).Marker` with `markerLib.Marker`.
5. Remove or reduce `any` refs where practical:
   - `useRef<google.maps.Marker[]>([])`
   - `useRef<google.maps.Polyline | null>(null)`
6. Add `key={result.id}` to `TravelAuditMap` in `FerdalagidClient`.
7. Fix the `react-hooks/exhaustive-deps` warning honestly or suppress it in a way that actually works and is justified by the explicit key.
8. Correct `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` in the next handoff/local QA text.
9. Add the green-result "next route caution" field and UI line described above.
10. Re-run type-check, targeted tests and build.

## Localhost checks for Stebbi

Do not spend much time on full UX QA before Claude Code fixes P1. After P1 is fixed:

1. Open `/auth-mvp/vedrid`.
2. Submit a route that previously returned a static audit map.
3. Expected:
   - Interactive map appears, not static fallback.
   - Multiple weather point markers are visible.
   - Route line is visible.
4. Click/tap several weather point markers.
5. Expected:
   - Selected point panel updates each time.
   - Worst point is initially selected when one exists.
6. Test a route/time that is green now but has worse weather later in the forecast.
7. Expected:
   - Result remains green for current departure.
   - A small line/card says when the route next becomes varasamt/gult/rautt.
   - It explains the reason, e.g. wind, gusts or precipitation.
8. Test a route/time with no future warning in the forecast window.
9. Expected:
   - UI says no warning is visible in the forecast window.
10. Open DevTools Console.
11. Expected:
   - No `mapsLib.Marker is not a constructor` or marker-library related error.
12. Temporarily remove/disable browser key only if convenient.
13. Expected:
   - Static fallback appears.

No SQL, Supabase, env changes, production checks, commit, push or deploy are part of this review.

## Suggested single message for Stebbi to send Claude Code

Claude Code, lestu og lagaðu findings í `ai-handoff/2026-07-06-1125-todo-067-v078-codex-v077-interactive-map-review.md`.

Það er eitt blocker atriði: interactive map notar `new (mapsLib as any).Marker(...)` en `Marker` kemur úr `MarkerLibrary`, ekki `MapsLibrary`. Þetta getur valdið því að v2 kortið detti alltaf í static fallback þó type-check/build séu græn. Bættu við `loadMarkerLibrary()` og notaðu `markerLib.Marker`. Skoðaðu líka hvort `LatLngBounds` eigi að koma úr `core` library, bættu `key={result.id}` á `TravelAuditMap`, og lagaðu eða réttlætanlega suppressaðu hook deps warningið.

Stebbi vill líka að græn niðurstaða segi hvenær á sömu leið verður næst varasamt að keyra. Bættu við deterministic `nextCaution`/sambærilegu fyrir outbound leiðina: skannaðu framtíðarbrottfarir í spágögnum með sömu leiðarpunktum, sama trailer setting og sömu thresholds, og sýndu litla línu/card í UI: annaðhvort `Næst verður varasamt að leggja af stað um kl. {time}` með ástæðu, eða `Engin varúð sést á þessari leið í spánni næstu {hours} klst.` Ekki láta þetta breyta current green status.

Ekki breyta weather decision logic, thresholds, SQL, Supabase, env, production, commit, push eða deploy. Keyrðu type-check, targeted tests og build og skilaðu stuttu handoffi með localhost checks.
