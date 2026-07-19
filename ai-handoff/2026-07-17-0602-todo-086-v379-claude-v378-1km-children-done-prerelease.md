# TODO 086 v379 - Claude handoff: v378 1 km cutoff + children slot done, prerelease

Created: 2026-07-17 06:10
Timezone: Atlantic/Reykjavik
Author: Claude

Related handoffs:
- `2026-07-17-0555-todo-086-v377-claude-v376-b01-cleanup-prerelease.md` (B0.1 cleanup)
- `2026-07-17-0557-todo-086-v378-codex-v377-review-and-next-handoff.md` (Codex review + execution handoff)

## Status

1 km distance cutoff implemented with shared constant. `ProviderStationPreviewCard` now fully provider-neutral via `children` prop. File changes only — not committed or pushed per workflow.

50/50 tests pass. Type-check clean.

---

## Changes in this pass

### `lib/weather/providerRouteMatching.ts`

Added shared product-policy constant at top of file (before `ProviderRoutePoint` type):

```ts
export const DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000
```

Documented: "Used by both the route-selection provider-stations endpoint and the final travel route endpoint so both surfaces show the same stations. Change here to update both simultaneously."

### `app/api/teskeid/weather/travel/route.ts`

- Updated import: added `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M` from `@/lib/weather/providerRouteMatching`
- Removed local `VEDURSTOFAN_ROUTE_MAX_DISTANCE_M = 15_000` constant
- Replaced with `maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M` in `matchProviderPointsToRoute` call
- Added comment explaining the shared policy

### `app/api/teskeid/weather/travel/provider-stations/route.ts`

- Updated import: added `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M` from `@/lib/weather/providerRouteMatching`
- Removed local `PROVIDER_STATIONS_MAX_DISTANCE_M = 15_000` constant
- Replaced with `maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M` in `matchProviderPointsToRoute` call

Both endpoints now share the same constant — changing `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M` updates both simultaneously.

### `components/weather/ProviderStationPreviewCard.tsx`

Removed direct `VedurstofanPulseInline` import and `returnTo` prop. Added `children?: ReactNode` slot instead:

- Removed: `import { VedurstofanPulseInline } from './VedurstofanPulseInline'`
- Removed: `returnTo: string` prop
- Added: `children?: ReactNode` prop
- The provider-specific Púls section is now `{children}` at the bottom of the card
- Doc comment updated with usage example showing how callers pass `<VedurstofanPulseInline ...>` as a child

Card is now genuinely provider-neutral: no Veðurstofan-specific imports inside the shell.

### `components/weather/RouteSelectionStep.tsx`

- Added back `import { VedurstofanPulseInline } from './VedurstofanPulseInline'` (now owned by caller, not the card)
- Updated preview card usage:

```tsx
<ProviderStationPreviewCard
  station={selectedStation}
  providerLabel={tf('providerVedurstofanLabel')}
  locale={locale}
  onClose={() => setSelectedStation(null)}
>
  <VedurstofanPulseInline stationId={selectedStation.stationId} returnTo="/auth-mvp/vedrid" />
</ProviderStationPreviewCard>
```

### `lib/__tests__/weather-travel-api.test.ts`

- Updated `maxDistanceM` assertion from `15_000` to `1_000` with comment `// DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M`
- Added `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M: 1_000` to the `@/lib/weather/providerRouteMatching` vi.mock factory (required: endpoint imports the constant from the mocked module)

### `lib/__tests__/weather-provider-stations.test.ts`

- Added `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M: 1_000` to the `@/lib/weather/providerRouteMatching` vi.mock factory
- Added new test: `"passes maxDistanceM=1000 (DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M) to matchProviderPointsToRoute"` — asserts `args.maxDistanceM === 1_000`

`providerRouteMatching.test.ts` uses `15_000` as its own `maxDistanceM` in unit tests — left unchanged. Those tests cover the spatial matching helper with an arbitrary radius; the product policy is tested at endpoint level.

---

## Test results

```
npm run type-check → passed

npm run test:run -- lib/__tests__/weather-provider-stations.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/providerRouteMatching.test.ts
→ 3 files, 50/50 passed
```

---

## v378 findings addressed

1. **1 km cutoff** — `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000` in `providerRouteMatching.ts`. Both `route.ts` and `provider-stations/route.ts` use it. No drift possible.

2. **`ProviderStationPreviewCard` provider-neutral** — `children` prop instead of `VedurstofanPulseInline` import. Vegagerðin can pass its own road-condition slot with no changes to the card shell.

3. **Downsampling** — noted as Phase B2 concern, not addressed in this pass per scope.

---

## Note on test mock root cause

When the endpoint imports a named constant (`DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M`) from a mocked module, Vitest's `vi.mock` factory must include it explicitly — otherwise the import resolves to `undefined` at runtime. Both test files now include the constant in their mock factories with the correct value (`1_000`).

---

## Pending localhost verification (Stebbi)

1. Opna `/vedrid` og velja leið í kring um Reykjavík — staðfesta að stöðvamengið dregst saman miðað við 15 km útgáfuna.
2. Reykjavík → Selfoss — aðeins stöðvar nálægt veginum (≤1 km) eiga að sjást.
3. Reykjavík → Egilsstaðir eða Ísafjörður — staðfesta að stöðvar á langri leið birtist þar sem vegurinn er í raun 1 km eða nær.
4. Fara í result step eftir val á leið — staðfesta að final Veðurstofan calculation notar sömu 1 km reglu (sama constant).
5. Smella á stöðvamerkju — preview opnast með Púls (children slot virkar).
6. Staðfesta að met.no/Yr niðurstaða er óbreytt.

Engin SQL, RLS, Vercel env, migration, deployment, secrets eða production-data prófun í þessum pasa.

---

## Not changed

- `lib/weather/providerRouteMatching.ts` (matching logic, unit tests)
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`, `messages/en.json`
- SQL, env, migrations, Vercel
