# TODO 086 v377 - Claude handoff: v376 B0.1 cleanup done, prerelease

Created: 2026-07-17 05:55
Timezone: Atlantic/Reykjavik
Author: Claude

Related handoffs:
- `2026-07-16-2352-todo-086-v375-claude-v374-done-prerelease.md` (Phase B implementation)
- `2026-07-17-0000-todo-086-v376-codex-v375-extra-prerelease-review.md` (Codex review)

## Status

B0.1 cleanup implemented. All 4 Codex v376 findings addressed. File changes only — not committed or pushed per workflow.

49/49 tests pass. Type-check clean.

---

## Changes in this pass

### `components/weather/ProviderStationPreviewCard.tsx` (NEW)

Extracted from the file-private `RouteStationPreviewCard` in `RouteSelectionStep.tsx`.

Provider-neutral shell: takes `providerLabel: string` as a prop so the same card can serve Vegagerðin and future providers without hardcoded brand names.

Props:
```ts
{
  station: ProviderStationPoint
  providerLabel: string   // e.g. tf('providerVedurstofanLabel') — caller supplies
  locale: string
  onClose: () => void
  returnTo: string        // passed as prop, not hardcoded — enables context-aware returnTo later
}
```

Internals unchanged from v375:
- `selectUpcomingRows(station.forecastRows, 3)` → `ForecastRowLine` × up to 3
- `VedurstofanPulseInline` with caller-supplied `returnTo`
- 40px close button (`h-10 w-10 flex items-center justify-center`)
- `stationDistanceFromRoute` i18n key for distance display

### `components/weather/RouteSelectionStep.tsx`

- Removed file-private `RouteStationPreviewCard` function
- Removed `ForecastRowLine`, `selectUpcomingRows`, `VedurstofanPulseInline` imports (now in `ProviderStationPreviewCard`)
- Replaced import with `ProviderStationPreviewCard` from `./ProviderStationPreviewCard`
- Updated preview card render to pass `providerLabel={tf('providerVedurstofanLabel')}` and `returnTo="/auth-mvp/vedrid"` explicitly

Before:
```tsx
<RouteStationPreviewCard
  station={selectedStation}
  locale={locale}
  onClose={() => setSelectedStation(null)}
/>
```

After:
```tsx
<ProviderStationPreviewCard
  station={selectedStation}
  providerLabel={tf('providerVedurstofanLabel')}
  locale={locale}
  onClose={() => setSelectedStation(null)}
  returnTo="/auth-mvp/vedrid"
/>
```

### `lib/__tests__/weather-provider-stations.test.ts`

Renamed misleading test:

Before: `"returns 403 when access required and user is signed out"`

After: `"returns 401 when access required and signed-out user is blocked by base weather access"`

Comment added: "Gate 1 (base weather) blocks signed-out users in Authenticated mode before Gate 2 (provider) runs"

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Expanded `downsampleRoutePoints` comment to be honest about output size and limitations:

- Clarifies that output may be up to `stride+1` points larger than `maxPoints` (not strictly `≤500`)
- Notes that uniform stride can chord over curves/fjords
- Names Ramer-Douglas-Peucker as the future geometry-preserving alternative

---

## v376 findings addressed

1. **RouteStationPreviewCard extracted** — now `ProviderStationPreviewCard` in `components/weather/`, shared and provider-neutral. Addresses the "same idea built in multiple places" concern ahead of Vegagerðin.

2. **Hardcoded "Veðurstofan" replaced** — `tf('providerVedurstofanLabel')` passed as `providerLabel` prop. The card itself has no provider-specific strings.

3. **Test renamed** — name now matches assertion (401, not 403).

4. **Downsampling comment clarified** — honest about stride behaviour and future improvement path (RDP).

---

## Test results

```
npm run type-check → passed

npm run test:run -- lib/__tests__/weather-provider-stations.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/providerRouteMatching.test.ts
→ 3 files, 49/49 passed
```

---

## Pending localhost verification (Stebbi)

Same as v375 — no new visible behavior in this pass, only architecture cleanup:

1. Opna `/vedrid` á mobile-breidd (360 px).
2. Staðfesta að "Veðurstofan" toggle pill birtist yfir kortið — ON by default.
3. Velja Reykjavík → Selfoss. Gráar stöðvamerkjur eiga að birtast.
4. Smella á stöð — preview opnast undir kortinu með station name, "Veðurstofan" badge, distance, forecast rows, Púls.
5. Slökkva á toggle — merkjur og preview hverfa.
6. Skipta um leiðarvalkost — preview lokar og merkjur uppfærast.
7. Fara á result step — lokaniðurstaða óbreytt.
8. Velja langa leið (t.d. Reykjavík → Egilsstaðir) — stöðvar birtast (downsampling virkar).
9. Prófa notanda með `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` án aðgangs — toggle sést ekki.

Engin SQL, RLS, Vercel env, migration, deployment, secrets eða production-data prófun í þessum pasa.

---

## Not changed

- `app/api/teskeid/weather/travel/provider-stations/route.ts`
- `lib/weather/providerRouteMatching.ts`
- `app/api/teskeid/weather/travel/route.ts`
- SQL, env, migrations, Vercel
