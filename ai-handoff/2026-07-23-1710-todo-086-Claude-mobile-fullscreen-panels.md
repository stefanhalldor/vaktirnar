# TODO-086 - Post-release handoff: Mobile full-screen panels + hamburger nav

Created: 2026-07-23 17:10
Timezone: Atlantic/Reykjavik

## Skilningur a samþykki

Stebbi gaf framkvæmdarleyfi: "Mattr framkvæma og bua til post release handoff eftir raun utgafu."

Ekki samþykkt og ekki gert: SQL, migration, Supabase, auth, secrets, billing, deploy utan push.

## Hvad var gert

### 1. Mobile full-screen panels — Mitt vedur, Akstur, Puls

Allar thrjar hliðarspjaldirnar opnast nu sem heilar skjamyndir a mobile (< sm = < 640px) i stad litilla fljotandi glugga.

**Mitt vedur (`isWeatherChaseOpen`)**

Yta wrapper breyttist ur:
```tsx
<div className="pointer-events-none absolute inset-x-3 bottom-28 top-14 z-[40] flex items-start">
  <div className="pointer-events-auto max-h-[calc(100vh-9rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur-sm">
```
I:
```tsx
<div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-sm sm:pointer-events-none sm:absolute sm:inset-x-3 sm:bottom-28 sm:top-14 sm:z-[40] sm:flex-row sm:items-start sm:bg-transparent sm:backdrop-blur-none">
  {/* Mobile-only header */}
  <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-2 sm:hidden">
    <p className="flex-1 text-sm font-semibold text-foreground">{t('roadMapPrototypeWeatherChaseTitle')}</p>
    <button type="button" onClick={() => setIsWeatherChaseOpen(false)} className="...">✕</button>
  </div>
  <div className="pointer-events-auto flex-1 overflow-y-auto p-3 sm:flex-none sm:max-h-[calc(100vh-9rem)] sm:w-full sm:max-w-2xl sm:rounded-xl sm:border sm:border-border/70 sm:bg-background/95 sm:shadow-xl sm:backdrop-blur-sm">
```

**Puls (`isChatOpen`)**

Yta wrapper breyttist ur:
```tsx
<div className="absolute left-3 top-14 z-30 w-[calc(100%-1.5rem)] max-w-[360px] rounded-xl border border-border/70 bg-background/95 p-2 shadow-lg backdrop-blur-sm">
  <div className="mb-1 flex items-center justify-end">
    <button onClick={() => setIsChatOpen(false)}>...</button>
  </div>
```
I:
```tsx
<div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-sm sm:absolute sm:bottom-auto sm:left-3 sm:top-14 sm:z-30 sm:block sm:w-[calc(100%-1.5rem)] sm:max-w-[360px] sm:rounded-xl sm:border sm:border-border/70 sm:p-2 sm:shadow-lg">
  {/* Mobile-only header */}
  <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-2 sm:hidden">...</div>
  {/* Desktop-only close */}
  <div className="mb-1 hidden items-center justify-end sm:flex">...</div>
  <div className="flex-1 overflow-y-auto p-3 sm:flex-none sm:overflow-visible sm:p-0">
```

**Akstur (`isPanelOpen`)**

Route panel hafdi nnu sinn hauss med lokunartakka (klofid), svo enginn nytt hauss thurfti. Dynamic class breyttist:

```tsx
// Adur
className={`absolute bottom-0 left-3 top-14 z-20 flex w-[...] flex-col ... ${isPanelOpen ? 'translate-x-0' : '-translate-x-[calc(100%+0.75rem)]'}`}

// Nu
className={`fixed inset-0 z-[100] flex-col overflow-hidden bg-background/90 backdrop-blur-sm sm:absolute sm:bottom-0 sm:left-3 sm:top-14 sm:z-20 sm:w-[...] sm:max-w-[360px] sm:rounded-t-xl sm:border sm:border-b-0 sm:border-border/70 sm:shadow-lg sm:transition-transform sm:duration-200 ${isPanelOpen ? 'flex sm:translate-x-0' : 'hidden sm:flex sm:-translate-x-[calc(100%+0.75rem)]'}`}
```

