# TODO 091 v063 — Áfangi 2: útfærsluplann (atomic promotion)

Created: 2026-07-25 15:45
Timezone: Atlantic/Reykjavik
Agent: Claude Code

## Forsendur (úr v062 Codex)

- **Legacy redirect** → alltaf fyrst á `/vedrid` (ekki `/auth-mvp/vedrid`), query varðveitt
- **`hasRoadIntelligence` capability-prop** → explicit boolean í `RoadMapPrototypeMap`
- **`/vedrid/ferdalagid`** → óbreytt
- **Loading routes** → parent loaders (`app/vedrid/loading.tsx`, `app/auth-mvp/vedrid/loading.tsx`) eru til og fullnægjandi
- **pulseBack reclassification** → atomic með page promotion

## Raunverulegar breytingar

### Skref 2-A — capability prop í `RoadMapPrototypeMap`

**Skrá:** `components/weather/RoadMapPrototypeMap.tsx`

Bæta við `hasRoadIntelligence?: boolean` prop (default `false`). Gata hér:

| Feature | Gating |
|---|---|
| Road-segments fetch + layer | `hasRoadIntelligence` |
| Road-surface fetch + layer | `hasRoadIntelligence` |
| Map-proxy raster tiles | `hasRoadIntelligence` |
| Station-markers fetch (road) | `hasRoadIntelligence` |
| Overlay toggle controls (vegakort, yfirborð) | `hasRoadIntelligence` |
| Grunnveðurkort, aksturkalkúlatór, Veðurstofan markers | Óbreytt — opið öllum |

Þetta þarf að kanna í RoadMapPrototypeMap hvað nákvæmlega þarf að gata. Skref 2-A verður fyrst.

---

### Skref 2-B — Public canonical page

**Skrá:** `app/vedrid/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { RoadMapPrototypeMap } from '@/components/weather/RoadMapPrototypeMap'

export default function VedridPublicPage() {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    redirect('/')
  }

  const mode = getWeatherEnabledMode()
  if (mode === 'off') {
    redirect('/')
  }
  if (mode === 'authenticated') {
    redirect('/innskraning')
  }

  return (
    <main className="h-screen bg-background overflow-hidden">
      <RoadMapPrototypeMap
        isAuthenticated={false}
        hasRoadIntelligence
        navigation={{ canonicalPath: '/vedrid', authenticatedPath: '/auth-mvp/vedrid' }}
      />
    </main>
  )
}
```

Athugið: `hasRoadIntelligence={true}` alltaf á `/vedrid` þar sem `mode === 'all'` er skilyrði (authenticated-mode mun aldrei ná hingað).

---

### Skref 2-C — Auth canonical page

**Skrá:** `app/auth-mvp/vedrid/page.tsx`

```tsx
import { notFound } from 'next/navigation'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { resolveAuthenticatedWeatherShellAccess, getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { RoadMapPrototypeMap } from '@/components/weather/RoadMapPrototypeMap'

export default async function VedridPage() {
  const { user } = await guardTeskeidSession()
  const weatherShellAccess = await resolveAuthenticatedWeatherShellAccess(user)
  if (weatherShellAccess.mode === 'blocked') notFound()

  const hasRoadIntelligence =
    getWeatherEnabledMode() === 'all' ||
    (await checkFeatureAccess(user.id, user.email ?? '', 'road-intelligence-v1').catch(() => false))

  return (
    <main className="h-screen bg-background overflow-hidden">
      <RoadMapPrototypeMap
        isAuthenticated
        hasRoadIntelligence={hasRoadIntelligence}
        navigation={{ canonicalPath: '/auth-mvp/vedrid', authenticatedPath: '/auth-mvp/vedrid' }}
      />
    </main>
  )
}
```

---

### Skref 2-D — Query-preserving legacy redirect

**Skrá:** `app/auth-mvp/vedrid/road-map-prototype/page.tsx`

```tsx
import { redirect } from 'next/navigation'

export default async function RoadMapPrototypeLegacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const params = await searchParams
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      usp.set(key, value)
    } else {
      for (const v of value) usp.append(key, v)
    }
  }
  const qs = usp.toString()
  redirect('/vedrid' + (qs ? '?' + qs : ''))
}
```

Authenticated user fylgir redirect-keðjunni:
1. `/auth-mvp/vedrid/road-map-prototype?context=route&view=map&restoreRoute=1`
2. → Server redirect til `/vedrid?context=route&view=map&restoreRoute=1`
3. → Middleware: `user && pathname === '/vedrid'` → redirect til `/auth-mvp/vedrid?context=route&view=map&restoreRoute=1`
4. → Auth canonical page

Middleware-redirect á `/vedrid` → `/auth-mvp/vedrid` varðveitir query sjálfkrafa (`.clone()` og aðeins `pathname` er breytt).

---

### Skref 2-E — Fjarlægja redundant nested layout

**Skrá:** `app/auth-mvp/vedrid/road-map-prototype/layout.tsx` — **eyða**

Parent `app/auth-mvp/vedrid/layout.tsx` (1a) sér um MapLibre CSS og viewport. Nested layout er úrelt eftir redirect.

**Skrá:** `app/auth-mvp/vedrid/road-map-prototype/loading.tsx` — **halda**

Þótt parent loader sé til, þá heldur redirect-page sinni `loading.tsx` meðan við erum ekki viss um Next.js segment-loader behaviour yfir page-redirect. Má fara síðar.

