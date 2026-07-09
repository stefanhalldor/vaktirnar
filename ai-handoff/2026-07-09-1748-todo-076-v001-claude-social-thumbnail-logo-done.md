# Handoff: TODO #76 v001 - Social thumbnail logo

Created: 2026-07-09 17:48
Timezone: Atlantic/Reykjavik
Stada: Framkvæmt, type-check og build grænir, ekki commitað

---

## Hvað var gert

### 1. `app/opengraph-image.tsx`

Útlit endurskrifað úr text-only yfir í logo-first:

- Bakgrunnur: `#fbf9f4` (óbreytt)
- Teskeið-skeif (spoon outline) úr `teskeid-logo-no-frame.svg` sem inline `<svg>` + `<path>` í JSX
- Stærð: 756x378px SVG í 1200x630 canvas (scale ~1.8x)
- "Allt í Teskeið" texti í 64px undir skeif (með -48px marginTop til að "siga" saman við skeifina)
- Gamli texti ("Litlar lausnir...") fjarlægður

### 2. `app/layout.tsx`

Bætt við explicit `openGraph.images` og `twitter.images`:

```ts
openGraph: {
  images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Teskeið' }],
}
twitter: {
  card: 'summary_large_image',
  images: ['/opengraph-image'],
}
```

Áður voru `og:image` og `twitter:image` meta tags ekki explicitlega settir -- Next.js gæti hafa auto-discoverað `/opengraph-image` en Facebook/Messenger crawlers virðast ekki treysta því.

### Hugmyndarsíður

`app/hugmyndir/[slug]/opengraph-image.tsx` er lifandi og virkar (sækir titil/lýsingu frá Supabase). Látið óbreytt -- þetta er annað verkefni.

---

## Niðurstöður

```
Type-check: PASS (0 villur)
Build: PASS -- /opengraph-image sést sem ƒ dynamic route
```

---

## Localhost checks fyrir Stebbi

1. Keyra `npm run dev`
2. Opna `http://localhost:3000/opengraph-image`
3. Staðfesta: skeif sést stór og grenn á ljósum bakgrunni
4. Staðfesta: "Allt í Teskeið" texti sést undir skeif
5. Opna heimasíðuna, skoða source eða devtools Network tab, leita að `og:image` og `twitter:image`
6. Staðfesta: báðar vísa á `/opengraph-image` (með metadataBase: `https://teskeid.is`)

## Eftir deploy

7. Nota Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/
8. Setja inn `https://teskeid.is` og smella "Scrape Again"
9. Staðfesta: thumbnail sýnir skeif, ekki grát/tómt

---

## Skrár breyttar

- `app/opengraph-image.tsx` -- logo-first útlit
- `app/layout.tsx` -- explicit openGraph.images og twitter.images
