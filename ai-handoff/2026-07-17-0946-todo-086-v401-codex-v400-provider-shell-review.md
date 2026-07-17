# 2026-07-17 09:46 — TODO-086 v401 — Codex review of v400 provider shell neutral prerelease

Created: 2026-07-17 09:46  
Timezone: Atlantic/Reykjavik  

Source reviewed: `2026-07-17-0940-todo-086-v400-claude-b05-provider-shell-neutral-prerelease`

## Findings

### Medium: `ProviderStationPreviewCard` is visually provider-neutral, but its type contract is still Veðurstofan-shaped

[components/weather/ProviderStationPreviewCard.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/ProviderStationPreviewCard.tsx:6>) imports `ProviderStationPoint`, and the prop type at [line 28](</c/Users/Lenovo/Documents/vaktirnar/components/weather/ProviderStationPreviewCard.tsx:28>) requires that full type.

That type currently includes Veðurstofan-specific fields like `atimeIso`, `sourceUrl`, and `forecastRows` in [lib/weather/providerRouteMatching.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/providerRouteMatching.ts:37>). So the shell no longer renders Veðurstofan rows internally, which is good, but Vegagerðin still cannot pass a natural Vegagerðin point into this component without either:

- shaping/faking it as a `ProviderStationPoint`, including irrelevant forecast fields, or
- widening `ProviderStationPoint` until it stops meaning Veðurstofan.

Fix before considering B0.5 fully done:

- Introduce a tiny provider-neutral view model for the shell, for example:

```ts
type ProviderStationPreviewShellPoint = {
  stationId: string
  stationName: string
  distanceM: number
}
```

- Or make props explicit:

```ts
stationName: string
distanceM: number
```

Keep provider-specific payloads in children. This makes the shell genuinely reusable for Vegagerðin without leaking Veðurstofan schema into the generic component.

### Low: The RouteSelectionStep callsite is still Veðurstofan-specific, which is okay for now but should not become the future provider abstraction

[components/weather/RouteSelectionStep.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/RouteSelectionStep.tsx:14>) imports `ForecastRowLine` and `selectUpcomingRows`, and [line 129](</c/Users/Lenovo/Documents/vaktirnar/components/weather/RouteSelectionStep.tsx:129>) calculates rows from `selectedStation.forecastRows`.

This is acceptable in v400 because `RouteSelectionStep` currently only renders a Veðurstofan station layer. But when Vegagerðin lands, avoid adding another provider branch directly into the same JSX if it starts to grow. Preferred next structure:

- generic shell stays dumb,
- provider-specific preview body components live beside each provider,
- `RouteSelectionStep` chooses which provider body to render based on the layer/marker source.

This is not a blocker for v400, just a guardrail for B2/Vegagerðin.

### Low: Handoff filename/time hygiene is still slightly messy

The file Stebbi referenced is `2026-07-17-0940-todo-086-v400-claude-b05-provider-shell-neutral-prerelease.md`, but git status also shows a deleted tracked `2026-07-17-1030...` version from the same handoff. The handoff content itself says `Created: 2026-07-17 10:30`.

This does not affect product behavior, and I would not spend engineering time on it now unless Claude Code is already cleaning handoff bookkeeping. It is only worth noting because time drift in handoff names makes later archaeology harder.

## What Looks Good

- The shell no longer imports `ForecastRowLine` or `selectUpcomingRows`.
- Forecast rows and `stationPreviewNoData` fallback moved to the Veðurstofan callsite.
- Runtime JSX in the shell is now just header, provider label, distance, close button, and children.
- This is the right direction for Vegagerðin and future providers.
- Vík/Mýrdalur was not reopened, which matches v399.

## Commands Run By Codex

```txt
Get-Content -Encoding UTF8 ai-handoff/2026-07-17-0940-todo-086-v400-claude-b05-provider-shell-neutral-prerelease.md
git status --short
git diff --stat
rg -n "ProviderStationPreview|VedurstofanStationPreview|provider preview|StationPreview|station preview" components app lib
Get-Content / line inspection for:
  components/weather/ProviderStationPreviewCard.tsx
  components/weather/RouteSelectionStep.tsx
  components/weather/VedurstofanForecastRows.tsx
  components/weather/VedurstofanPulseInline.tsx
  components/weather/VedurstofanPointCard.tsx
  lib/weather/providerRouteMatching.ts
  app/auth-mvp/vedrid/FerdalagidClient.tsx
git show --stat --oneline HEAD
git show --name-only --oneline HEAD
npm run type-check
npm run test:run -- lib/__tests__/pulseBack.test.ts lib/__tests__/vedurpuls-preview.test.ts lib/__tests__/vedurpuls-feed.test.ts
```

## Verification

- `npm run type-check` → pass
- `npm run test:run -- lib/__tests__/pulseBack.test.ts lib/__tests__/vedurpuls-preview.test.ts lib/__tests__/vedurpuls-feed.test.ts` → 3 files pass, 34 tests pass

I did not reproduce Claude Code's reported `61/61` test count exactly because v400 did not list the test filenames. The focused Púls/return-to tests I chose are green.

## Recommended Next Step

Ask Claude Code for one tiny follow-up before calling B0.5 complete:

1. Decouple `ProviderStationPreviewCard` from `ProviderStationPoint`.
2. Keep the rendered UI unchanged.
3. Keep Veðurstofan rows and Púls as children at the RouteSelectionStep callsite.
4. Run `npm run type-check`.
5. Run the same focused Púls tests, plus any existing weather/provider tests Claude Code thinks are relevant.

This should stay small. Do not touch Vík `verified:true`, route cache, overview map, Vegagerðin implementation, SQL, env, deploy, or Supabase.

## Localhost Checks For Stebbi

After the tiny follow-up:

1. Open `http://localhost:3004/vedrid`.
2. Use a state/account where the Veðurstofan route-selection layer is visible.
3. Choose a route with Veðurstofan stations.
4. Toggle Veðurstofan on/off.
5. Click a station marker.
6. Expected: the same preview card opens as before with station name, Veðurstofan label, distance from route, forecast rows, and Veðurpúls preview/action.
7. Close the card and click another station.
8. Expected: no visual regression and no stale station content.

Regression checks:

- met.no route result cards should be unchanged.
- final result Veðurstofan cards should be unchanged.
- Púls preview and "Sjá fleiri skilaboð..." link should still behave as before.
- No need to retest Vík/Mýrdalur `verified:true`; that remains deferred.

## Óvissa / þarf að staðfesta

I reviewed the committed current state and the v400 handoff, not a browser session. Confidence is high that the type-contract issue is real; confidence is medium that there are no visual regressions until Stebbi confirms in localhost.
