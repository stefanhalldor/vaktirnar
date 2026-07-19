# 2026-07-17 15:00 - TODO-086 v433 - Claude: B3C provider-neutral overview shell prerelease

Created: 2026-07-17 15:00
Timezone: Atlantic/Reykjavik
Source handoffs: `2026-07-17-1445-todo-086-v431-codex-v430-middleware-stations-review`, `2026-07-17-1448-todo-086-v432-codex-b3c-provider-neutral-overview-shell`

## Hvað var gert (B3C)

### Markmið

Gera `/vedrid` overview skjáinn provider-neutral þannig að Vegagerðin geti bæst inn sem annað provider layer síðar án þess að tvöfalda overview skjáinn. Veðurstofan er áfram eini virki provider-inn. Öll route-hegðun og external API óbreytt.

### Tæknileg útfærsla

#### Ný skrá: `components/weather/WeatherOverviewShell.tsx`

Generískt overview hylki sem:
- Veit ekkert um Veðurstofan-sértækar gerðir (`StationExplorerResponse`, `StationExplorerStation`, `VedurstofanPulseInline` o.fl.)
- Meðhöndlar: header (back link, titill/undirtitill, hamborgari), trip CTA, loading/error states, map (`IcelandOverviewMap`), URL sync (`?stationId=`), `selectedProvider` state
- Tvær render-hlutar í provider config:
  - `renderPreMap?`: efni FYRIR kortið (púlsstraumur, samantektarstripa)
  - `renderPostMap?`: efni EFTIR kortið (síuflippar, valinn stöðudetalji, stöðulisti)

Exportar opinbert contract:
```ts
export interface ProviderContentCtx {
  selectedMarkerId: string | null
  onSelectMarker: (markerId: string | null) => void
}

export interface WeatherOverviewProviderConfig {
  providerId: string
  loading: boolean
  loadError: boolean
  providerRestricted: boolean
  mapLayer: ProviderMapLayer | null
  renderPreMap?: (ctx: ProviderContentCtx) => React.ReactNode
  renderPostMap?: (ctx: ProviderContentCtx) => React.ReactNode
}
```

#### Endurskrifað: `components/weather/WeatherOverviewClient.tsx`

Varð Veðurstofan-sértækur adapter sem:
- Heldur öllum Veðurstofan-sértækum hlutum: fetch, `data`/`loading`/`loadError`/`providerRestricted`/`filter` state, `vedurstofanLayer` uppbygging, `WeatherPulseFeed`, `StationDetail`
- Exportar sama public API og áður (sömu props) -- pages breytast ekki
- Notar `WeatherOverviewShell` með `providers={[vedurstofanProvider]}`

Fjarlægt úr WeatherOverviewClient (fært í shell):
- `useRouter`, `useSearchParams`
- `selectedProvider` state
- `handleSelect`, `syncUrl`
- URL restoration (nú í shell `useEffect`)
- Header/CTA/map JSX
- Import á `Link`, `ChevronLeft`, `IcelandOverviewMap`, `TeskeidMenu`, `SelectedProviderMarker`

### Dependency direction

```
WeatherOverviewShell (generic)
  ← imports: ProviderMapLayer, SelectedProviderMarker (generic types)
  ← imports: IcelandOverviewMap (already provider-neutral)
  ← imports: TeskeidMenu (generic nav)

WeatherOverviewClient (Veðurstofan adapter)
  ← imports: WeatherOverviewShell + contract types
  ← imports: StationExplorerResponse, StationExplorerStation (Veðurstofan-sértækt)
  ← imports: VedurstofanPulseInline, ProviderStationPreviewCard (Veðurstofan UI)
```

Shell þekkir ekki til Veðurstofan. ✓

### UI röð (óbreytt)

```
Header
Trip CTA
Loading/error text
renderPreMap → WeatherPulseFeed + samantektarstripa
MAP (IcelandOverviewMap)
renderPostMap → síuflippar + valinn detalji + stöðulisti
```

Kortið er áfram á sama stað milli samantektarstripunnar og síuflippanna. ✓

### URL restoration (breytt útfærsla, sama hegðun)

