# 2026-07-17 14:00 - TODO-086 v426 - Claude: B3B Suspense/404/cache hardening

Created: 2026-07-17 14:00
Timezone: Atlantic/Reykjavik

## Hvað var gert (B3B.1 hardening eftir v425 Codex review og Stebbi bug reports)

Þrjú vandamál tilkynnt:
a) `/vedrid` er lengi í "Sæki veðurgögn..." jafnvel þegar gögn eru í cache
b) Skjárinn hangir stundum og þarf refresh
c) Public notandi sér bara titil og CTA, engar stöðvar

### Fix 1: Suspense boundary fyrir `/vedrid` (aðallagfæringin)

`app/vedrid/loading.tsx` (ný skrá)

`WeatherOverviewClient` notar `useSearchParams()`. Í Next.js 14 krefst `useSearchParams()` Suspense boundary. `/auth-mvp/vedrid` hafði þegar `loading.tsx`, en `/vedrid` hafði ekki neina. Án Suspense boundary getur Next.js misheppnast á hydration og skjárinn hangir/opnast ekki.

Lausn: sama `loading.tsx` mynstur og `/auth-mvp/vedrid/loading.tsx`.

```tsx
import { getTranslations } from 'next-intl/server'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export default async function Loading() {
  const t = await getTranslations('teskeid.loader')
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbf9f4]">
      <TeskeidLoader
        ideaTitles={[]}
        loadingLabel={t('loadingLabel')}
        fallbackIdeaTitle={t('fallbackIdeaTitle')}
      />
    </div>
  )
}
```

### Fix 2: 404 frá `WEATHER_ELTA_VEDRID_FLAG` kill-switch fer í `providerRestricted`, ekki `loadError`

`components/weather/WeatherOverviewClient.tsx`

Þegar `WEATHER_ELTA_VEDRID_FLAG !== 'true'` skilar station endpoint 404. Áður fór þetta í `loadError` ("Náði ekki að sækja") og sýndi harða villu á public overview. Nú er 404 meðhöndlað eins og 401/403 — `providerRestricted=true`, engar stöðvar, engin villa.

```tsx
if (res.status === 401 || res.status === 403 || res.status === 404) {
  setProviderRestricted(true)
  setLoading(false)
  return null
}
```

Þetta uppfyllir v426 Codex review finding 1: kill-switch/off-state sýnir rólegt degraded state (header + CTA), ekki destructive error.

### Fix 3: `Cache-Control` á station API response

`app/api/teskeid/weather/vedurstofan/stations/route.ts`

Bætti við:
```ts
headers: {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
}
```

`private` — CDN getur ekki þjónað svari eins notanda til annars.
`max-age=60` — vafri þjónar úr cache í 60 sek.
`stale-while-revalidate=300` — vafri þjónar gamli cache á meðan hann sækir nýjan (allt að 5 mín).

Þetta dregur úr upplifuðum hleðslutíma á síðukomum (vandamál a).

## Keyrðar prófanir

```
npm run type-check                                                       → clean (exit 0)
npm run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts \
                    lib/__tests__/weather-provider-stations.test.ts \
                    lib/__tests__/pulseBack.test.ts \
                    lib/__tests__/weather-travel.test.ts               → 50/50 passed
```

## Localhost checks fyrir Stebbi

**Mikilvægt: Endurræsa dev server** áður en þú prófar. Gamall `route.ts` gæti enn verið í minni.

### 1. Public overview

- Opna `/vedrid` sem óinnskráður
- Vænt: titill "Veðrið", "Reikna ferðaveðrið" CTA, Veðurstofustöðvar á korti
- Engin villa, engin heng, hleðslutími styttist við endurheim

### 2. Kill-switch state

- Setja `WEATHER_ELTA_VEDRID_FLAG` á eitthvað annað en `true` í env.local (eða eyða)
- Opna `/vedrid`
- Vænt: titill "Veðrið" og CTA sjást, engar stöðvar, **engin villa-texti** — rólegt degraded state

### 3. Provider restricted state

- Setja `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` í env.local
- Opna `/vedrid` sem óinnskráður
- Vænt: titill og CTA, engar stöðvar, engin villa (sama degraded state)

### 4. Auth overview

- Opna `/auth-mvp/vedrid` sem innskráður
- Vænt: titill "Veðrið", CTA → `/auth-mvp/vedrid/ferdalagid`, stöðvar á korti

### 5. Ferðaveður

- Smella "Reikna ferðaveðrið" á `/vedrid` → `/vedrid/ferdalagid`
- Smella "Reikna ferðaveðrið" á `/auth-mvp/vedrid` → `/auth-mvp/vedrid/ferdalagid`
- Báðar eiga að virka sem ferðareiknivél

### 6. Pulse back navigation

- Velja stöð á `/vedrid` → opna púls → back link: "Til baka í Veðrið" → `/vedrid?stationId=...`
- Velja stöð á `/auth-mvp/vedrid` → opna púls → back link: "Til baka í Veðrið" → `/auth-mvp/vedrid?stationId=...`

### 7. Compat route

- Opna `/auth-mvp/vedrid/elta-vedrid`
- Vænt: titill "Elta veðrið", back link "Til baka í Veðrið" → `/auth-mvp/vedrid`

## Skrár sem breyttust í þessari lotu

```
app/vedrid/loading.tsx                                (new: Suspense boundary)
components/weather/WeatherOverviewClient.tsx          (404 → providerRestricted)
app/api/teskeid/weather/vedurstofan/stations/route.ts (Cache-Control header)
```

(Allar aðrar skrár komu frá v423/v425 B3B lotu.)

## Næsta stór skref: B3C

v426 Codex review finding 2 bendir á að `WeatherOverviewClient` sé enn Veðurstofu-specific undir generic nafni. Þegar Vegagerðin kemur inn þarf:

- `WeatherOverviewShell` — provider-neutral skjáhylki/structure
- provider layer config (Veðurstofan sem fyrsta layer)
- reusable selected-provider preview contract

Þetta er ekki blockar núna. B3C á eftir localhost staðfestingu á v426.

## Óvissa

- Anon-key RLS á `vedurstofan_forecasts_latest`: ef taflan krefst authenticated-only RLS mun `readVedurstofanProductForStations` skila `null`/`undefined` á public overview. Defensive normalization (`raw instanceof Map ? raw : new Map()`) meðhöndlar þetta með því að sýna allar stöðvar sem `unavailable` (gráar). Þetta er rétt hegðun en kann að þurfa RLS-rýni seinna.
