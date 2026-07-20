# Review: v230 Claude prerelease

Created: 2026-07-20 11:31  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Relevant TODO: 086  
Reviewed handoff: `2026-07-20-1115-todo-086-v230-claude-v229-done-prerelease.md`

## Findings

### 1. Blocker: `Nánar` from Veðurstofan nearby Vegagerðin can lose the back link

`app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx:55` builds:

```ts
const returnHref = `/auth-mvp/vedrid/puls/stod/${stationId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`
```

and then passes it to `vegagerdinPulseHref(...)`.

That means the Vegagerðin pulse page receives a `returnTo` pointing to another pulse page: `/auth-mvp/vedrid/puls/stod/{stationId}`.

But `lib/weather/pulseBack.ts` only allows these destinations:

- `/auth-mvp/vedrid`
- `/vedrid`
- `/auth-mvp/vedrid/ferdalagid`
- `/auth-mvp/vedrid/elta-vedrid`

It rejects pulse-to-pulse URLs, so `VegagerdinPulsClient` will likely render no back link. This breaks the v230 handoff claim that the nearby `Nánar` link is not a blind alley.

Recommended fix:

- Either extend `resolvePulseBackDestination()` with a safe internal `pulseStation` destination for:
  - `/auth-mvp/vedrid/puls/stod/{id}`
  - optionally `/auth-mvp/vedrid/puls/vegagerdin/stod/{id}`
- Or change `returnHref` to an already-allowed destination, e.g. original safe `returnTo` if present, otherwise `/auth-mvp/vedrid`.

If Stebbi specifically wants `Nánar` from a Veðurstofuspjald to return back to that Veðurstofuspjald, add the safe `pulseStation` branch. Do not loosen the whitelist broadly.

### 2. Blocker: simple-mode filter state does not match simple-mode marker colors/counts

`components/weather/WeatherOverviewClient.tsx:734` and `:774` collapse marker colors with `toSimpleWindDisplayStatus(...)`, but visibility still checks raw detailed statuses at `:736` and `:776`:

```ts
const isVisible = !isRouteFiltered && (visibleStatuses.size === 0 || visibleStatuses.has(status))
```

At the same time, `WindStatusFilterPills.tsx:18-21` groups simple pills:

- green = `innan-marka` + `nalgast-othaegindi`
- orange = `othaegilegt` + `nalgast-haettumork`
- red = `haettulegt`

This creates a mismatch. Example with the default `visibleStatuses` from `WeatherOverviewClient.tsx:111-113`:

- `nalgast-othaegindi` is visible and rendered as green in simple mode.
- true `innan-marka` is not visible.
- the green simple pill count includes both statuses and can look active, but the map does not show all stations counted by that green pill.

That means the user can see a simple green pill count that does not correspond to the visible green markers.

Recommended fix:

- Add a small helper in `WeatherOverviewClient.tsx` or `lib/weather/windDisplayStatus.ts`, e.g.:

```ts
function isVisibleInCurrentFilter(status: WindDisplayStatus): boolean {
  if (visibleStatuses.size === 0) return true
  if (statusFilterMode === 'simple') {
    const simpleStatus = toSimpleWindDisplayStatus(status)
    return [...visibleStatuses].some(st => toSimpleWindDisplayStatus(st) === simpleStatus)
  }
  return visibleStatuses.has(status)
}
```

- Use that same helper for:
  - Veðurstofan marker `isVisible`
  - Vegagerðin marker `isVisible`
  - `allMarkersHiddenByStatusFilter`
  - any selected-callout eligibility checks

This keeps pill grouping, counts, colors and visibility aligned.

### 3. Medium: Safnpúls target click can select the wrong provider layer

`app/api/teskeid/weather/vedurpuls/feed-preview/route.ts:37-41` intentionally returns both `vegagerdin_station` and `vedurstofan_station`.

But `components/weather/WeatherOverviewClient.tsx:878-891` renders the feed from `vegagerdinProvider` and calls:

```ts
onSelectTarget={target => ctx.onSelectMarker(target.targetId)}
```

Because that `ctx` belongs to the Vegagerðin provider, clicking a Veðurstofan feed item selects `vegagerdin:{vedurstofanStationId}` instead of `vedurstofan:{stationId}`. The `targetHref` right below it already infers the provider correctly; `onSelectTarget` should do the same.

This becomes more noticeable after v230 because marker selection now relies on InfoWindow and the old post-map detail fallback is gone.

Recommended fix:

- Extend `ProviderContentCtx` with a provider-aware selector, for example:

```ts
onSelectProviderMarker: (providerId: string, markerId: string | null) => void
```

- In `WeatherOverviewClient.tsx`, infer provider the same way as `targetHref`:

```ts
const effectiveProvider = target.provider ?? (target.targetType === 'vegagerdin_station' ? 'vegagerdin' : 'vedurstofan')
ctx.onSelectProviderMarker(effectiveProvider, target.targetId)
```

### 4. Medium: InfoWindow should close if its anchor marker is unavailable or hidden

`components/weather/IcelandOverviewMap.tsx:262-264` returns early when the marker registry has no anchor:

```ts
const anchor = markerRegistryRef.current.get(key)
if (!anchor) return
```

That can leave a previously opened InfoWindow visible if selection changes to a callout whose marker cannot be anchored. Also, after status filtering, marker objects can still exist in the registry but be `visible=false`.

Recommended fix:

- Close on missing anchor:

```ts
if (!anchor) {
  infoWindowRef.current?.close()
  return
}
```

- Also close or avoid building callouts for status-filter-hidden markers. The helper from finding 2 can handle most of this.

### 5. Low: InfoWindow uses hardcoded blue link instead of Teskeið token

`components/weather/IcelandOverviewMap.tsx:292-295` sets:

```ts
linkEl.style.cssText = 'color:#2563eb;text-decoration:underline'
```

This is not a functional blocker, but it drifts from `Design.md`, where primary action color should use Teskeið semantic tokens. Since this is DOM content outside React/Tailwind, either use the primary hex from tokens or add a small class/CSS hook if practical.

## What Looks Good

- `npm run type-check` passed in Codex review.
- `npm run test:run` passed in Codex review: 118 files passed, 3424 tests passed, 27 skipped, 8 todo.
- The new Veðurstofan pulse text direction matches Stebbi's request.
- `pulseLegacyNote` was removed from the Veðurstofan pulse header.
- Empty legacy prompt is no longer shown when there are no messages.
- Nearby Vegagerðin data is provider-gated with `checkChatAccess(user, { provider: 'vegagerdin' })`.
- Nearby Vegagerðin uses `readVegagerdinCurrentWithHistoryFallback()`, not a live upstream fetch.
- Latest note handling uses `limit=1` on the Veðurstofan page and `.at(-1)` in InfoWindow, which avoids the preview ordering trap.
- DOM content for InfoWindow uses `textContent`, not unsafe `innerHTML`.
- No RLS, grant or SQL execution occurred in this v230 implementation.

## Release Recommendation

Do not release v230 exactly as-is.

Recommended minimum before release:

1. Fix pulse-to-pulse `returnTo` or change the nearby `Nánar` return target to an allowed safe URL.
2. Align simple-mode status filtering with simple-mode marker colors/counts.
3. Fix safnpúls `onSelectTarget` provider selection.
4. Add the small InfoWindow close-on-missing-anchor guard.

After those fixes, rerun:

```bash
npm run type-check
npm run test:run
```

Then Stebbi should do the browser checks below before deploy.

## Commands Run By Codex

```bash
git status --short
git diff --stat
git diff -- components/weather/IcelandOverviewMap.tsx
git diff -- components/weather/WeatherOverviewShell.tsx
git diff -- lib/weather/types.ts
git diff -- components/weather/WindStatusFilterPills.tsx
git diff -- components/weather/WeatherOverviewClient.tsx
git diff -- "app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx"
git diff -- "app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx"
git diff -- app/api/teskeid/weather/preferences/thresholds/route.ts sql/88_weather_user_preferences_status_filter_mode.sql
git diff --check
npm run type-check
npm run test:run
```

Results:

- `npm run type-check`: exit 0.
- `npm run test:run`: exit 0, 118 files passed, 3424 tests passed, 27 skipped, 8 todo.
- `git diff --check`: exit 0. It printed line-ending warnings for `.obsidian/workspace.json` and `components/weather/WindStatusFilterPills.tsx`, not whitespace errors.

## Design.md Check

Codex reread the relevant top-level `Design.md` guidance for UI review.

The implementation is mostly aligned:

- Mobile-first compact surfaces.
- No card-inside-card for the nearby Vegagerðin rows.
- New user-facing text went into `messages/is.json` and `messages/en.json`.
- InfoWindow avoids the previous floating bottom-left card.

Remaining design concern:

- The InfoWindow `Nánar` link uses hardcoded blue instead of Teskeið primary styling.
- Stebbi still needs mobile checks at 360, 390 and 460 px because Google InfoWindow can overflow or cover map controls in ways unit tests will not catch.

## Route Intelligence Check

This review touches `/vedrid`, provider station selection and route-filtered map behavior.

- No new route-memory schema was added in v230.
- No Google Routes content is stored.
- No route geometry, duration, distance or raw place ID persistence is introduced.
- Nearby Vegagerðin values are point-to-station context for a Veðurstofan station, not canonical route safety logic.
- No `IcelandRoadmap.md` update is required for the v230 implementation itself.
- The simple-mode filter issue does affect route-filtered displays because route-filtered station sets can be further filtered by status; fixing it should reuse one helper so route and non-route views behave the same.

## Supabase / SQL / Auth Review

- v230 does not require running SQL.
- `sql/88_weather_user_preferences_status_filter_mode.sql` remains untracked in the working tree from the broader branch, but Codex did not run it.
- The nearby Vegagerðin server read is correctly gated before data is passed to the Veðurstofan client.
- The `status_filter_mode` API has undefined-column fallback, so release before SQL88 should not break threshold saves. The mode will not persist in DB until SQL88 is run, but localStorage still works.
- Do not run SQL88 or any migration unless Stebbi explicitly approves it.

## Localhost Checks For Stebbi

After Claude Code fixes the findings:

1. Open `/auth-mvp/vedrid/puls/stod/{vedurstofanStationId}` as a user with both Veðurstofan and Vegagerðin access.
2. Confirm the old text `Vegaaðstæður eru nú skráðar...` is gone.
3. Confirm `Vertu fyrst/ur til að segja frá aðstæðunum` does not show for empty legacy messages.
4. Confirm the forecast card says `Spá Veðurstofu Íslands, gefin út kl. hh:mm`.
5. Confirm `Nálæg raungildi frá Vegagerðinni` shows up to three nearest Vegagerðin stations.
6. Click `Nánar` on a nearby Vegagerðin station.
7. Confirm the Vegagerðin pulse page has a working back link to the intended context.
8. Open `/vedrid`, switch between `Einfalt` and `Nánar`.
9. In simple mode, confirm the three status pills' counts match the visible marker colors.
10. Toggle each simple pill and confirm the map hides/shows the same group the pill labels.
11. Open the safnpúls drawer and click both a Vegagerðin feed target and a Veðurstofan feed target if both exist.
12. Confirm each target selects the correct provider marker and opens a callout attached to that marker.
13. Pan and zoom the map; InfoWindow should follow the marker and close cleanly when dismissed.
14. Test 360, 390 and 460 px widths. InfoWindow should not cover Google controls/attribution or cause horizontal overflow.
15. Test with a user without Vegagerðin access: the Veðurstofan pulse page must not show nearby Vegagerðin readings or links.

Do not test Supabase migrations, cron, production deploy or Vercel changes casually. Those require explicit Stebbi approval.

## Files Changed By Codex

Only this review file was added:

- `ai-handoff/2026-07-20-1131-todo-086-v231-codex-v230-prerelease-review.md`

Codex did not change app code, SQL, env, commits, pushes, deploys or production state.
