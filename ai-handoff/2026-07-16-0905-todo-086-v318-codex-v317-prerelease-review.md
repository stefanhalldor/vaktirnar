# 2026-07-16 09:05 - TODO-086 v318 - Codex review of v317 prerelease

Created: 2026-07-16 09:05
Timezone: Atlantic/Reykjavik

Review target: `2026-07-16-0904-todo-086-v317-claude-v315-v316-done-prerelease`

Scope: review only. Codex did not change product code, SQL, env, commits, deployment, migrations, or data.

## Findings

### Medium - Make sure the new resolver/test files are included in the commit

The v317 implementation imports a new resolver:

- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:9`
  imports `resolvePulseBackDestination` from `@/lib/weather/pulseBack`.

That file exists locally, but it is currently untracked:

- `lib/weather/pulseBack.ts`
- `lib/__tests__/pulseBack.test.ts`

This is normal during prerelease, but it is an easy release footgun: if Claude Code commits only tracked modifications and forgets the new files, build will fail because `@/lib/weather/pulseBack` will not exist in Git. Before commit, explicitly check `git status --short` and ensure these new files are staged.

This also applies to earlier untracked support files that are now imported by app code, especially:

- `components/chat/ScopedChatComposer.tsx`
- `lib/auth/loginNext.ts`
- `lib/__tests__/loginNext.test.ts`

### Low - `backToStationExplorer` copy is acceptable but not perfect

When full pulse is opened from `/auth-mvp/vedrid/elta-vedrid`, v317 labels the return link:

`Til baka í Veðurpúlsinn`

Technically that is truthful enough because the station explorer now contains pulse context. But the actual page title is still `Elta veðrið`, and the return URL is `/auth-mvp/vedrid/elta-vedrid?...`, not a dedicated Veðurpúls index page.

If Stebbi wants maximum clarity, consider one of these instead:

- `Til baka í stöðvayfirlit`
- `Til baka í Elta veðrið`

Not blocking. The important fix is that the route-result flow now says `Til baka í ferðalagið mitt` and no longer falls back to `/elta-vedrid` while pretending to return to a trip.

## What Looks Correct

- `lib/weather/pulseBack.ts:18-48` resolves a typed destination and returns `null` for absent, external, protocol-relative, non-slash, and unknown paths.
- Trip destinations are boundary-safe:
  - `/auth-mvp/vedrid`
  - `/auth-mvp/vedrid?...`
  - `/auth-mvp/vedrid#...`
- Station explorer destinations are boundary-safe:
  - `/auth-mvp/vedrid/elta-vedrid`
  - `/auth-mvp/vedrid/elta-vedrid?...`
  - `/auth-mvp/vedrid/elta-vedrid#...`
  - `/auth-mvp/vedrid/elta-vedrid/...`
- Lookalikes such as `/auth-mvp/vedrid-anything` and `/auth-mvp/vedrid/elta-vedrid-fake` are rejected in `lib/__tests__/pulseBack.test.ts:15-22`.
- `VedurstofanPulsClient` now renders the back link only when `backDest` exists:
  - `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:61-75`
- The label branches correctly:
  - `trip` -> `backToTrip`
  - `stationExplorer` -> `backToStationExplorer`
- No more static fallback to `/auth-mvp/vedrid/elta-vedrid?stationId=...` in the full pulse page.
- Existing route-card `returnTo` is still `/auth-mvp/vedrid`, so route-result pulse links should return to the route page and rely on same-tab `sessionStorage` restore:
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx:1128-1132`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx:218-299`
- The station explorer still passes its own station-specific return target, which is right for that source:
  - `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:389-392`
- `checkChatAccess()` uses `checkFeatureAccess(..., 'weather-provider-vedurstofan')`; because `checkFeatureAccess` now implements the provider graduation behavior, this should respect `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` rather than always requiring a row.

## Tests / Commands Reviewed

Codex read:

- `WORKFLOW.md`
- `Design.md` relevant navigation/mobile/input sections
- `ai-handoff/README.md`
- `ai-handoff/2026-07-16-0904-todo-086-v317-claude-v315-v316-done-prerelease.md`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`
- `lib/weather/pulseBack.ts`
- `lib/__tests__/pulseBack.test.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/VedurstofanPulseInline.tsx`
- `components/weather/VedurstofanPointCard.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `lib/chat/access.server.ts`
- `lib/weather/weatherBaseAccess.server.ts`
- `lib/auth/loginNext.ts`
- `lib/__tests__/loginNext.test.ts`
- relevant `messages/is.json` and `messages/en.json` keys

Codex did not run tests locally. Claude Code reports:

- `npx tsc --noEmit` clean.
- `npx vitest run lib/__tests__/pulseBack.test.ts` 15/15 pass.

## Recommendation

v317 is okay for localhost testing. I would not ask for more code before Stebbi tests the core flow.

Before commit/release, Claude Code should:

1. Confirm all new files are staged.
2. Optionally decide whether `backToStationExplorer` should say `Til baka í stöðvayfirlit` or `Til baka í Elta veðrið`.
3. Keep the rest out of scope.

## Localhost Checks For Stebbi

1. Public user: open `/vedrid`, calculate a route with Veðurstofan station cards visible, and click `Sjá fleiri skilaboð eða segja frá aðstæðum` on a station card.
   Expected: login opens with a pulse URL in `next`, carrying `returnTo=/auth-mvp/vedrid`.

2. Complete login as an existing user.
   Expected: full pulse page opens for the station.

3. On the full pulse page, check the top return link.
   Expected: it says `Til baka í ferðalagið mitt`.

4. Click `Til baka í ferðalagið mitt`.
   Expected: you land on `/auth-mvp/vedrid` and the same route result/calculations are restored. You should not land on `/auth-mvp/vedrid/elta-vedrid`.

5. Repeat as an already logged-in user with a route result open.
   Expected: same result without login in the middle.

6. Open `/auth-mvp/vedrid/elta-vedrid`, select a station, and open the full pulse.
   Expected: return link does not say `Til baka í ferðalagið mitt`; it returns to the station explorer with the selected station.

7. Open a full pulse URL directly without `returnTo`.
   Expected: no top return link is shown.

8. Mobile width around 390px.
   Expected: the top return link and header do not overflow or cause horizontal scroll.

## Óvissa / þarf að staðfesta

- Codex did not run tests or browser checks.
- The whole route restore still depends on same-tab `sessionStorage` and 30 minute TTL. Durable saved-trip return URLs are a separate future product step.