Áður: gerðist í fetch `.then()` í WeatherOverviewClient, setti `selectedProvider` í adapter.
Nú: `WeatherOverviewShell` hefur `useEffect([hasMapData])` sem keyrir þegar `mapLayer` verður non-null, leitar að `?stationId=` param í öllum provider layers. Sama UI hegðun. ✓

## Keyrðar prófanir

```
npm run type-check                                                     → clean (exit 0)
npm run test:run -- lib/__tests__/middleware.test.ts
                    lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts
                    lib/__tests__/pulseBack.test.ts                    → 3 files, 82 tests passed
```

## Skrár sem breyttust í þessari lotu

```
components/weather/WeatherOverviewShell.tsx   (ný: generískt overview shell + contract types)
components/weather/WeatherOverviewClient.tsx  (endurskrifað: Veðurstofan adapter, sama public API)
```

## Skrár sem breyttust í heildarlotu (B3B + B3C, v423-v433)

```
Routing / pages:
  app/vedrid/page.tsx
  app/vedrid/loading.tsx
  app/vedrid/ferdalagid/page.tsx
  app/vedrid/ferdalagid/loading.tsx
  app/auth-mvp/vedrid/page.tsx
  app/auth-mvp/vedrid/ferdalagid/page.tsx
  app/auth-mvp/vedrid/ferdalagid/loading.tsx
  app/auth-mvp/vedrid/elta-vedrid/page.tsx
  app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx

Shell + adapter:
  components/weather/WeatherOverviewShell.tsx  (ný)
  components/weather/WeatherOverviewClient.tsx  (endurskrifað)

API:
  app/api/teskeid/weather/vedurstofan/stations/route.ts
  middleware.ts

Library:
  lib/weather/pulseBack.ts
  lib/__tests__/middleware.test.ts
  lib/__tests__/pulseBack.test.ts
  lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts

i18n:
  messages/is.json
  messages/en.json
```

## Localhost checks fyrir Stebbi

1. **Public `/vedrid`** sem óinnskráður: stöðvar á korti, hamborgari með public menu, "Reikna ferðaveðrið" CTA
2. **Public `/vedrid/ferdalagid`**: ferðareiknivél virkar sem áður
3. **Auth `/auth-mvp/vedrid`**: auth hamborgari, stöðvar á korti, CTA → `/auth-mvp/vedrid/ferdalagid`
4. **Auth `/auth-mvp/vedrid/ferdalagid`**: ferðareiknivél virkar
5. **Compat `/auth-mvp/vedrid/elta-vedrid`**: "Til baka í Veðrið" back link, auth hamborgari
6. **Stöðuval**: smella stöð á korti eða í lista → detalji opnast; smella aftur → lokar
7. **URL restore**: fara í púls úr `/vedrid`, koma til baka → `/vedrid?stationId=X` → rétt stöð valin
8. **Restricted**: `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` → titill+CTA+hamborgari sjást, engar stöðvar, engin villa

## Næsta skref: B3D / Vegagerðin

B3C-contractið er nú til: `WeatherOverviewProviderConfig` með `renderPreMap`/`renderPostMap`. Vegagerðin kemur inn með nýjan adapter component sem implementar þetta contract. Engar breytingar á shell eða Veðurstofan-hlutanum þarf.

Áframhald:
1. Localhost validation á B3B+B3C (Stebbi)
2. B3D routing/product IA staðfesting (ef þarf)
3. B4 Vegagerðar-adapter (þegar gögn/API eru tilbúin)

## Óvissa

- Ég keyrði ekki browser/localhost -- bara type-check og automated tests
- `makeCtx` er nýtt function-object á hverri render í shell. Vegna þess að providers.map() kallar `makeCtx` tvisvar (pre + post), og `handleProviderSelect` er nýtt reference á hverja render, gæti þetta valdið óþarfa re-render á child components. Þetta er ekki vandamál núna en væri hægt að memoize með `useCallback` ef þörf krefur.
- `WeatherPulseFeed` er enn Veðurstofan-sértækur innri component í `WeatherOverviewClient`. Þetta er rétt -- hann á ekki heima í shellin.
