# TODO 086 v378 - Codex review of v377 and next execution handoff

Created: 2026-07-17 05:57
Timezone: Atlantic/Reykjavik
Author: Codex

Related handoff:
- `2026-07-17-0555-todo-086-v377-claude-v376-b01-cleanup-prerelease.md`

## Mjog stutt nidurstada

V377 er rett hreinsunaratak: preview-cardid var extractad, provider label er prop, test-nafn lagad og downsampling comment heidarlegri. Thad sem vantar nuna er ad thraengja Vedurstofu-stodvar vid leidina ur 15 km nidur i 1 km, og gera thad samnytt fyrir bæði route-selection lagid og lokanidurstoduna. Annars myndi kortid geta synt eitt og nidurstadan annad.

## Findings

1. **Medium: 15 km er of vitt fyrir Vedurstofustodvar vid leidina**

   Screenshotid synir of margar stodvar umhverfis Reykjavik sem eru ekki raunverulega "a leidinni". Þetta kemur fra 15 km cutoff-i:

   - `app/api/teskeid/weather/travel/provider-stations/route.ts` notar `PROVIDER_STATIONS_MAX_DISTANCE_M = 15_000`.
   - `app/api/teskeid/weather/travel/route.ts` notar `VEDURSTOFAN_ROUTE_MAX_DISTANCE_M = 15_000`.

   Stebbi vill pro fa 1 km. Það a ad gilda bæði fyrir route-selection station layer og final travel result Vedurstofan layer, annars verda upplifun og utreikningur osamræmd.

   **Recommendation:** bua til eina samnytta constant, t.d. `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000` eða `FIXED_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000`, og nota hana i badum endpoints. Ekki skilja eftir tvo ohaða constants sem geta drift-að.

2. **Medium/Architecture: `ProviderStationPreviewCard` er ekki alveg provider-neutral a medan hann importar `VedurstofanPulseInline` beint**

   V377 flytur cardid ur `RouteSelectionStep`, sem er gott. En component sem heitir `ProviderStationPreviewCard` importar samt `VedurstofanPulseInline` innvortis. Þannig er shellid ekki alveg tilbuid fyrir Vegagerdina/future providers thott provider label se prop.

   Þetta er ekki blocker fyrir 1 km breytinguna, en a ad taka sem litla hardening i sama næsta passa ef Claude Code fer i cleanup:

   - annaðhvort rename-a component i `VedurstofanStationPreviewCard`, ef hann er i raun Vedurstofu-specific,
   - eða betra: halda `ProviderStationPreviewCard` generic og taka Púls sem `children` / `pulseSlot` prop, svo callerinn setji `<VedurstofanPulseInline ... />` inn.

   Þetta styður betur stefnuna: einn endurnytanlegur provider preview shell, en provider-specific Púls/links/aðgerðir utan shell.

3. **Low: Downsampling helper er enn local inni i `FerdalagidClient`**

   V377 lagaði commentid, en helperinn er enn local. Fyrir 1 km cutoff skiptir nákvæmni meira, því chord yfir bugðu/fjörð getur ráðið því hvort stöð er innan 1 km eða ekki.

   Ég myndi ekki gera RDP núna nema það sé lítið mál, en handoffid ætti að skrá næsta tæknilega skref: færa route geometry simplification í samnýtt helper og/eða nota geometry-preserving simplification áður en Vegagerðin fer inn.

## What v377 Gets Right

- Extractar station preview úr `RouteSelectionStep` í sér component-file.
- `providerLabel` er prop og hardcode-að `"Veðurstofan"` úr preview-cardinu er farið.
- Existing shared forecast row renderer (`ForecastRowLine`) er áfram notaður.
- Existing `VedurstofanPulseInline` er áfram notaður, ekki nýr Púls útfærður.
- Type-check og 49/49 relevant tests voru græn samkvæmt Claude.
- Engin SQL, env, Vercel, migration, push eða deploy.

## Execution Handoff For Claude Code

Stebbi vill næsta afmarkaða framkvæmdarpassa:

### Goal

Prófa þrengri fjarlægðarreglu fyrir fixed provider points: Veðurstofustöð má mest vera 1 km frá valdri route geometry til að teljast "á leiðinni".

### Scope

Include:

1. Breyta provider-route distance cutoff úr 15 km í 1 km.
2. Nota sömu samnýttu constant fyrir:
   - route-selection provider-stations endpoint,
   - final travel route Veðurstofan layer.
3. Uppfæra relevant tests sem assert-a 15_000 svo þau assert-i 1_000 þar sem við á.
4. Staðfesta að generic `providerRouteMatching` tests megi áfram nota arbitrary `15_000` þar sem þau eru unit tests fyrir helperinn, ekki product policy.
5. Ef litið og öruggt: gera `ProviderStationPreviewCard` meira raunverulega provider-neutral með `children`/`pulseSlot` prop i stað beins imports á `VedurstofanPulseInline`.

