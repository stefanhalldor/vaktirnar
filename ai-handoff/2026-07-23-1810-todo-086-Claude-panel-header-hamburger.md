# TODO-086 - Post-release handoff: Panel mobile hauss — Kort + hamburger í stað X

Created: 2026-07-23 18:10
Timezone: Atlantic/Reykjavik

## Skilningur a samþykki

Stebbi bad um lagfæringar og framkvæmdarleyfi fólst í: "Laga það og gefa út með handoff."

Ekki samþykkt og ekki gert: SQL, migration, Supabase, auth, secrets, billing, deploy utan push.

## Hvað var gert

### 1. Titill + skýringartexti fjarlægðir úr WeatherChasePanel

**Skrá:** `components/weather/WeatherChasePanel.tsx`

`<div className="space-y-1"><h2>...</h2><p>...</p></div>` blokkin sem var efst í `<section>` var fjarlægð. Titillinn "Mitt veður" kemur nú einungis frá mobile hausnum í `RoadMapPrototypeMap.tsx`. Á desktop sést titillinn ekki sérstaklega, en 🌦️ takkinn gefur þar til kynna hvaða spjald er opið.

### 2. Mobile hauss Mitt veður — Kort + hamburger í stað ✕

**Skrá:** `components/weather/RoadMapPrototypeMap.tsx`

Áður:
```tsx
<p className="flex-1 ...">Mitt veður</p>
<button onClick={() => setIsWeatherChaseOpen(false)}>✕</button>
```

Eftir:
```tsx
<p className="flex-1 ...">Mitt veður</p>
<div className="relative z-[160] flex items-center gap-2">
  <button onClick={() => { loka öllum spjöldum }}>{t('roadMapPrototypeBackToMap')}</button>
  <div className="relative">
    <button onClick={() => setMobileMenuOpen(v => !v)}>☰</button>
    {mobileMenuOpen && <div className="absolute right-0 top-full z-50 ...">...dropdown...</div>}
  </div>
</div>
```

Dropdown inniheldur sömu þrjár valmöguleika og hamborgari á kortinu: 🌦️ Mitt veður, 🚗 Akstur, 💬 Púls (með unread-teljara ef við á).

**Tap-outside inni í spjaldinu:**
```tsx
{mobileMenuOpen && (
  <div className="absolute inset-0 z-[150] sm:hidden" onClick={() => setMobileMenuOpen(false)} />
)}
```
Þetta `absolute inset-0 z-[150]` er settur ofan á innihald spjaldsins (en undir dropdown á `z-[200]` / hamborgara-wrapper á `z-[160]`) svo að þegar notandi tappar utan við dropdown-ið lokar það sig.

### 3. Mobile hauss Púls — sama lagfæring

**Skrá:** `components/weather/RoadMapPrototypeMap.tsx`

Sama breyting og á Mitt veður: ✕ skipt út fyrir Kort + hamburger með dropdown og tap-outside overlay.

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`

## z-index stacking

Inni í full-screen spjaldi (z-[100]) eru stökkur þannig:
- Innihald spjalds: default
- Tap-outside overlay: z-[150] — fangar tapp utan við dropdown
- Hamburger + Kort wrapper: z-[160] — hærra en tap-outside svo að takkarnir virki
- Dropdown: z-50 (innan stacking context hamborgara-wrappers, sem er z-[160])

## Skipanir og niðurstöður

1. `npm run type-check` — exit code 0
2. `npm run test:run` — 129 skrár, 3577 próf, 27 skipped, 8 todo. Exit code 0.
3. `git commit` — `967b4c8`
4. `git push` — tókst
5. `vercel ls` — build `Ready` eftir ~45s

## Localhost checks fyrir Stebbi

Síða: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

**Mobile (360-390px):**

1. Opnaðu Mitt veður. Staðfestu að hauss spjaldsins sé: [Mitt veður titill] [Kort] [☰].
2. Ýttu á ☰. Staðfestu að dropdown opnist með 🌦️ / 🚗 / 💬 valmöguleikum.
3. Tappaðu utan við dropdown-ið (en inni í spjaldinu). Staðfestu að dropdown lokist.
4. Opnaðu dropdown aftur. Veldu 🚗. Staðfestu að Akstur spjaldið opnist.
5. Opnaðu Mitt veður aftur. Ýttu á "Kort". Staðfestu að kortið sé aftur sýnilegt.
6. Endurtaktu skref 1-5 með Púls spjaldið.
7. Staðfestu að "Mitt veður" titillinn komi EKKI tvisvar (ekki bæði í hausi og inni í WeatherChasePanel).

**Desktop (1024px+):**

8. Staðfestu að hamburger og Kort séu EKKI sýnileg á desktop (sm:hidden).
9. Staðfestu að WeatherChasePanel á desktop sýni EKKI "Mitt veður" titil efst í innihaldinu.

## Óvissa

- Á desktop er titill Mitt veður ekki sýnilegur. Þetta er í samræmi við beiðni notanda ("titillinn er óþarfur") en ef þörf krefur er auðvelt að bæta titlinum aftur inn á desktop með `hidden sm:block`.
- Akstur (Route) spjaldið fær ekki sömu hamburger-uppfærslu — ◀ lokunartakkinn er enn til staðar þar. Mætti jafnræðisins vegna bæta við hamburger í Route hauss líka, en ekki beðið um það.
