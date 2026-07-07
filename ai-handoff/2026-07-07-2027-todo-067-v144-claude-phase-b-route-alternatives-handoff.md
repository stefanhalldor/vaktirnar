# Handoff: todo-067 v144 - Claude Phase B route alternatives

**Date:** 2026-07-07 20:27
**From:** Claude (Sonnet 4.6)
**To:** Codex eða næsta Claude session
**Branch:** main (uncommitted)

---

## Hvað var gert

Framkvæmt Phase B1-B6 úr v143 Codex handoff: route alternatives og route confirmation, ásamt Stebbi-viðbótum um að sýna allar leiðir á sama korti og raða eftir styrstum keyrslutíma.

---

## Skrár breyttar

```
lib/weather/provider.types.ts                            - RouteOption type + getRouteOptions á WeatherMapProvider
lib/weather/google.server.ts                             - getRouteOptions með computeAlternativeRoutes: true
app/api/teskeid/weather/travel/routes/route.ts           - NYR endpoint, raðar eftir durationS asc
app/api/teskeid/weather/travel/route.ts                  - selectedRouteId stuðningur
components/weather/RouteSelectionStep.tsx                - multi-polyline kort + route cards
app/auth-mvp/vedrid/FerdalagidClient.tsx                 - route state, fetch effect, selectedRouteId í submit
messages/is.json                                         - routeOptions* og routeOption* lyklar
messages/en.json                                         - routeOptions* og routeOption* lyklar
lib/__tests__/weather-google.test.ts                     - 9 nýjar tests fyrir getRouteOptions
lib/__tests__/weather-routes-api.test.ts                 - NYR, 11 tests fyrir routes endpoint
```

---

## Phase B1 - provider.types.ts

Bætt við `RouteOption` type sem extendaðar `RouteGeometry`:

```ts
export type RouteOption = RouteGeometry & {
  id: string          // 'google-0', 'google-1', ...
  routeIndex: number
  provider: 'google' | 'mapbox'
  labels: string[]   // e.g. ['DEFAULT_ROUTE'], ['DEFAULT_ROUTE_ALTERNATE']
  isDefault: boolean
}
```

`WeatherMapProvider` fær nýja aðferð:

```ts
getRouteOptions(from: PlaceCandidate, to: PlaceCandidate): Promise<RouteOption[]>
```

`getRouteGeometry` er óbreytt fyrir afturvirka samhæfni.

---

## Phase B2 - google.server.ts

`RoutesResponse` type fær `routeLabels?: string[]`.

Ný `getRouteOptions` aðferð:
- Kallar `computeRoutes` með `computeAlternativeRoutes: true`
- Field mask: `routes.polyline,routes.distanceMeters,routes.duration,routes.routeLabels`
- Skilar `[]` við HTTP villa (kastar ekki)
- Kastar ef `GOOGLE_MAPS_SERVER_KEY` er ekki sett
- `isDefault` = `labels.includes('DEFAULT_ROUTE')`
- Öll route geometry downsampled með sama `samplePoints` / `MAX_ROUTE_POINTS=80`

`googleProvider` fær `getRouteOptions` í exported object.

---

## Phase B3 - POST /api/teskeid/weather/travel/routes (NYR)

Sama auth/feature gate mynstur og travel endpoint:
- `AUTH_MVP_ENABLED !== 'true'` → 404
- Óinnskráður → 401 JSON
- Ekki `vedrid` aðgangur → 404
- Ógilt origin/destination → 400
- Provider ekki stilltur → 422
- Engar leiðir → 422 `route_unavailable`
- Provider kastar → 503 `route_unavailable`
- `200 { routes: RouteOption[] }` raðaðar eftir `durationS` ascending (styrstur keyrslutími fyrst)

---

## Phase B4 - travel/route.ts - selectedRouteId

```ts
const selectedRouteId = typeof body.selectedRouteId === 'string' ? body.selectedRouteId : null

if (selectedRouteId) {
  const routeOptions = await provider.getRouteOptions(originCandidate, destCandidate)
  const matched = routeOptions.find(r => r.id === selectedRouteId)
  if (!matched) {
    return NextResponse.json({ error: 'selected_route_unavailable' }, { status: 422 })
  }
  routeGeometry = matched
} else {
  routeGeometry = await provider.getRouteGeometry(originCandidate, destCandidate)
}
```

- Ef `selectedRouteId` er gefið: `getRouteOptions` er kallað aftur (server-side re-fetch), rétta leið er valin
- Ef `selectedRouteId` vantar: fallback á `getRouteGeometry` (afturvirk samhæfni)
- `selected_route_unavailable` skilað ef id finnst ekki í re-fetch

Þetta kostar eitt til viðbótar Routes API-kall í `travel` endpoint þegar `selectedRouteId` er gefið. Ásettanlegt í beta.

---

## Phase B5 - RouteSelectionStep.tsx

### Nýjar props

```ts
routeOptions: RouteOption[] | null
routeOptionsLoading: boolean
routeOptionsError: string | null
onRetryRoutes: () => void
selectedRouteId: string | null
onRouteSelected: (id: string) => void
```

