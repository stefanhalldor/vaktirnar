# TODO 091 v061 — Áfangi 2 blokkur: rannsókn og opnar spurningar

Created: 2026-07-25 15:30
Timezone: Atlantic/Reykjavik
Agent: Claude Code

## Staða

Áfangi 1 (1a layouts + 1b typed nav + 1c pulseBack) er **ócommittaður** og bíður Stebbis samþykkis.

Áfangi 2 = promote `RoadMapPrototypeMap` á `/vedrid` og `/auth-mvp/vedrid`. Fjórar spurningar þarf að svara áður en framkvæmd getur hafist.

---

## Spurning 1 — `hasRoadIntelligence` access contract

### Núverandi staða

Öll road-intelligence API routes (`/road-segments`, `/road-surface`, `/map-proxy`, `/station-markers`) gera þetta:

```
if (WEATHER_ENABLED !== 'all') {
  krefst auth + road-intelligence-v1 feature flag
}
if (WEATHER_ENABLED === 'all') {
  opið öllum (engin feature gate)
}
```

`WeatherOverviewClient` fær `hasRoadIntelligence` prop frá server component og notar það til að:
1. Sýna/fela "Aksturkort" hlekk (tengil á prototype) — **óþarft eftir promote**
2. Sýna/fela `RoadIntelligencePreview` (route memory preview) í mæliborðs-spjaldinu

`RoadMapPrototypeMap` hefur **ekkert** `hasRoadIntelligence` prop. Ef API skilar 404 (engin flag) þá hrynjir hlaðning á road overlay hljóðlega í JS-villum.

### Spurningin

**Þarf `RoadMapPrototypeMap` á `/auth-mvp/vedrid` að vera girt með `road-intelligence-v1` flag?**

**Valkostur A — Nei, server-gate nægir:**
- Allir authenticated users komast á kortið
- Road overlay fetches mistakast hljóðlega (404) fyrir notendur án flag
- Engin kóðabreyting á component nema design-á-mæliborðinu vegna `RoadIntelligencePreview`
- Einfaldara — page component þarf ekki `checkFeatureAccess()`

**Valkostur B — Já, component fær `hasRoadIntelligence` prop:**
- Overlay UI (línur, yfirborð) sýnist aðeins þeim sem hafa flaggið
- Page component verður áfram `async` og kallar `checkFeatureAccess()`
- `RoadMapPrototypeMap` þarf nýtt optional prop `hasRoadIntelligence?: boolean`

**Mæling**: Valkostur A er einfaldari og í samræmi við það sem prototype-page gerir í dag (engin flag-gát í component). API-gate tryggir að gögn leiki ekki út.

---

## Spurning 2 — Prop-samhæfni milli `WeatherOverviewClient` og `RoadMapPrototypeMap`

### Núverandi props á `/vedrid/page.tsx`

```tsx
<WeatherOverviewClient
  isOverview
  tripHref="/vedrid/ferdalagid"
  stationPulseReturnBase="/vedrid"
  menuVariant="public"
/>
```

### Núverandi props á `/auth-mvp/vedrid/page.tsx`

```tsx
<WeatherOverviewClient
  isOverview
  tripHref="/auth-mvp/vedrid/ferdalagid"
  stationPulseReturnBase="/auth-mvp/vedrid"
  menuVariant="authenticated"
  hasRoadIntelligence={hasRoadIntelligence}
/>
```

### Hvað þarf eftir promote

| Prop | Fate | Skýring |
|---|---|---|
| `isOverview` | Fellur út | Map er kortið, ekki overview-adaptör |
| `tripHref` | Ekki þörf | `RoadMapPrototypeMap` hefur `DriveJourneyPanel` innbyggt |
| `stationPulseReturnBase` | Via `navigation` | `buildRoadMapStationReturnHref(navigation)` myndar þetta |
| `menuVariant` | Via `isAuthenticated` | Map hefur eigin menu-logic |
| `hasRoadIntelligence` | Sjá Spurning 1 | Verður til prop eða fellur út |

### Navígation object eftir promote

**Fyrir `/vedrid`:**
```tsx
<RoadMapPrototypeMap
  isAuthenticated={false}
  navigation={{ canonicalPath: '/vedrid', authenticatedPath: '/auth-mvp/vedrid' }}
/>
```

**Fyrir `/auth-mvp/vedrid`:**
```tsx
<RoadMapPrototypeMap
  isAuthenticated
  navigation={{ canonicalPath: '/auth-mvp/vedrid', authenticatedPath: '/auth-mvp/vedrid' }}
/>
// Ef Valkostur B í Spurning 1:
// hasRoadIntelligence={hasRoadIntelligence}
```

