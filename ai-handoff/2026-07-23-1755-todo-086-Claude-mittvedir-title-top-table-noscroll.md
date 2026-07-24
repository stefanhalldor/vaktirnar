# TODO-086 - Post-release handoff: Mitt veður titill efst, engin lóðrætt skroll í töflu

Created: 2026-07-23 17:55
Timezone: Atlantic/Reykjavik

## Skilningur a samþykki

Stebbi bad um tvær lagfæringar og framkvæmdarleyfi fólst í orðalagi beiðninnar: "Framkvæma lagfæringar og gefa út á raun með handoff."

Ekki samþykkt og ekki gert: SQL, migration, Supabase, auth, secrets, billing, deploy utan push.

## Hvað var gert

### 1. Titill og skýringartexti alltaf sýnilegur efst

**Skrá:** `components/weather/WeatherChasePanel.tsx`

Áður var:
```tsx
{settingsOpen && (
  <div className="flex flex-col gap-4">
    <div className="space-y-1">
      <h2 className="text-base font-semibold text-foreground">{labels.title}</h2>
      <p className="text-sm leading-snug text-muted-foreground">{labels.subtitle}</p>
    </div>
    ...
  </div>
)}
```

Eftir:
```tsx
// Ávallt sýnilegt efst, utan settingsOpen
<div className="space-y-1">
  <h2 className="text-base font-semibold text-foreground">{labels.title}</h2>
  <p className="text-sm leading-snug text-muted-foreground">{labels.subtitle}</p>
</div>

// settingsOpen hefur nú bara: leit, veðurgildi, röðunarlisti
{settingsOpen && (
  <div className="flex flex-col gap-4">
    <div className="relative space-y-1">...leit...</div>
    ...
  </div>
)}
```

### 2. Engin lóðrætt skroll inn í töfluna (>3 stöðvar)

**Skrá:** `components/weather/WeatherChasePanel.tsx`

Áður:
```tsx
<div className="overflow-auto rounded-lg border border-border/70 bg-background/75" style={{ maxHeight: '55vh' }}>
```

Eftir:
```tsx
<div className="overflow-x-auto rounded-lg border border-border/70 bg-background/75">
```

- `maxHeight: '55vh'` fjarlægt — taflan sýnir allar raðir án takmarkana.
- `overflow-auto` → `overflow-x-auto` — láréttur skroll heldur (þegar margar tímadálkar eru) en enginn lóðrættur skroll innan töflunnar sjálfrar.
- Spjaldið sjálft (panel) sér um lóðrættan skroll eins og áður.

Sticky `top-0` klasar á dagsetningarsetu og sticky `left-0` á staðarnafnadálki eru eftir í kóðanum. Þar sem taflan hefur nú enga innri lóðrætta skrolli er sticky-ið á dagsetningum ekki þörf á (það virkar enn en kemur aldrei í leik nema spjaldið sjálft skrolli fram hjá efstu röðinni).

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`

## Skipanir og niðurstöður

1. `npm run type-check` — exit code 0
2. `npm run test:run` — 129 skrár, 3577 próf, 27 skipped, 8 todo. Exit code 0.
3. `git commit` — `468cea8`
4. `git push` — tókst
5. `vercel ls` — build `Ready` eftir ~45s

## Localhost checks fyrir Stebbi

Síða: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

1. Opnaðu "Mitt veður". Staðfestu að "Mitt veður" titillinn og skýringartextinn komi **strax efst** — áður en taflan, "Tímar í töflu" eða "Breyta / stilla" takki.
2. Opnaðu "Breyta / stilla". Staðfestu að titillinn sé enn sýnilegur efst (hann er **ekki** hluti af stillingarsvæðinu).
3. Veldu 4+ veðurstöðvar. Staðfestu að taflan sýni **allar** stöðvar án þess að vera með innri lóðrættan skroll.
4. Staðfestu að taflan sé enn með láréttan skroll ef margar tímadálkar (margir klukkustundir valdir).
5. Skrollaðu spjaldið (panel) sjálft niður. Staðfestu að taflan skrolli með spjaldinu á eðlilegan máta.

## Óvissa

- Sticky dagsetningarröðin í >3 stöðva töflunni er enn til staðar í kóðanum. Hún kemur aðeins í leik ef spjaldið sjálft skrollar fram hjá töfluhaus. Á mobile full-screen spjaldinu gæti þetta verið gagnlegt ef notandi velur mjög margar stöðvar og spjaldið er langt. Ef þörf krefur er auðvelt að fjarlægja `sticky top-0` klasana frá töfluhaus-cella.