### Kort: multi-polyline

`routeLineRef` (einföld) → `routeLinesRef: useRef<google.maps.Polyline[]>([])`

**Effect 4a** (fer eftir `routeOptions`, origin/destination, mapLoaded):
- Hreinsar allar gamlar polylines
- Ef `routeOptions` eru til: teiknar allar leiðir samtímis
  - Valin leið: `strokeColor: '#4A90E2'`, `strokeWeight: 5`, `strokeOpacity: 0.9`, `zIndex: 2`
  - Aðrar leiðir: `strokeColor: '#9CA3AF'`, `strokeWeight: 2`, `strokeOpacity: 0.45`, `zIndex: 1`
- Ef engar `routeOptions` (loading/villa): fallback bein lína milli origin og destination (þunn, daufur)
- Passar `fitBounds` þegar route options hlaðast (refits map)

**Effect 4b** (fer eftir `selectedRouteId`, `routeOptions`, mapLoaded):
- Uppfærir `setOptions` á polylines þegar val breytist
- Engin refit, engin endurteikning
- Map hreyfist ekki þegar notandi velur aðra leið

### Route cards UI

Þegar bæði origin og destination eru valin, birtist sektion undir kortinu:

```
Leiðir sem Google fann
[loading text | error + retry | route cards]
```

Route cards (sortað eftir `durationS` frá server):
- Index 0 → "Stysta leið"
- `isDefault && index > 0` → "Sjálfgefin Google-leið"
- Annars → "Önnur leið"
- Sýnir: `{km} km` og keyrslutíma (`{hours} klst. {minutes} mín.` eða `{minutes} mín.`)
- Touch target: `min-h-[52px]`
- Valin leið: `border-primary bg-primary/5`, label og tími í primary lit
- Confirm hnappurinn: "Nota þessa leið" (disabled þar til leið er valin)

---

## Phase B6 - FerdalagidClient.tsx

### Nýr state

```ts
const [routeOptions, setRouteOptions] = useState<RouteOption[] | null>(null)
const [routeOptionsLoading, setRouteOptionsLoading] = useState(false)
const [routeOptionsError, setRouteOptionsError] = useState<string | null>(null)
const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
const [routeRetryCount, setRouteRetryCount] = useState(0)
```

### Effect A - hreinsar result við breytingu á origin/destination

```ts
useEffect(() => {
  setResult(null)
  setError(null)
  setSelectedHeatmapIdx(null)
  setSelectedReturnHeatmapIdx(null)
}, [origin?.lat, origin?.lon, destination?.lat, destination?.lon])
```

### Effect B - sækir route options

Keyrir þegar `origin`, `destination` eða `routeRetryCount` breytist:
- Hreinsar route state
- Ef origin eða destination vantar: hætt
- Sækir `POST /api/teskeid/weather/travel/routes`
- Auth/JSON guard (401 og non-JSON → `errorAuthExpired`)
- Villa → `routeOptionsError` sett á `routeOptionsUnavailable`
- Tekst → `routeOptions` sett, fyrsta leið (`options[0].id`) sjálfkrafa valin

### handleSubmit

```ts
body: JSON.stringify({
  origin,
  destination,
  trailerKind,
  selectedRouteId: selectedRouteId ?? undefined,
  thresholdOverrides: ...,
})
```

`selected_route_unavailable` bætt við error map.

### Route step rendering

```tsx
<RouteSelectionStep
  ...
  routeOptions={routeOptions}
  routeOptionsLoading={routeOptionsLoading}
  routeOptionsError={routeOptionsError}
  onRetryRoutes={() => setRouteRetryCount(c => c + 1)}
  selectedRouteId={selectedRouteId}
  onRouteSelected={setSelectedRouteId}
  onConfirm={() => goNext('route')}
  confirmLabel={tf('routeConfirmSelected')}
  confirmDisabled={!origin || !destination || !selectedRouteId}
/>
```

### startOver

Hreinsar einnig `routeOptions`, `routeOptionsLoading`, `routeOptionsError`, `selectedRouteId`, `routeRetryCount`.

---

## Nýir message keys

Bætt við í `ferdalagid` hluta í bæðum `is.json` og `en.json`:

| Lykill | IS | EN |
|--------|----|----|
| `routeOptionsTitle` | Leiðir sem Google fann | Routes Google found |
| `routeOptionsLoading` | Sæki leiðarmöguleika... | Fetching route options... |
| `routeOptionsUnavailable` | Ekki tókst að sækja leiðir. Reyndu aftur. | Could not fetch routes. Please try again. |
| `routeOptionsRetry` | Reyna aftur | Try again |
| `routeOptionShortest` | Stysta leið | Shortest route |
| `routeOptionDefault` | Sjálfgefin Google-leið | Google default route |
| `routeOptionOther` | Önnur leið | Alternative route |
| `routeOptionDuration` | {hours} klst. {minutes} mín. | {hours} hr {minutes} min |
| `routeOptionDurationMinutes` | {minutes} mín. | {minutes} min |
| `routeConfirmSelected` | Nota þessa leið | Use this route |
| `selectedRouteUnavailable` | Valin leið fannst ekki. Veldu aðra leið og reyndu aftur. | Selected route not found. Choose another route and try again. |

