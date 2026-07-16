# Claude handoff: TODO #75 v044 - disclaimer attention box done

Created: 2026-07-09 23:59
Timezone: Atlantic/Reykjavik
Tengist: TODO #75, v043 disclaimer attention box

## Samantekt

Per Codex v043 og framkvæmdarleyfi Stebba:

1. `weatherDisclaimer` í `Á leiðinni` er nú í compact amber attention-boxi í stað lauss paragraph.
2. Fallback disclaimer utan `Á leiðinni` er fjarlægt.

## Breytingar

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

**Á leiðinni disclaimer** (lína ~931):

Gamalt:
```tsx
<p className="text-xs text-muted-foreground">
  {tf.rich('weatherDisclaimer', {
    link: (chunks) => (
      <a href="https://umferdin.is" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
        {chunks}
      </a>
    ),
  })}
</p>
```

Nýtt:
```tsx
<div className="mt-1 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
  {tf.rich('weatherDisclaimer', {
    link: (chunks) => (
      <a href="https://umferdin.is/" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
        {chunks}
      </a>
    ),
  })}
</div>
```

**Fallback utan `Á leiðinni`** (lína ~1075): fjarlægt í heild sinni.

### `messages/is.json` og `messages/en.json`

Óbreytt frá v041 patch.

## Build status

```
npm run type-check  →  clean
```

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid` sem innskráður notandi.
2. Reikna leið sem sýnir `Á leiðinni`, t.d. Egilsstaðir -> Garðabær eða Garðabær -> Akranes.
3. Staðfesta í `Á leiðinni` kaflanum:
   - Lítið amber box birtist undir vind/úrkomu/hita línunni.
   - Texti: "Athugaðu sérstaklega hviður og færð á vef Vegagerðarinnar. Þetta mat byggir á almennum spágögnum og kemur ekki í stað opinberra upplýsinga."
   - "vef Vegagerðarinnar" er feitletraður linkur á `https://umferdin.is/`.
4. Prófa mobile 360-390 px:
   - enginn horizontal overflow
   - textinn wrappar snyrtilega í boxinu
   - linkurinn er tappanlegur
5. Staðfesta að disclaimer birtist EKKI neðar í cardinu þegar `Á leiðinni` renderast ekki (fallback er fjarlægt).
6. Regression:
   - route calculation virkar
   - scrubber virkar
   - Forecast drawer opnast
   - comparison strip/drawer brotnar ekki
   - hviðuvirkni óbreytt

Ekki þarf SQL, Supabase, RLS, auth, secrets eða production gögn. Ekki keyra migration. Ekki deploya fyrr en Stebbi hefur prófað localhost.
