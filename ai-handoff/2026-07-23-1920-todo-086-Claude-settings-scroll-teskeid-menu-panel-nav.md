# TODO-086 - Post-release handoff: Scroll í stillingar, TeskeidMenu, Akstur/Skilaboð takkar

Created: 2026-07-23 19:20
Timezone: Atlantic/Reykjavik

## Skilningur a samþykki

Stebbi gaf framkvæmdarleyfi: "Mattr framkvæma þessa breytingu og gefa út ásamt handoff."

Ekki samþykkt og ekki gert: SQL, migration, Supabase, auth, secrets, billing, deploy utan push.

## Hvað var gert

### 1. Smooth scroll þegar stillingar opnast

**Skrá:** `components/weather/WeatherChasePanel.tsx`

`settingsButtonRef` bætt við "Breyta / stilla" takkann. `useEffect` fylgist með `settingsOpen`:
```tsx
useEffect(() => {
  if (settingsOpen) {
    settingsButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}, [settingsOpen])
```
Þegar notandi opnar stillingarnar skjótist takinn upp að efsta hluta skjásvæðis í sléttu skrolli.

### 2. Skýringartexti inni í stillingarskúffu

Subtitle textinn var settur aftur inn INNI Í stillingarblokkinni (ekki efst á spjaldinu):
```tsx
{settingsOpen && (
  <div className="flex flex-col gap-4">
    <p className="text-sm leading-snug text-muted-foreground">{labels.subtitle}</p>
    ...
  </div>
)}
```

### 3. Subtitle texti uppfærður

| Skrá | Lykill | Nýtt gildi |
|------|--------|-----------|
| is.json | `roadMapPrototypeWeatherChaseSubtitle` | "Breyta stöðum og stilla þínar veðurvæntingar" |
| en.json | `roadMapPrototypeWeatherChaseSubtitle` | "Edit stations and set your weather preferences" |

### 4. Nýir i18n lyklar

| Lykill | IS | EN |
|--------|----|----|
| `roadMapPrototypePanelRoute` | "Akstur" | "Route" |
| `roadMapPrototypePanelMessages` | "Skilaboð" | "Messages" |

### 5. TeskeidMenu í stað sérsniðins hamburgaradropdown

`import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'` bætt við.

`mobileMenuOpen` state og allar tilvísanir þar til fjarlægðar. Sérsniðinn hamburgar með 3 valmöguleikum fjarlægður frá:
- Kortayfirlaginu
- Mitt veður hausi
- Púls hausi

Í staðinn: `<TeskeidMenu variant="authenticated" />` á öllum þremur stöðum. Þetta notar standard Teskeið valmyndina (Teskeið, Minn prófíll, Senda hugmynd, útskráning).

### 6. Panel-skiptatakkar — Akstur, Skilaboð, Kort

Sömu takkar á öllum þremur stöðum með einu útliti (`h-9 rounded-full border border-border/70 bg-background/90 px-3 text-xs font-semibold whitespace-nowrap shadow-sm backdrop-blur-sm`):

**Kortayfirlag (mobile, sm:hidden):**
```
[Mitt veður] [Akstur] [Skilaboð + unread badge] [TeskeidMenu]
```
Enginn Kort takki þar — notandi er þegar á kortinu.

**Mitt veður hauss (mobile):**
```
[Mitt veður title...] [Akstur] [Skilaboð + badge] [Kort] [TeskeidMenu]
```

**Púls hauss (mobile):**
```
[Skilaboð title] [Mitt veður] [Akstur] [Kort] [TeskeidMenu]
```

Virk spjald fær grænn litur (`#16a34a`) á samsvarandi takka.

### 7. WeatherChasePanel — titill fjarlægður úr efsta hluta

Fyrri breyting (sem setti titil og subtitle efst) var endurskoðuð: titillinn hefur nú aðeins verið úr topp-blokkinni (sem var eytt) og subtitle er einungis sýnileg inni í stillingaskúffunni.

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Skipanir og niðurstöður

1. `npm run type-check` — exit code 0
2. `npm run test:run` — 129 skrár, 3577 próf, 27 skipped, 8 todo. Exit code 0.
3. `git commit` — `56499b6`
4. `git push` — tókst
5. `vercel ls` — build `Ready` eftir ~47s

## Localhost checks fyrir Stebbi

Síða: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

**Smooth scroll:**
1. Opnaðu Mitt veður. Veldu 3+ stöðvar þannig að taflan sé löng.
2. Smelltu á "Breyta / stilla". Staðfestu að skjárinn skrolli þannig að "Breyta / stilla" takkinn sé efst í skjásvæðinu.
3. Staðfestu að "Breyta stöðum og stilla þínar veðurvæntingar" texti sjáist inni í skúffunni.

**Panel-skiptatakkar:**
4. Á mobile: staðfestu að kortayfirlag sýni [Mitt veður][Akstur][Skilaboð][TeskeidMenu] á efri hægri hluta.
5. Opnaðu Mitt veður: staðfestu hauss: [Mitt veður title] [Akstur] [Skilaboð] [Kort] [TeskeidMenu].
6. Smelltu á "Akstur" í Mitt veður hausi. Staðfestu að Akstur spjaldið opnist.
7. Farðu í Skilaboð. Staðfestu hauss: [Skilaboð] [Mitt veður] [Akstur] [Kort] [TeskeidMenu].

**TeskeidMenu:**
8. Smelltu á TeskeidMenu (táknið efst hægra). Staðfestu að standard Teskeið valmyndin opnist (Teskeið, Minn prófíll, Senda hugmynd, útskráning).
9. Staðfestu að GAMLA sérsniðna dropdownið (með 🌦️🚗💬) sé hvergi til staðar.

## Óvissa

- Á mjög þröngum skjám (320px) gætu takkamir þrengt sig. `whitespace-nowrap` tryggir að texti þeirra brotnar ekki en við mjög marga takkana gæti efsta röð þurft að fljóta yfir í tvær línur. Hægt að nota `overflow-x-auto` á header ef þörf krefur.
- Mitt veður takki á kortayfirlaginu er nú sýnilegur á mobile (sem ekki var möguleg aðgerð áður þar sem hamburgarinn þurfti). Þetta gerir Mitt veður aðgengilegt eftir að notandi lokar því með Kort.