Type-check mun staðfesta hvort `navigation` er fullnægjandi — `RoadMapCanonicalPath` leyfir `/vedrid` og `/auth-mvp/vedrid` nú þegar.

---

## Spurning 3 — Hvað gerist við `/vedrid/ferdalagid`?

### Núverandi staða

```
app/vedrid/ferdalagid/page.tsx → <FerdalagidClient isGuest />
```

`WeatherOverviewClient` á `/vedrid` tengist þangað með `tripHref="/vedrid/ferdalagid"`. Eftir promote er sá hlekkur horfinn; `/vedrid/ferdalagid` er aðeins nálægt með bein URL.

### Spurningin

**Hvað á að gera við `/vedrid/ferdalagid` eftir promote?**

**Valkostur A — Láta vera óbreytt:**
- Síðan lifir áfram sem deep-link destination
- Enginn entry-point frá `/vedrid` en gamla bókamerki virka
- Engar breytingar nú

**Valkostur B — Redirect til `/vedrid`:**
- Þar sem `/vedrid` hefur ferðalag-mæliborðið innbyggt (DriveJourneyPanel í map)
- Fólk sem fer á `/vedrid/ferdalagid` lendir beint á kortinu
- Einfaldari arkitektúr til lengri tíma

**Mæling**: Gott að fá Stebbis álit — hvort `/vedrid/ferdalagid` á enn gildi sem standalone-síða eða á að hverfa.

Athugið: `/auth-mvp/vedrid/ferdalagid` er sérstakt mál og snertir þessa ákvarðanatöku ekki beint.

---

## Spurning 4 — Query-preserving redirect frá prototype-slóð

### Vandinn

Eftir promote verður `/auth-mvp/vedrid/road-map-prototype` gömul slóð sem á að vísa yfir á `/auth-mvp/vedrid`. En query-params eins og `?context=route&view=map&restoreRoute=1` þarf að varðveita — þær eru notaðar til að endurheimta route-view við endurkvaðningu.

### Lausn

Breyta `app/auth-mvp/vedrid/road-map-prototype/page.tsx` í server component sem les `searchParams` og gerir redirect:

```tsx
import { redirect } from 'next/navigation'

export default function RoadMapPrototypeRedirectPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[]>
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      params.set(key, value)
    } else {
      for (const v of value) params.append(key, v)
    }
  }
  const qs = params.toString()
  redirect('/auth-mvp/vedrid' + (qs ? '?' + qs : ''))
}
```

**Ekkert middleware þarf.** `searchParams` prop á server component fær öll query-params sjálfkrafa.

**Athugið**: `layout.tsx` og `loading.tsx` í `road-map-prototype/` þarf að skoða hvort þau haldi sér eða hverfi. `layout.tsx` þar hefur verið felld út inn í `app/auth-mvp/vedrid/layout.tsx` sem er 1a — svo `road-map-prototype/layout.tsx` má fara.

### sessionStorage — engin vandræði

Lyklar eins og `teskeid_road_map_route_return_v1`, `teskeid_weather_chase_public_session_v1`, `teskeid_public_saved_places_v1` eru **slóðalausar** — þeir nota ekki `/road-map-prototype` í nafninu svo sessionStorage virkar þvert yfir slóðaskiptin.

---

## Yfirlit: hvað bíður Stebbis ákvörðunar

| # | Spurning | Mæling |
|---|---|---|
| 1 | `hasRoadIntelligence` flag-gát í promote | Valkostur A (server-gate nægir) |
| 2 | Props-mapping | Leyst — sjá ofan, type-check mun staðfesta |
| 3 | `/vedrid/ferdalagid` fate | Biðum Stebbis |
| 4 | Prototype redirect-design | Leyst — `searchParams` + `redirect()` |

---

## Þegar Stebbi hefur svarað

Næsta skref er **áfangi 2 framkvæmd**:
1. `app/vedrid/page.tsx` — skipta um `WeatherOverviewClient` fyrir `RoadMapPrototypeMap` með public navigation
2. `app/auth-mvp/vedrid/page.tsx` — skipta um `WeatherOverviewClient` fyrir `RoadMapPrototypeMap` með auth navigation
3. `app/auth-mvp/vedrid/road-map-prototype/page.tsx` — query-preserving redirect
4. `lib/weather/pulseBack.ts` og `pulseBack.test.ts` — færa `/vedrid` + `/auth-mvp/vedrid` frá `overview` yfir í `drive` (atomically)
5. Commit áfanga 1 + áfanga 2 saman eða í tveimur commits
6. Nota `/vedrid` public navigation object í Veðurpúls-síðum sem tengjast til baka (þ.e. `resolvePulseBackDestination` þarf `drive` kind fyrir þessar slóðir)

**Áfangi 3** (inline sign-in CTA) er óháður og getur beðið.
