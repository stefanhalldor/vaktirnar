# 2026-07-16 09:19 - TODO-086 v320 - Claude: v318/v319 done, prerelease

Created: 2026-07-16 09:19
Timezone: Atlantic/Reykjavik

Implements: `2026-07-16-0905-todo-086-v318-codex-v317-prerelease-review.md` (staging note only, no code)
Implements: `2026-07-16-0909-todo-086-v319-codex-map-overlay-pulse-returnto-fix.md` (returnTo threading)
Implements: user request: unify all three Veðurstofan card display contexts under same VedurstofanPointCard API

## What Changed

### 1. `components/weather/VedurstofanPointCard.tsx`

Removed `VedurstofanJourneySummary` as a separate exported component. Its rendering logic now lives inside `VedurstofanPointCard` as `variant="compact"`.

New props on `VedurstofanPointCard`:

```ts
ftimeIso?: string | null    // forecast row time for compact ftimeLabel display
windMs?: number | null      // wind speed for compact summary line
variant?: 'compact' | 'full'  // default: 'full'
```

When `variant='compact'`: renders the inline `section.grid` "Á leiðinni" layout. No pulse (consistent with v304 decision — compact summary is not an inspection surface).

When `variant='full'` (default): renders the existing rounded card with forecast rows and pulse. Unchanged.

`buildVedurstofanPointDisplayModel` is now called with `ftimeIso` only for the compact variant:

```ts
const model = buildVedurstofanPointDisplayModel(
  station, etaIso, variant === 'compact' ? (ftimeIso ?? null) : null
)
```

The model destructuring was extended to include `etaTimeLabel` and `ftimeLabel` (already present in the model type, previously unused by `VedurstofanPointCard`).

### 2. `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Import updated — `VedurstofanJourneySummary` removed:

```ts
// before
import { VedurstofanPointCard, VedurstofanJourneySummary } from '@/components/weather/VedurstofanPointCard'
// after
import { VedurstofanPointCard } from '@/components/weather/VedurstofanPointCard'
```

"Á leiðinni" worst-point usage replaced:

```tsx
// before
<VedurstofanJourneySummary
  station={worstVedurstofanData.station}
  status={worstVedurstofanData.status}
  etaIso={worstVedurstofanData.etaIso}
  ftimeIso={worstVedurstofanData.ftimeIso}
  windMs={worstVedurstofanData.windMs}
  originName={origin?.name ?? ''}
/>

// after
<VedurstofanPointCard
  variant="compact"
  station={worstVedurstofanData.station}
  status={worstVedurstofanData.status}
  etaIso={worstVedurstofanData.etaIso}
  departureIso={referenceDepartureIso}
  ftimeIso={worstVedurstofanData.ftimeIso}
  windMs={worstVedurstofanData.windMs}
  originName={origin?.name ?? ''}
  returnTo={vedurstofanReturnTo}
/>
```

Previously missing: `departureIso` and `returnTo`. Both are now passed.

## Three Display Contexts — State After v320

All three now use `VedurstofanPointCard` with the same API and the same context props.

| Context | Variant | returnTo | departureIso | ftimeIso | windMs | pulse shown |
|---|---|---|---|---|---|---|
| "Á leiðinni" worst point | compact | vedurstofanReturnTo | referenceDepartureIso | worstVedurstofanData.ftimeIso | worstVedurstofanData.windMs | no (per v304) |
| Map overlay selected/worst (TravelAuditMap) | full | vedurstofanReturnTo | referenceDepartureIso | — | — | yes |
| "Allir spápunktar" list | full | vedurstofanReturnTo | referenceDepartureIso | — | — | yes |

`vedurstofanReturnTo` is defined in `FerdalagidClient.tsx:1130`:

```ts
const vedurstofanReturnTo = (step === 'result' && result)
  ? '/auth-mvp/vedrid'
  : undefined
```

It is only set when a route result is active. The pulse CTA is therefore absent when there is no result, which is correct.

## v318 Staging Note (no code)

v318 flagged that `lib/weather/pulseBack.ts` and `lib/__tests__/pulseBack.test.ts` were untracked. These files are new (added in v317) and must be explicitly staged before commit. Same applies to other new untracked files: `components/chat/ScopedChatComposer.tsx`, `lib/auth/loginNext.ts`, `lib/__tests__/loginNext.test.ts`. Claude Code must run `git status --short` before committing to confirm all new files are staged.

## Type Check

`npx tsc --noEmit` — clean, no errors.

