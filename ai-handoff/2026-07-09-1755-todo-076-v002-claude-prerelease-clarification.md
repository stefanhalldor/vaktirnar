# Handoff: TODO #76 v002 - Pre-release clarification

Created: 2026-07-09 17:55
Timezone: Atlantic/Reykjavik
Stada: Tilbúið til útgáfu -- beðið eftir localhost preview staðfestingu frá Stebbi

---

## Staða

v001 implementationin er tilbúin og build er grann. Tvær spurningar voru clarified:

---

## 1. Myndin er bara skeiðar-outline, ekki fullt lógó

Nuverandi implementation:

- Ein `<path>` SVG outline úr `teskeid-logo-no-frame.svg` (útlínur skeiðarinnar, engin texti inni)
- "Allt í Teskeið" sem aðskilinn `<div>` texti neðan við SVG

Full lógó myndi hafa:
- "Allt í" texta inni í handtakinu (font-size 16 í SVG coordinate space)
- "Teskeið.is" texta inni í skálunni (font-size 38)

Þetta þarf að staðfesta á localhost (`http://localhost:3000/opengraph-image`) áður en gefið er út.

Ef Stebbi vill full lógó með texta inni í skeiðinni: bæta `<text>` SVG elementum við -- eitt viðbótarskref.

---

## 2. Hvaða síður fá þessa breytingu

- `https://teskeid.is` (forsíðan) -- fær nýja logo-myndinauð via `app/opengraph-image.tsx` + explicit metadata í `app/layout.tsx`
- `https://teskeid.is/hugmyndir/[slug]` -- heldur áfram að nota `app/hugmyndir/[slug]/opengraph-image.tsx` (titill + lýsing per hugmynd). Next.js velur nákvæmasta OG image route.

Þessi fix leysir EKKI hugmynda-deep-links -- þær hafa þegar sérsniðið OG image. Ef eitthvað er að með þær er það aðskilið verkefni.

---

## Localhost checks fyrir Stebbi

1. `npm run dev`
2. Fara á `http://localhost:3000/opengraph-image`
3. Staðfesta: skeiðar-outline sést stór og grenn á ljósum bakgrunni
4. Staðfesta: "Allt í Teskeið" texti sést skýrt
5. Ákveða: er þetta nóg, eða á lógóið að hafa texta inni í skeiðinni líka?

Ef útlit er samþykkt:
- Claude Code commitar og pushar
- Nota Facebook Sharing Debugger eftir deploy: https://developers.facebook.com/tools/debug/
- Setja inn `https://teskeid.is`, smella "Scrape Again"

---

## Mögulegar viðbætur (þarf samþykki)

- Full lógó með "Allt í" og "Teskeið.is" texta inni í SVG skeiðinni
- Fix á hugmynda-OG-images ef þær eru ekki að virka