Do not include:

- RDP/geometry-preserving simplification nema það verði mjög lítið og öruggt.
- Vegagerðin.
- Time scrubber.
- Marker status coloring.
- Yr-at-station comparison.
- SQL/env/Vercel/deploy/commit/push.

### Suggested implementation details

Create one shared product-policy constant. Suggested options:

```ts
// lib/weather/providerRouteMatching.ts
export const DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000
```

or, if Stebbi/Claude Code prefers not to put product policy in the geometry helper:

```ts
// lib/weather/providerRoutePolicy.ts
export const DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000
```

Then update:

- `app/api/teskeid/weather/travel/provider-stations/route.ts`
  - Replace local `PROVIDER_STATIONS_MAX_DISTANCE_M = 15_000` with shared `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M`.

- `app/api/teskeid/weather/travel/route.ts`
  - Replace local `VEDURSTOFAN_ROUTE_MAX_DISTANCE_M = 15_000` with the same shared constant.

- `lib/__tests__/weather-travel-api.test.ts`
  - Update expected `maxDistanceM` from `15_000` to `1_000` where it is asserting product policy.

- `lib/__tests__/weather-provider-stations.test.ts`
  - Add an assertion that `matchProviderPointsToRoute` receives `maxDistanceM: 1_000`.
  - Existing validation tests can stay.

Potential optional cleanup:

- Change `ProviderStationPreviewCard` API from internally rendering `VedurstofanPulseInline` to:

```tsx
<ProviderStationPreviewCard ...>
  <VedurstofanPulseInline stationId={station.stationId} returnTo={returnTo} />
</ProviderStationPreviewCard>
```

This keeps the card shell reusable for Vegagerðin without importing a Veðurstofan-specific Púls component.

### Commands to run

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-provider-stations.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/providerRouteMatching.test.ts
```

No dev server start. Stebbi runs localhost.

### Expected handoff after implementation

Claude Code should write a new handoff immediately after implementation, including:

- exact files changed,
- whether both route-selection and final result now use the same 1 km constant,
- tests run and results,
- whether `ProviderStationPreviewCard` was also changed to slot/children,
- any remaining uncertainty about route geometry downsampling and 1 km cutoff.

## Next Phase After 1 km Pass

### Phase B1 - Localhost verification with tighter provider distance

Stebbi tests:

- Reykjavik city-area route: station clutter should drop significantly.
- Reykjavik -> Selfoss: only truly near-road Vedurstofustodvar should remain.
- Long route: Reykjavik -> Egilsstadir or Ísafjörður. Confirm stations still appear where truly near route.
- Compare route-selection map and final result: they should use same 1 km rule.

### Phase B2 - Geometry fidelity hardening

If 1 km feels right product-wise, revisit route simplification:

- avoid stride-only downsampling for provider matching,
- consider full geometry server-side or Ramer-Douglas-Peucker,
- especially before Vegagerðin, because road-condition points may be more sensitive to exact road geometry.

### Phase C - Route-selection weather status layer

Once station selection feels right:

- color markers by selected time and user weather thresholds,
- add a small time scrubber,
- reuse existing status/badge logic from result map and summary.

### Phase D - Provider comparison at same coordinates

Later:

- fetch Yr/met.no at Vedurstofan station coordinates as comparison,
- show conservative/default "varfærnasta matið" mode first,
- optionally add "jákvæðasta spáin" later as explicit user-selected lens.

### Phase E - Vegagerðin

After provider-route matching and preview shell are stable:

- add Vegagerðin points using same provider route matching and same max distance policy unless product testing says otherwise,
- reuse the generic preview shell,
- keep provider-specific current-road-condition fields in provider-specific child/slot.

## Localhost Checks For Stebbi

After Claude Code implements the 1 km pass:

1. Open `/vedrid` with Veðurstofan visible.
2. Pick a route around Reykjavík like in the screenshot.
3. Confirm the Veðurstofan route-selection layer no longer shows broad 15 km clutter.
4. Select a station marker and confirm preview still opens.
5. Continue to result step and confirm the final Veðurstofan station cards also follow the tighter 1 km rule.
6. Test a route that previously had 5-10 stations, e.g. Reykjavík -> Selfoss, and confirm count feels plausible.
7. Test a long route and confirm no crash/empty state caused only by the tighter cutoff.
8. Confirm met.no/Yr route points and final baseline result are unchanged.

No SQL, RLS, Vercel env, migration, deploy, commit, push or production-data action belongs to this pass.

## Óvissa / þarf að staðfesta

- Ég las v377 handoff og relevant source locations, but did not run localhost/browser.
- 1 km is a product test value from Stebbi. It may be too strict in sparse areas, but it is a good controlled experiment because it removes obvious city-area clutter.
- If route geometry is downsampled too aggressively, 1 km can expose geometry fidelity problems. That is why Phase B2 should follow soon if the product direction feels right.
