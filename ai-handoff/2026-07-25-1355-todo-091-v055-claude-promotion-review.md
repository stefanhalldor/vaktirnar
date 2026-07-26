# TODO 091 v055 — Rýni: promotion á `/vedrid` (devils advocate)

Created: 2026-07-25 14:30
Timezone: Atlantic/Reykjavik
Agent: Claude Code

## Niðurstaða

**Promotion er tæknilega framkvæmanleg en v054-planið vanmetur umfang.**
Það eru þrjár guaranteed regressions og eitt product-ákvörðunaratriði sem þarf
að leysa áður en hægt er að committa.

Enginn blocker sem kemur frá auth, RLS, SQL eða migration. Allir blockers eru
í nav-contract, CSS og prop threading.

---

## Confirmed regressions — þurfa lagfæringu

### 1. MapLibre CSS hlaðast ekki á `/vedrid` (guaranteed visual bug)

`maplibre-gl/dist/maplibre-gl.css` er importuð eingöngu í
`app/auth-mvp/vedrid/road-map-prototype/layout.tsx`. Enginn
`/app/vedrid/layout.tsx` er til. Enginn `/app/auth-mvp/vedrid/layout.tsx`
er til.

Þegar `RoadMapPrototypeMap` er renderað á `/vedrid` mun kortið birtast án
MapLibre-CSS. Kortið missir stærð og controls við fyrstu render.

**Lagfæring:** Búa til `app/vedrid/layout.tsx` og
`app/auth-mvp/vedrid/layout.tsx` — báðar með sömu innihaldi og
prototype-layout:

```tsx
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Viewport } from 'next'
export const viewport: Viewport = { viewportFit: 'cover' }
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

Gæta þarf að `/auth-mvp/vedrid/layout.tsx` nái yfir bæði `/auth-mvp/vedrid`
og `/auth-mvp/vedrid/road-map-prototype` (sem er undir `/auth-mvp/vedrid/`).
Þannig má prototype-layout.tsx jafnframt hverfa eða verða tómt.

---

### 2. `routeReturnHref()` og "Til baka í akstur" brotnar fyrir public notanda

`routeReturnHref()` í `RoadMapPrototypeMap.tsx` lína 4290 byggir alltaf:

```ts
`/auth-mvp/vedrid/road-map-prototype?${params.toString()}`
```

Þessa URL er:
- skrifað í `sessionStorage` (route snapshot)
- sent sem `returnTo` í `DriveJourneyPanel` (línur 293, 380, 405)
- sent sem `returnTo` á `vegagerdinPulseHref` / `vedurstofanPulseHref` (línur
  7114-7117)

Þegar public notandi er á `/vedrid` og smellir á stöð, fer hann á
`/auth-mvp/vedrid/puls/stod/X?returnTo=%2Fauth-mvp%2Fvedrid%2Froad-map-prototype...`.
Þar er `resolvePulseBackDestination` keyrt á returnTo-gildið og finnur það
gildinní í `drive`-listanum — en það er prototype-slóðin, ekki `/vedrid`.
Middleware redirectar hann þangað, og þaðan á `/auth-mvp/vedrid` sem
innskráður eða aftur á `/innskraning` sem óinnskráður, með tap á query params.

**Tveggja hluta lagfæring:**

**a) `basePath` prop á `RoadMapPrototypeMap`:**

```ts
// Nýr prop
basePath?: string  // default: '/auth-mvp/vedrid/road-map-prototype'
```

Nota í `routeReturnHref()`:

```ts
return `${basePath}?${params.toString()}`
```

Og í lína 6332 (hardcoded sign-in CTA):

```tsx
href={`/innskraning?next=${encodeURIComponent(`${basePath}?context=route&view=information`)}`}
```

Og í línur 7114-7117:

```tsx
vegagerdinPulseHref(target.targetId, basePath)
vedurstofanPulseHref(target.targetId, `${basePath}?stationId=${target.targetId}`)
```

**b) `returnTo` prop á `DriveJourneyPanel`** (línur 293, 380, 405):

```tsx
returnTo={basePath}
```

Þetta þarf prop-threading: `DriveJourneyPanel` fær `returnTo?: string` og
sendir áfram á `VedurstofanPointCard` og önnur spjöld.

**c) `resolvePulseBackDestination` í `lib/weather/pulseBack.ts` uppfærð:**

Bæta við `/vedrid` og `/auth-mvp/vedrid` sem `drive`-destination þar sem
það er nýr canonical path fyrir Aksturskortið:

```ts
// Bæta við eftir prototype-match (línur 31-34):
if (
  decoded === '/vedrid' ||
  decoded.startsWith('/vedrid?') ||
  decoded.startsWith('/vedrid#') ||
  decoded === '/auth-mvp/vedrid' ||
  decoded.startsWith('/auth-mvp/vedrid?') ||
  decoded.startsWith('/auth-mvp/vedrid#')
) {
  return { kind: 'drive', href: decoded }
}
```

**Athugasemd:** Þetta gerir `/vedrid` og `/auth-mvp/vedrid` að `drive`
destinations í stað `overview`. Það er rétt þar sem kortið verður sama
kerfið. En `overview` match á þessum slóðum er þá líka fjarlægt úr
`overview`-hlutanum. Passa að breyta þessum í réttri röð (drive-check á
undan overview-check).

---

### 3. Sign-in CTA í saved places dialog sendir notanda á prototype (lína 6332)

Sér um sig þegar `basePath` prop er kominn (sjá #2a hér að ofan).

---

## Product-ákvörðun þarf (ekki tæknilegur blocker en UX-blocker)

### Stöðvaspjöld eru auth-gated — public notandi lendir í innskráningarsíðu

`vedurstofanPulseHref` og `vegagerdinPulseHref` í `lib/weather/pulseTarget.ts`
vísa á `/auth-mvp/vedrid/puls/stod/...` og
`/auth-mvp/vedrid/puls/vegagerdin/stod/...`. Báðar þessar síður krefjast
`guardTeskeidSession()`.

Public notandi á nýja `/vedrid` sem smellir á stöðvarpunkt:
- fer á auth-gated URL
- middleware sendir hann á `/innskraning`
- eftir innskráningu lendir hann á stöðvaspjaldinu

Þetta er breyting frá núverandi `WeatherOverviewClient` sem sýnir ekki
stöðvaspjöld þannig.

**Stebbi þarf að ákveða:**

**Valkostur A** — stöðvaspjöld eru auth-only: public notandi fær skýrt
"Skrá þig inn til að sjá spjald" þegar hann smellir á punkt á kortinu í
stað þess að fara beint á stöðvaspjaldssíðuna. Þetta þarf lítið UI-fix á
kortinu sjálfu.

**Valkostur B** — public read-only stöðvaspjöld: búa til
`app/vedrid/puls/stod/[stationId]/page.tsx` og
`app/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx` sem rendera sömu
spjöld án auth-guard. Stærri scope, fleiri skrár.

Mælt er með **Valkostur A** sem minni breytingin: stoppa navigation á
kortinu þegar notandi er óinnskráður og sýna inline sign-in CTA.

---

## Aðrar niðurstöður — ekki blocking

### `WeatherOverviewClient.tsx` lína 1229

Þegar `app/vedrid/page.tsx` og `app/auth-mvp/vedrid/page.tsx` fara að
rendera `RoadMapPrototypeMap` í stað `WeatherOverviewClient` hverfa þessar
tilvísanir sjálfkrafa. Engin sérstaklega lagfæring þarf.

### Middleware EXACT_PUBLIC_PATHS

`/auth-mvp/vedrid/road-map-prototype` er í dag í `EXACT_PUBLIC_PATHS`
(middleware.ts lína 77). Þegar prototype-síðan verður redirect þarf:
- anten að halda slóðinni í EXACT_PUBLIC_PATHS (redirect handler getur
  verið í layout/page)
- eða bæta redirect-logun við middleware

Einfaldasta leiðin: halda slóðinni í EXACT_PUBLIC_PATHS og láta
prototype-page.tsx gera `redirect()` á canonical slóð með query-params
varðveittum. Þetta krefst þess ekki að middleware breytist.

### `handleSaveWeatherChaseDefault` (línur 1854, 1866)

Þessar línur nota `window.location.pathname` dynamically — þær virka
sjálfkrafa rétt á `/vedrid`. Engin breyting þarf.

### sessionStorage lyklar

Eru ekki path-háðir og virka frá hvaða route sem er. Engin breyting þarf.

### `teskeid_road_map_route_return_v1` þegar bæði `/vedrid` og prototype
keyra samtímis

`sessionStorage` er tab-scoped (ekki origin-scoped eins og `localStorage`)
þannig að þetta er ekki collision-vandamál.

---

## Nákvæmt umfang nauðsynlegra breytinga

| Skrá | Aðgerð | Ástæða |
|------|--------|--------|
| `app/vedrid/layout.tsx` | **Ný skrá** | MapLibre CSS + viewport |
| `app/auth-mvp/vedrid/layout.tsx` | **Ný skrá** | MapLibre CSS + viewport (nær yfir bæði `/auth-mvp/vedrid` og prototype) |
| `app/auth-mvp/vedrid/road-map-prototype/layout.tsx` | Eyða eða tæma | Þarf ekki lengur ef `/auth-mvp/vedrid/layout.tsx` er til |
| `app/vedrid/page.tsx` | Breyta | Rendera `RoadMapPrototypeMap` í stað `WeatherOverviewClient`; senda `basePath="/vedrid"` |
| `app/auth-mvp/vedrid/page.tsx` | Breyta | Rendera `RoadMapPrototypeMap` í stað `WeatherOverviewClient`; senda `basePath="/auth-mvp/vedrid"` |
| `app/auth-mvp/vedrid/road-map-prototype/page.tsx` | Breyta | `redirect()` á `/auth-mvp/vedrid` með query-params varðveittum |
| `components/weather/RoadMapPrototypeMap.tsx` | Breyta | Bæta við `basePath` prop; nota í `routeReturnHref()`, lína 6332, línur 7114-7117 |
| `components/weather/DriveJourneyPanel.tsx` | Breyta | Bæta við `returnTo` prop; senda á stöðvaspjöld |
| `lib/weather/pulseBack.ts` | Breyta | Bæta `/vedrid` og `/auth-mvp/vedrid` við sem `drive` destinations |
| `lib/__tests__/pulseBack.test.ts` | Breyta | Uppfæra tests |

**Ef Valkostur A (auth-only stöðvaspjöld):** viðbótar UI-breyting á
`RoadMapPrototypeMap.tsx` sem sýnir inline sign-in þegar óinnskráður notandi
smellir á stöð í stað þess að navigatea.

---

## Route intelligence check

Promotion snertir eingöngu canonical UI-route og navigation contract.
`IcelandRoadmap.md` þarfnast ekki uppfærslu.

---

## Staðfestingarhringur eftir framkvæmd

```
npm run type-check     (exit 0)
npm run test:run       (135 files, exit 0)
npm run build          (exit 0, engin ný lint error)
git diff --check       (exit 0)
```

Auk þess: browser-skoðun á localhost — einkum MapLibre render,
"Til baka í akstur" frá stöðvaspjaldi, og sign-in CTA í saved places.

---

## Óleyst áður en framkvæmd hefst

1. Stebbi kýs Valkost A eða B fyrir stöðvaspjöld (auth-only vs. public).
2. Codex/Claude Code staðfestir að `/auth-mvp/vedrid/layout.tsx` þeki
   rétt yfir prototype-undir-slóðina (Next.js layout inheritance).
3. Staðfesta hvort `/vedrid/ferdalagid` eigi enn að vera til eftir
   promotion — ef `/vedrid` er að verða Aksturskort er ferdalagid-tabið
   inni í kortinu sjálfu og gamla standalone `/vedrid/ferdalagid` route
   kynni að vera redundant.