Mobile: `flex`/`hidden` til ad syna/fela (engin hreyfimynd). Desktop: `sm:flex` alltaf, `sm:translate-x` hreyfimyndin heldur.

### 2. Hamborgaravalmynd (hamburger menu) — efra horna haegra, mobile only

`<div className="absolute left-3 top-3 z-50 ... sm:flex">` — Emojitakkar visir a desktop only (`hidden sm:flex`).

Ny div `sm:hidden` efst til haegri med:

- **Kort takki** — birtist thegar einhver panel er opinn, lokar ollum spjoldum, farur til baka a kortid.
- **Hamborgaratakki (hamburger)** — opnar/lokar dropdown.
- **Dropdown** — 3 linar: Mitt vedur (gratt ef opid), Akstur (gratt ef leid valin), Puls (med unread-teljari).
- **Tap-outside overlay** — `fixed inset-0 z-40 sm:hidden` lokar dropdown thegar notandinn tappar utan vid hann.

State: `const [mobileMenuOpen, setMobileMenuOpen] = useState(false)`.

### 3. i18n lyskillar bættir vid

| Lykill | IS | EN |
|--------|----|----|
| `roadMapPrototypeBackToMap` | "Kort" | "Map" |

(Adur bætt vid i fyrri lotunni, nu er þad i kommittinum.)

## Skrar breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Skipanir og nidurstodur

1. `npm run type-check` — exit code 0
2. `npm run test:run` — 129 skrar, 3577 prof, 27 skipped, 8 todo. Exit code 0.
3. `git commit` — `1f9c1eb`
4. `git push` — tokst
5. `vercel ls` — build `Ready` eftir ~39s

## Localhost checks fyrir Stebbi

Sida: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

**Mobile (360-390px breydd):**

1. Stadfesta ad emoji takkarnir (vinstri-efst) sje EKKI sjaanlegir a mobile.
2. Stadfesta ad hamborgari (haegri-efst) se sjaanlegur.
3. Shtyta a hamborgara. Dropdown opnast med Mitt vedur / Akstur / Puls.
4. Velja Mitt vedur ur dropdown. Stadfesta ad full-screen yfirlag opnist (tekur alla skjamyndina).
5. Stadfesta ad hauss sje efst med "Mitt vedur" titil og ✕ lokunartak.
6. Loka med ✕. Kortid er aftur sjaanlegt.
7. Opna Mitt vedur aftur. Stadfesta ad "Kort" takki birtist vid hlidan hamburgarans. Shtyta a "Kort". Kortid aftur sjaanlegt.
8. Endurtaka skref 4-7 fyrir Akstur og Puls.
9. Stadfesta ad Akstur panel hafi sinn ◀ lokunartakka efst i listanum (engin tveggja hausa villa).

**Desktop (1024px+ breydd):**

10. Stadfesta ad emoji takkarnir (vinstri-efst) sje sjaanlegir a desktop.
11. Stadfesta ad hamburger og Kort sje EKKI sjaanlegir a desktop.
12. Stadfesta ad Mitt vedur opnist sem fljotandi yfirlag (ekki full-screen).
13. Stadfesta ad Akstur skreidi inn/ut med hreyfimynd.
14. Stadfesta ad Puls opnist sem fljotandi kassi.

## Ovissa

- `sm:bottom-auto` a Puls wrapperi er notad til ad hreinsa `bottom` sem `inset-0` setti. Ef Puls-spjaldid er mjog langt a smam skjam gæti thad fariid utan skjans. Hægt ad bæta vid `sm:max-h-[calc(100vh-4rem)]` ef thad kemur upp.
- A mobile leikur `sm:translate-x` animation ekki (vid notum `flex`/`hidden` i stadinnn). Ef beitt er um ad fa hreyfimynd a mobile i framtid tharf ad bæta `transition` og `transform` a mobile klasa.
