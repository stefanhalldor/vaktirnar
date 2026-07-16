# Handoff: TODO #77 v004 - Public home ready cards + free access badge released

Created: 2026-07-09 21:15
Timezone: Atlantic/Reykjavik
Stada: Commitað og pushað -- commit e12ec86

---

## Hvað var gefið út

### 1. Forsíða (`app/page.tsx`)

Óinnskráðir notendur sjá nú "Tilbúnar Teskeiðar" kafla beint undir hero:

- `ReadyTeskeidCard` fyrir hvert launched idea (Lánað og skilað, Veðrið, Umönnun)
- Öll kort tengd á `/innskraning`
- Sömu litir/icon og á auth heimasíðunni
- Launched hugmyndir síaðar úr `PersonalizedIdeaGrid` til að koma í veg fyrir tvítekningu
- Innskráðir notendur sjá þennan kafla EKKI

### 2. Innskráningarsíða (`components/teskeid/TeskeidLoginForm.tsx`)

"Aðgangurinn er ókeypis" sýnt sem áberandi ljós-grænn pill/badge milli "Teskeið.is" fyrirsagnar og hvíts formkortsins.

### 3. Þýðingalyklar

- `teskeid.auth.freeAccessLabel` IS: "Aðgangurinn er ókeypis"
- `teskeid.auth.freeAccessLabel` EN: "Free access to Teskeið.is."

---

## Production checks

1. Opna `https://teskeid.is` í private glugga
2. Staðfesta: "Tilbúnar Teskeiðar" kafli sést undir hero með Lánað og skilað, Veðrið, Umönnun kortum
3. Smella á kort -- fer á `/innskraning`
4. Á `/innskraning` -- sjá "Aðgangurinn er ókeypis" pill í ljósgrænum lit
5. Innskráður notandi -- kortin á forsíðunni sýnast EKKI

---

## Eftirstandandi (frá v001)

- `launchedWhy` texta-breyting ("Af hverju skiptir þessi Teskeið máli?") -- type-check ok, ekki commitað sérstaklega en fylgir með í þessum commit
- Detail-page CTA takki á `/hugmyndir/vedrid` er enn til -- Codex mælir með að hafa hann í bili