---

### Skref 2-F — Atomic pulseBack reclassification

**Skrár:** `lib/weather/pulseBack.ts` + `lib/__tests__/pulseBack.test.ts`

Þetta er sama breyting og var í 1c en var bakfærð (tímsett of snemma). Nú fer hún með promotion:

**`pulseBack.ts`:** Færa `/vedrid` og `/auth-mvp/vedrid` úr `overview` yfir í `drive`:

```ts
// Drive: canonical map paths (promoted) + legacy prototype path
if (
  decoded === '/vedrid' ||
  decoded.startsWith('/vedrid?') ||
  decoded.startsWith('/vedrid#') ||
  decoded === '/auth-mvp/vedrid' ||
  decoded.startsWith('/auth-mvp/vedrid?') ||
  decoded.startsWith('/auth-mvp/vedrid#') ||
  decoded === '/auth-mvp/vedrid/road-map-prototype' ||
  decoded.startsWith('/auth-mvp/vedrid/road-map-prototype?') ||
  decoded.startsWith('/auth-mvp/vedrid/road-map-prototype#')
) {
  return { kind: 'drive', href: decoded }
}
```

`overview` kind verður `orphan` eftir þetta — eða hægt er að fjarlægja það úr union-type ef engar sidur nota það lengur. Þarf að kanna notkun.

**`pulseBack.test.ts`:** Uppfæra describe-blocks:
- `overview (auth)` → `drive (auth)` með `/auth-mvp/vedrid`
- `overview (public)` → `drive (public)` með `/vedrid`
- `drive` block þenst út með öllum þremur slóðum

---

### Skref 2-G — Middleware: engar breytingar

`EXACT_PUBLIC_PATHS` heldur `/auth-mvp/vedrid/road-map-prototype` (þarf til að unauthenticated users nái í redirect-page).

`/vedrid` er í `PUBLIC_PATHS` — allar `/vedrid/*` undirslóðir eru public.

Auth-canonicalization við lína 246 (`if (user && pathname === '/vedrid')`) varðveitir query. **Engar breytingar þarf.**

---

## Skrár sem breytast í áfanga 2

| Skrá | Breyting |
|---|---|
| `components/weather/RoadMapPrototypeMap.tsx` | + `hasRoadIntelligence` prop, gating á road-intelligence features |
| `app/vedrid/page.tsx` | Replace `WeatherOverviewClient` með `RoadMapPrototypeMap` |
| `app/auth-mvp/vedrid/page.tsx` | Replace `WeatherOverviewClient` með `RoadMapPrototypeMap` |
| `app/auth-mvp/vedrid/road-map-prototype/page.tsx` | Query-preserving redirect til `/vedrid` |
| `app/auth-mvp/vedrid/road-map-prototype/layout.tsx` | Eyða |
| `lib/weather/pulseBack.ts` | `overview` → `drive` fyrir `/vedrid` + `/auth-mvp/vedrid` |
| `lib/__tests__/pulseBack.test.ts` | Uppfæra describe-blocks og tests |

**Óbreyttar:**
- `app/vedrid/ferdalagid/page.tsx` — óbreytt
- `app/auth-mvp/vedrid/ferdalagid/page.tsx` (ef til) — óbreytt
- `app/auth-mvp/vedrid/road-map-prototype/loading.tsx` — halda
- `middleware.ts` — engar breytingar

---

## Verification checklist (þegar framkvæmt)

- [ ] `npm run type-check` → exit 0
- [ ] `npm run test:run -- lib/__tests__/pulseBack.test.ts lib/__tests__/road-map-navigation.test.ts` → allt grænt
- [ ] `git diff --check` → ekkert whitespace
- [ ] `/vedrid` sýnir kort (public, signed out, WEATHER_ENABLED=all)
- [ ] `/vedrid?context=route&view=map&restoreRoute=1` restores route view
- [ ] `/auth-mvp/vedrid/road-map-prototype?context=route&view=map&restoreRoute=1` → `/vedrid?...` → `/auth-mvp/vedrid?...`
- [ ] Authenticated án road-intelligence-v1: grunnkort virkar, engar console 404-villur
- [ ] Authenticated með road-intelligence-v1: road overlay virkar
- [ ] `/vedrid/ferdalagid` og `/auth-mvp/vedrid/ferdalagid` óbreyttir
- [ ] Veðurpúlsspjald: "Til baka í akstur" (ekki "Til baka í spákort")
- [ ] Mobile: viewport, overflow, MapLibre CSS

---

## Óklárað sem þarf Codex rýni

Áður en framkvæmd: skref 2-A (`hasRoadIntelligence` gating í RoadMapPrototypeMap) þarf nákvæma kortlagningu á hvaða fetch-calls og UI-elements á að gata. Þetta er flóknasta skrefið.

**Tillaga:** Claude Code framkvæmir 2-A fyrst (les RoadMapPrototypeMap, ákvarðar gating), skrifar minni handoff um nákvæmar breytingar í component-inu, og fær Codex rýni áður en 2-B til 2-G eru framkvæmd.

---

## Framkvæmdarleyfi þarf

Áfangi 2 er runtime page promotion. Þarf skýrt og afmarkað leyfi Stebba samkvæmt WORKFLOW.md áður en nokkur skrá er breytt.