---

## Test niðurstöður

```
npm run type-check  -> exit 0
npm run test:run    -> 1792 passed / 27 skipped / 8 todo (55 files)
git diff --check    -> exit 0 (LF warning á is.json, óskaðlegt)
```

Fyrri baseline: 1772. +20 nýjar tests.

### weather-google.test.ts (9 nýjar)
- `getRouteOptions` skilar mörgum leiðum með labels
- `isDefault` rétt sett (bara `DEFAULT_ROUTE`, ekki `DEFAULT_ROUTE_ALTERNATE`)
- Stable ids (`google-0`, `google-1`)
- Ein leið virkar
- Tómt array við engar leiðir
- Tómt array við HTTP villa
- `computeAlternativeRoutes: true` í request body
- `routes.routeLabels` í field mask
- Kastar ef server key vantar

### weather-routes-api.test.ts (11 nýjar)
- 404 við `AUTH_MVP_ENABLED=false`
- 401 við óinnskráðan notanda
- 404 við vantar feature access
- 400 við vantar origin
- 400 við Iceland coordinates villa á destination
- 422 við engar leiðir
- 503 við provider villa
- 200 með routes array
- Raðar rétt eftir `durationS` asc (2 leiðir)
- Raðar rétt eftir `durationS` asc (3 leiðir)

---

## Localhost checks fyrir Stebbi

1. Endurræsa localhost (nýr routes endpoint + middleware breyting frá v141 þarf fresh start).
2. Opna `/auth-mvp/vedrid` sem innskráður notandi með `vedrid` aðgang.
3. Velja `Reykjavík → Selfoss`.
4. **Búist við:**
   - "Leiðir sem Google fann" heading birtist
   - "Sæki leiðarmöguleika..." meðan sækt er
   - Route cards birtast: "Stysta leið" fyrst, eftir á "Sjálfgefin Google-leið" eða "Önnur leið"
   - Keyrslutími sýndur á hverju korti (t.d. "52 mín.")
   - Km-fjarlægð sýnd á hverju korti
   - Ef fleiri en ein leið: allar sýndar á kortinu samtímis, önnur gráar, valin blá og þykkari
5. Velja aðra leið → blá lína á korti breytist án þess að kort springi/hreyfist
6. "Nota þessa leið" hnappurinn virkjast þegar leið er valin
7. Halda áfram í eftirvagn → þröskuldar → niðurstaða
8. **Búist við í niðurstöðu:**
   - Fjarlægð og keyrslutími passa við valda leið (ekki alltaf route 0)
   - Audit map sýnir valda leið (route polyline frá server)
9. Fara til baka á `Leið` → valin leið enn sýnileg
10. Breyta áfangastað → leiðir hreinsast, nýjar leiðir sæktar

**Ef Google skilar aðeins einni leið (t.d. `Garðabær → Akureyri`):**
- Eitt route card sést (Stysta leið)
- Sjálfkrafa valin
- Notandi þarf enn að ýta á "Nota þessa leið"
- Engin layout overflow á 360-390px

**Ef kortið hleðst ekki (network villa eða AdBlock):**
- "Kortið náði ekki að hlaðast í þessum vafra. Þú getur samt valið..."
- Route cards virka án korts
- Notandi læst ekki

---

## Áhættuþættir / eftirlit

- Tvær Routes API kallar í `travel` endpoint þegar `selectedRouteId` er gefið (routes endpoint + weather endpoint). Ásettanlegt í beta; fylgjast með latency.
- Google getur skilað mismunandi fjölda alternative routes í mismunandi köllum. Ef id `google-1` finnst ekki í re-fetch: `selected_route_unavailable` skilað og notandinn þarf að velja aftur.
- `computeAlternativeRoutes: true` getur bætt latency við routes endpoint. Mælt með að mæla í DevTools.
- `SHORTER_DISTANCE` experimental feature er **ekki** innleitt - samkvæmt handoff.

---

## Hvað Codex má fara yfir

1. Kóðarýni á Phase B2-B4 (provider, routes endpoint, travel endpoint)
2. Athuga hvort `selected_route_unavailable` þurfi sérstaka UX í FerdalagidClient (nú: birtist sem villuskilaboð eins og aðrar villur, notandi getur prófað aftur)
3. Ef tíminn leyfir: athuga hvort tests vanti fyrir `selectedRouteId` í travel endpoint (v144 er til staðar en travel endpoint tests eru ekki sér-file)

---

## Næstu fasar (óbreyttar)

| v145 | Phase C: Vestmannaeyjar/Herjólfur (coordinate-based ferry detection) |
| v146 | Phase D: Saved places (SQL migration + RLS) |
| v147 | Phase E: Login UI clarity (auto-submit, no magic link) |

---

## Hvað Claude Code gerði EKKI

Engin SQL. Engar migrations. Ekkert commit, push, deploy eða production-aðgerð.
