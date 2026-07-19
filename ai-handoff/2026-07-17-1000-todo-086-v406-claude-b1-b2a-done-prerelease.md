# 2026-07-17 11:30 — TODO-086 v406 — B1+B2A: validation plan corrected, UX already complete

Created: 2026-07-17 11:30
Timezone: Atlantic/Reykjavik

Source: `2026-07-17-0955-todo-086-v405-codex-v404-review-and-larger-next-bundle`

## Niðurstaða

**Engar kóðabreytingar þurftust.** B2A UX er þegar framkvæmd í núverandi kóða.
Þessi handoff leiðréttir B1 auth matrix og staðfestir stöðu hverrar B2A kröfu.

---

## Leiðréttur B1 auth matrix

Codex v405 fann að v404 matrix var of þröng — tók ekki tillit til
`WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` env var.

### Rétt matrix:

| `WEATHER_ENABLED` | `ACCESS_REQUIRED` | Notandastaða | Útkoma |
|---|---|---|---|
| `All` | ekki sett / ekki `true` | útskráður | 200, lag gæti verið sýnilegt |
| `All` | ekki sett / ekki `true` | innskráður, engin provider row | 200, lag gæti verið sýnilegt |
| `All` | `true` | útskráður | 403, toggle falinn eftir fetch |
| `All` | `true` | innskráður, engin provider row | 403, toggle falinn |
| `All` | `true` | innskráður með provider row | 200, lag sýnilegt |
| `Authenticated` | eitthvað | útskráður | 401 (base weather lokar Gate 1) |

### Þetta er þegar rétt í kóðanum

`app/api/teskeid/weather/travel/provider-stations/route.ts:29-35`:
```ts
const layerEnabled = !vedurstofanAccessRequired
  ? true
  : (user?.id && user?.email
      ? await checkFeatureAccess(...)
      : false)
```

`app/auth-mvp/vedrid/FerdalagidClient.tsx:204,473-478`:
```ts
const [routeStationLayerAllowed, setRouteStationLayerAllowed] = useState(true)
// ...
if (r.status === 403) {
  if (!cancelled) setRouteStationLayerAllowed(false)
  return null
}
```

Og `FerdalagidClient.tsx:1418-1421` sendir `undefined` á allar lag-props þegar
`!routeStationLayerAllowed` → toggle birtist ekki.

### Prófanir ná þegar yfir matrix

`lib/__tests__/weather-provider-stations.test.ts`:
- 200 þegar `ACCESS_REQUIRED` ekki sett (open)
- 200 fyrir signed-out í `All` mode með open provider
- 403 þegar `ACCESS_REQUIRED=true` + notandi vantar row
- 401 þegar base weather blokar (Authenticated mode, signed-out)

---

## B2A UX staðfesting — allt þegar framkvæmt

### Provider-neutral shell
`components/weather/ProviderStationPreviewCard.tsx` — einungis `stationName`, `distanceM`,
`providerLabel`, `onClose`, `children`. Engin Veðurstofan-type. ✓ (B0.5/v400/v402)

### Forecast rows sem children
`components/weather/RouteSelectionStep.tsx:451-465` — forecast rows og Púls eru children
á kallstaðnum. Skelinn er einstigi. ✓ (B0.5/v400/v402)

### Engin stale selected station við route-breytingu
`RouteSelectionStep.tsx` Effect 5 (lína ~298-324): `setSelectedStation(null)` er kallað
þegar `vedurstofanStations` prop breytist. Þegar notandi velur aðra leið:
1. Parent setur `routeSelectionStations = null` samstundis
2. `vedurstofanStations` prop verður `undefined`
3. Effect 5 fires → merki hreinsuð + `setSelectedStation(null)` ✓

### Lag toggle með loading state
`RouteSelectionStep.tsx:424-428` — puls dot þegar `vedurstofanStationsLoading`. ✓

### 403 → toggle falinn
`FerdalagidClient.tsx:1418-1419` — `showVedurstofanLayer` og `onToggleVedurstofanLayer`
eru `undefined` þegar `!routeStationLayerAllowed` → toggle sýnist ekki. ✓

### Layer OFF → markers og selected station hreinsuð
Effect 5: þegar `vedurstofanStations` er `undefined` (lag slökkt) → `stationMarkersRef`
hreinsaðar og `setSelectedStation(null)`. ✓

---

## B1 localhost validation plan (leiðréttur)

### Auth prófunarumhverfi

Stebbi þarf að vita hvaða env vars eru í `.env.local` til að skilja væntaða hegðun:

**Open provider mode** (`ACCESS_REQUIRED` ekki sett eða ekki `true`):
- Öllum sem komast í gegnum base weather er leyft að sjá lag
- Á localhost með `WEATHER_ENABLED=All`: bæði signed-out og signed-in notendur

**Restricted provider mode** (`ACCESS_REQUIRED=true`):
- Einungis notendur með `weather-provider-vedurstofan` feature row

### Leiðir til að prófa (leiðréttar)

1. **Reykjavík → Akureyri** — margar stöðvar á leiðinni
   - Búist við: stöðvar birtast á route-selection kortinu
   - Búist við: sömu stöðvar á final result (sama matching path)
   - Búist við: stöðvar raðaðar eftir `distanceFromOriginM`

2. **Akureyri → Reykjavík** — öfug stefna
   - Búist við: sömu stöðvar, öfug röð

3. **Egilsstaðir → Höfn** — austurland (EKKI í gegnum Vík-svæðið)
   - Búist við: stöðvar á austurlands-leiðinni

4. **Reykjavík → Ísafjörður** — vestfjarðaleið
   - Búist við: stöðvar á þessari leið

5. **Þykkvibær → Hvolsvöllur** — stutt leið
   - Búist við: **engar** Veðurstofan stöðvar (false-positive check)

### Route-selection UX að staðfesta

- Lag toggle sýnilegt (open mode) / falið (403)
- Kveikja/slökkva: merki birtast og hverfa
- Smella á merki: preview card opnast með nafni, label, fjarlægð, forecast rows, Púls
- Smella á X: card lokast
- Smella á annað merki: card uppfærist (gamalt innihald hverfur)
- Velja aðra leið: merki og card hreinsuð strax

### Regression

- met.no spákort óbreytt
- Púls tenglar virkir með rétta return-to
- Veðurstofan kort á final step eins og áður

---

## Eftirstandandi

- **B2 fulla útfærsla:** ef Stebbi vill frekari UX breytingar á route-selection lagi
- **B3:** Iceland overview / status map
- **V:** Vegagerðin provider (notar `ProviderStationPreviewCard` með eigin children)
- **Deferred V:** Vík/Mýrdalur `verified:true` (sjá v398/v399)
