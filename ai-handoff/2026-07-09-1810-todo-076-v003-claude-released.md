# Handoff: TODO #76 v003 - Social thumbnail released

Created: 2026-07-09 18:10
Timezone: Atlantic/Reykjavik
Stada: Commitað og pushað -- á lofti eftir Vercel build

---

## Hvað var gefið út

Commit `439782a` á main.

- `app/opengraph-image.tsx` -- fullt Teskeið lógó (skeiðar-outline + "Allt í" í handtaki + "Teskeið.is" í skál), 980x490 SVG í 1200x630 canvas, bakgrunnur `#fbf9f4`
- `app/layout.tsx` -- explicit `openGraph.images` og `twitter.images` bætt við

---

## Eftir deploy

1. Opna `https://teskeid.is/opengraph-image` í vafra -- staðfesta fullt lógó
2. Nota Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/
3. Setja inn `https://teskeid.is`, smella "Scrape Again"
4. Facebook heldur í gamla cache þar til scrape er gert

---

## Athugasemd

SVG texti í `next/og` (satori) notar system-ui font í raun, ekki Inter/Geist sem er tilgreint í `fontFamily`. Textinn renderar en gæti horft örlítið öðruvísi en á vefnum. Ef þetta þykir óviðunandi er hægt að loada Inter font sérstaklega í `ImageResponse` (þetta er stutt í next/og docs).