## Files Changed

- `components/weather/VedurstofanPointCard.tsx` — removed `VedurstofanJourneySummary`, added `variant/ftimeIso/windMs` props, added compact rendering branch
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — updated import, replaced worst-point card with `VedurstofanPointCard variant="compact"`

## Files NOT Changed

- `components/weather/TravelAuditMap.tsx` — `vedurstofanReturnTo` threading was already done in v319 (previous session). No further changes needed.
- `lib/weather/pulseBack.ts` — correct, no changes
- `lib/__tests__/pulseBack.test.ts` — 15/15 pass, no changes
- SQL, env, auth, chat access, realtime — no changes

## What Was Not Done (by design)

- Compact variant does not show `VedurstofanPulseInline`. This is intentional: v304 was a production hotfix where Stebbi explicitly said the pulse should not appear in "Á leiðinni". The compact variant is a compact decision summary, not an inspection surface. The `returnTo` prop is accepted so the API is uniform, but it is not forwarded to a pulse component in compact mode.
- `ftimeIso` and `windMs` are not used in the full card variant. The full card uses the `selectPrevUsedNext` algorithm and renders prev/used/next forecast rows directly. These props are accepted so the call site can pass the full context without conditional logic, but they are ignored in `variant='full'`.

## Localhost Checks For Stebbi

Setup: `WEATHER_ENABLED=All`, `TESKEID_CHAT_ENABLED=true`, Veðurstofan access open (no `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` or left unset).

### 1. "Á leiðinni" compact card (worst point)

1. Open `/vedrid`, calculate a route where Veðurstofan is visible (Veðurstofan-only mode or Veðurstofan decisive).
2. Inspect the "Á leiðinni" section below the scrubber.
   - Expected: same layout as before — station name, wind badge, distance, forecast time, disclaimer box.
   - Expected: no pulse/composer/chat visible here (same as v305 hotfix).
   - Expected: visual appearance is pixel-identical to what it was before this change.

### 2. "Allir spápunktar" full cards

1. Same route result. Scroll to "Allir spápunktar".
2. Open a Veðurstofan station card.
   - Expected: full card with rounded border, forecast rows, source link, and pulse CTA.
   - Expected for logged-in user: pulse composer visible.
   - Expected for public user: pulse messages shown if any exist, empty state otherwise.

### 3. Map overlay card (selected/worst station)

1. Same route result. Tap a Veðurstofan marker on the map.
2. The overlay panel shows a `VedurstofanPointCard` (full variant).
   - Expected: card with pulse CTA.

### 4. returnTo context from compact worst-point card (NEW)

This context did not have `returnTo` before v320. The compact card still does not show pulse, so this is not directly user-visible — but confirms the prop is wired for future use and does not break anything.

### 5. returnTo context from map overlay (v319 fix, confirm still works)

1. Public user: calculate a route, tap a Veðurstofan marker in the map overlay, click `Sjá fleiri skilaboð eða segja frá aðstæðum`.
2. Login flow opens with `next` carrying `returnTo=/auth-mvp/vedrid`.
3. After login: full pulse page for the station.
   - Expected: "Til baka í ferðalagið mitt" link visible.
4. Click the link.
   - Expected: returns to `/auth-mvp/vedrid` and restores the same route result from sessionStorage.

### 6. returnTo context from "Allir spápunktar" (existing, confirm still works)

Same flow as check 5, but from an "Allir spápunktar" full card. Expected: same result.

### 7. Station explorer — no regression

1. Open `/auth-mvp/vedrid/elta-vedrid`, select a station, open full pulse.
   - Expected: back link does NOT say "Til baka í ferðalagið mitt". It should say "Til baka í Veðurpúlsinn" (station explorer context).

### 8. Direct pulse URL — no regression

1. Open `/auth-mvp/vedrid/puls/stod/32097` directly (no `returnTo`).
   - Expected: no back link shown.

## Óvissa / þarf að staðfesta

- Visual regression on "Á leiðinni" was not browser-tested. The rendering code is identical to the removed `VedurstofanJourneySummary` — same JSX, same class names, same translation keys. Risk of visual difference is low but Stebbi should confirm on localhost.
- `departureIso` is now passed to the compact variant but is not rendered there (compact shows only `stationName`, `windMs`, `ftimeLabel`, `etaTimeLabel`, `atimeIso`, disclaimer). This is correct: the compact card does not have a "Brottfarartími" line. The prop is accepted so the API is symmetric.
