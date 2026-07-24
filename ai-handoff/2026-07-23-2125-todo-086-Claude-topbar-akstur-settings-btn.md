# TODO-086 - Post-release handoff: Topbar nav, Akstur titill, settings takki

Created: 2026-07-23 21:25
Timezone: Atlantic/Reykjavik

## Skilningur a samþykki

Stebbi gaf framkvæmdarleyfi: "Mattr laga og gefa út."

Ekki samþykkt og ekki gert: SQL, migration, Supabase, auth, secrets, billing, deploy utan push.

## Hvað var gert

### 1. Settings togglutakki — nýr texti

**Skrá:** `messages/is.json` + `messages/en.json`

| Lykill | Áður | Eftir |
|--------|------|-------|
| `roadMapPrototypeWeatherChaseSettings` (IS) | "Breyta / stilla" | "Breyta stöðum og stilla veðurvæntingar" |
| `roadMapPrototypeWeatherChaseSettings` (EN) | "Edit / settings" | "Edit stations and set weather preferences" |

Subtitle `<p>` textinn (sem var settur inn í settings-drawer í fyrri lotu) fjarlægður þar sem hann er nú óþarfur.

### 2. Akstur í stað Ferðaleið

| Lykill | Áður | Eftir |
|--------|------|-------|
| `roadMapPrototypeRouteBridgeTitle` (IS) | "Ferðaleið" | "Akstur" |
| `roadMapPrototypeRouteBridgeTitle` (EN) | "Travel route" | "Route" |

### 3. Topbar í `RoadMapPrototypeMap.tsx` — í stað "Til baka í Veðrið"

**Gamalt:** `page.tsx` hafði efsta bar með `← Til baka í Veðrið` + `Korttilraun` titil + undirtitil.

**Nýtt:** Topbar er nú INNI Í `RoadMapPrototypeMap.tsx` og sýnir:

```
[Mitt veður] [Akstur] [Skilaboð (með unread badge)] [───────────] [TeskeidMenu]
```

Útfærsla:
- Ytri `<div className="absolute inset-0">` breytist í `<div className="flex h-full w-full flex-col">`
- Topbar: `<div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 bg-background px-3 py-2">`
- Kortasvæði: `<div className="relative flex-1 min-h-0">` (inniheldur MapLibre + allar overlays)
- Tveggja `</div>` lokunum bætt við á enda (map area + outer flex)

Desktop emoji takkarnir (🌦️🚗💬, `hidden sm:flex`) og mobile top-right nav block (`sm:hidden`) báðir fjarlægðir þar sem topbar þjónar þessum hlutverkum á báðum víddamyndabreiddum.

### 4. `page.tsx` einföldun

Áður:
```tsx
<main className="flex flex-col h-screen bg-background overflow-hidden">
  <div className="... topbar ...">
    <Link href="/auth-mvp/vedrid">← Til baka í Veðrið</Link>
    <p>Korttilraun</p>
    <p>M3A · Ferðaleið...</p>
  </div>
  <div className="flex-1 relative min-h-0">
    <RoadMapPrototypeMap />
  </div>
</main>
```

Eftir:
```tsx
<main className="h-screen bg-background overflow-hidden">
  <RoadMapPrototypeMap />
</main>
```

`Link` og `getTranslations` import fjarlægt.

### 5. Route panel hauss — mobile nav bætt við

◀ lokunarknappurinn er nú `hidden sm:flex` (desktop-only).

Mobile fær sömu nav takkana (`sm:hidden`):
```
[Mitt veður] [Skilaboð + badge] [Kort] [TeskeidMenu]
```

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`
- `messages/is.json`
- `messages/en.json`

## Skipanir og niðurstöður

1. `npm run type-check` — exit code 0
2. `npm run test:run` — 129 skrár, 3577 próf, 27 skipped, 8 todo. Exit code 0.
3. `git commit` — `3d1179e`
4. `git push` — tókst
5. `vercel ls` — build `Ready` eftir ~44s

## Localhost checks fyrir Stebbi

Síða: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

1. Staðfestu að "← Til baka í Veðrið · Korttilraun" sé HORFIÐ.
2. Staðfestu að topbar sé efst með: [Mitt veður] [Akstur] [Skilaboð] [TeskeidMenu].
3. Ýttu á "Mitt veður" í topbar. Mitt veður opnist sem full-screen (mobile) eða floating overlay (desktop). Takkinn grænist.
4. Ýttu á "Akstur" í topbar. Route-spjaldið opnist. Takkinn grænist.
5. Staðfestu að Route-spjaldið sé með titilinn "Akstur" (ekki "Ferðaleið").
6. Á mobile: staðfestu að Route-spjaldið hafi [Mitt veður][Skilaboð][Kort][TeskeidMenu] í hausi.
7. Opnaðu Mitt veður. Ýttu á "Breyta stöðum og stilla veðurvæntingar" takkann. Staðfestu smooth scroll + stillingarsvæði opnist — enginn subtitle texti í stillingarskúffunni.
8. Ýttu á TeskeidMenu. Staðfestu standard Teskeið valmynd.

## Óvissa

- `sm:top-14` á floating spjöldum á desktop er enn til staðar þótt topbar sé nú inni í kortasvæðinu. Þetta þýðir að spjöldin hefjast 56px frá efsta hluta kortasvæðisins (undir topbarnum). Þetta er óendanlega nær en gamla hegðunin (þar sem topbar var UTAN kortasins). Hægt að breyta í `sm:top-3` seinna ef þörf krefur.
- `RoadMapPrototypeMap` notar nú `h-full` statt `absolute inset-0`. `page.tsx` gefur honum `h-screen` í gegnum `<main class="h-screen overflow-hidden">`. Gangi vel.
