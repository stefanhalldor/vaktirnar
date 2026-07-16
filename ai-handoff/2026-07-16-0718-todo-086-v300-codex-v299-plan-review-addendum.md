# 2026-07-16 07:18 - Codex review/addendum: v299 pulse graduation + v298 fixes

Created: 2026-07-16 07:18  
Timezone: Atlantic/Reykjavik  
Related TODO: todo-086  
Reviewed handoff: `2026-07-16-0716-todo-086-v299-claude-plan-pulse-graduation-and-v298-fixes.md`

## Findings

### Medium - Add Stebbi's stale-banner wording change to the same implementation

Stebbi wants the attention-box headline changed from:

> Veðurstofugögnin eru gömul

to:

> Ný gögn frá Veðurstofunni verða vonandi aðgengileg fljótlega

This is the key:

- `messages/is.json`: `teskeid.vedrid.ferdalagid.vedurstofanDataStale`
- currently rendered in `app/auth-mvp/vedrid/FerdalagidClient.tsx:1044-1047`

Do not change the small station-card stale label `vedurStofanStale: "gömul gögn"` unless Stebbi explicitly asks. This request is for the attention box / stale banner headline.

Recommended English text:

```json
"vedurstofanDataStale": "New data from Veðurstofan should hopefully be available soon"
```

### Medium - v299 pulse graduation plan is directionally right, but tests must be updated

The runtime reads of `WEATHER_PULSE_ACCESS_REQUIRED` appear to be only:

- `lib/loans/guard.ts`
- `lib/chat/access.server.ts`

But tests and comments explicitly expect the old `false = open` behavior:

- `lib/__tests__/chat-access.test.ts`
- likely `lib/__tests__/guard.test.ts` should also get coverage for weather-pulse if missing

Claude Code should update tests so the new contract is locked:

- unset / absent = open to signed-in users who pass weather + Veðurstofan + chat gates
- `WEATHER_PULSE_ACCESS_REQUIRED=true` = per-user `weather-pulse` row required
- `WEATHER_PULSE_ACCESS_REQUIRED=false` should behave like unset/open during the transition, unless Claude Code intentionally wants only absent/open and documents that

I recommend treating any value other than explicit `'true'` as open, matching the new Veðurstofan provider graduation pattern.

### Medium - Manual refresh UI can use existing `isGuest` directly, but this is not a full permission check

`FerdalagidClient` already has `isGuest`:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:97-103`

So the smallest correct UX fix is:

```ts
const showVedurstofanRefreshButton = !isGuest
  && !isVedurstofanDataFresh
  ...
```

That prevents public users from seeing a dead button.

Important nuance: backend still remains the source of truth. A signed-in user can still be denied by `/api/teskeid/weather/vedurstofan/refresh` if they lack required provider access. If that becomes a visible problem after graduation, add a real `canManualRefreshVedurstofan` access check. For this pass, `!isGuest` is enough to fix the public bug Stebbi saw.

### Medium - Route-selection zoom target is confirmed

`/elta-vedrid` currently uses:

- `zoom: 5`
- `map.fitBounds(stationBounds, { top: 32, bottom: 32, left: 32, right: 32 })`

Source:

- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:112-128`

`/vedrid` route-selection uses:

- `zoom: 6`
- `fitBounds(routeBounds, { top: 48, bottom: 48, left: 48, right: 48 })`
- single-point zoom `10`

Source:

- `components/weather/RouteSelectionStep.tsx:126-129`
- `components/weather/RouteSelectionStep.tsx:246-254`

Recommended implementation:

- Set initial `zoom: 5`.
- Consider reducing route-selection fitBounds padding from 48 to 32, or only doing this if it matches the desired mobile framing.
- Test public `/vedrid` first step with no route, one selected place, and both selected places.

### Low - v299 filename and Created timestamp do not match

The file is named `0716` but says `Created: 2026-07-16 07:20`. That is minor and not worth blocking implementation, but it violates the timestamp discipline in `WORKFLOW.md`. Keep future handoffs consistent.

## Answers To Claude Code's Questions

1. Runtime reads of `WEATHER_PULSE_ACCESS_REQUIRED`: yes, the important runtime locations are `lib/loans/guard.ts` and `lib/chat/access.server.ts`. Admin UI displays the flag name, and tests/comments need updates.

2. `FerdalagidClient` has `isGuest` available as a prop at lines 97-103. Use it for the public refresh-button hide.

3. `/elta-vedrid` map uses `zoom: 5` and `fitBounds(..., 32px padding)`. `/vedrid` route-selection uses `zoom: 6` and `fitBounds(..., 48px padding)`.

4. Tests referencing `WEATHER_PULSE_ACCESS_REQUIRED=false` must be updated. Especially `lib/__tests__/chat-access.test.ts`.

## Recommended Next Implementation Scope

Claude Code should implement these in one focused pass:

1. Flip `WEATHER_PULSE_ACCESS_REQUIRED` to the same graduation pattern as Veðurstofan:
   - explicit `'true'` = per-user gate
   - absent/deleted = open
   - non-`true` values, including old `'false'`, open during transition

2. Hide manual Veðurstofan refresh button for public users:
   - use existing `isGuest` in `FerdalagidClient`
   - keep backend auth check unchanged

3. Adjust `/vedrid` route-selection map:
   - initial zoom aligned with `/elta-vedrid`
   - verify fitBounds padding on mobile

4. Change the stale banner headline text:
   - IS: `Ný gögn frá Veðurstofunni verða vonandi aðgengileg fljótlega`
   - EN: `New data from Veðurstofan should hopefully be available soon`

5. Update tests and comments for the new env contract.

## Localhost Checks For Stebbi

After implementation:

1. Set:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
TESKEID_CHAT_ENABLED=true
```

Remove both:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
WEATHER_PULSE_ACCESS_REQUIRED
```

2. Signed-out `/vedrid`:
   - Veðurstofan can appear.
   - Public user does not see `Sækja ný gögn`.
   - Empty Veðurpúls component is hidden.
   - Existing pulse preview can be visible if messages exist.

3. Signed-in `/vedrid`:
   - Veðurstofan appears.
   - Veðurpúls composer appears for station cards.
   - If stale banner appears, headline says: `Ný gögn frá Veðurstofunni verða vonandi aðgengileg fljótlega`.

4. Set:

```env
WEATHER_PULSE_ACCESS_REQUIRED=true
```

Restart. Signed-in user without `weather-pulse` row should not get composer.

5. First route-selection map on `/vedrid`:
   - initial map is less zoomed-in and shows Iceland context.
   - after origin/destination selection, route remains readable and not over-zoomed.

## Óvissa / þarf að staðfesta

- I did not run tests.
- I did not inspect every generated Vercel/runtime env value. Stebbi still needs redeploy after env changes in Vercel.
- If product wants manual refresh open to all signed-in users after provider graduation, backend refresh route may also need a policy decision later; for this pass, hide public UI only.
