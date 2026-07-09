# Handoff: TODO #75 v034 - Copy, disclaimer, color rules, duration formatting

Created: 2026-07-09 17:34
Timezone: Atlantic/Reykjavik
Stada: Framkvæmt, type-check og tests grænir, ekki commitað

---

## Hvað var gert

### 1. Fyrirsögn samanburðar

`weatherCompareSection` IS: "Brottför og áfangastaður" -> "Fyrir þá sem eru að elta veðrið"
`weatherCompareSection` EN: "Departure and destination" -> "For weather watchers"

Gildir bæði fyrir summary strip og detail drawer (sama lykill).

### 2. Disclaimer færður í "Á leiðinni"

Disclaimer bætt við neðst í `<div className="space-y-1">` inni í `Á leiðinni` hlutanum.

Fallback: Ef `Á leiðinni` renderar ekki (engin `displayPoint` og engin `heatmapHighlightedIssue` eða `derivedStyle` er null), sýnist disclaimer enn neðst í summary card -- þannig að hann birtist alltaf einu sinni.

Ekkert tvítekning.

### 3. Samanburðarlitur -- deadbands fjarlægt

Allir metric-helpers uppfærðir:

- `windMetricClass`: `otherValue - value >= 1.0` -> `value < otherValue`
- `gustMetricClass`: `otherValue - value >= 2.0` -> `value < otherValue`
- `precipMetricClass`: `otherValue - value >= 0.2` -> `value < otherValue`
- `tempMetricClass`: `value - otherValue >= 2.0` -> `value > otherValue`

Viðvörunarlit vinna enn alltaf yfir grænum. Jafngildi (equal values) gefa engan lit.

### 4. Klukkustundir og mínútur (Stebbi-viðbót)

`RouteSummary` breitt til að sýna tímann á forminu `4 klst. og 37 mín.` í stað `277 mín.`

Regla:
- < 60 mín: `37 mín.`
- Nákvæmlega X klst: `4 klst.`
- Klst og mín: `4 klst. og 37 mín.`

Nýir þýðingarlyklar bætt við:
- `routeDurationHoursOnly`: "X klst." / "X hr"
- `routeDurationHoursAndMins`: "X klst. og Y mín." / "X hr Y min"

---

## Skrár breyttar

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `RouteSummary`: ný klukkustundir+mínútur formatting
  - `Á leiðinni` section: disclaimer bætt við neðst í content div
  - Fallback disclaimer: conditional á `!(derivedStyle && (dp || issue))`
  - `windMetricClass`, `gustMetricClass`, `precipMetricClass`, `tempMetricClass`: deadbands fjarlægt
- `messages/is.json`: `weatherCompareSection` uppfært, 2 nýir duration lyklar
- `messages/en.json`: `weatherCompareSection` uppfært, 2 nýir duration lyklar

---

## Niðurstöður

```
Type-check: PASS (0 villur)
Tests: 1958 pass, 27 skipped, 8 todo -- PASS
```

---

## Localhost checks fyrir Stebbi

1. Opna `/auth-mvp/vedrid`, keyra Garðabær -> Akureyri
2. Staðfesta: RouteSummary sýnir "389 km, 4 klst. og 37 mín." (eða hvað sem klukkutíminn er)
3. Staðfesta: Fyrirsögn samanburðar er "Fyrir þá sem eru að elta veðrið"
4. Staðfesta: Drawer fyrirsögn er sama
5. Staðfesta: Disclaimer er inni í "Á leiðinni" hlutanum
6. Staðfesta: Disclaimer er EKKI tvítekinn neðst í kortinu
7. Nota leið þar sem engin "Á leiðinni" renderar (t.d. ef allt er grænt/einfalt) -- staðfesta að disclaimer birtist neðst sem fallback
8. Staðfesta: Lítill munur í vindhraða, hviðum, úrkomu eða hita grænir strax (engin þröskuldur)
9. Staðfesta: Jafngildi gefa engan lit
10. Staðfesta: Viðvörunarlit (rautt/gult) vinna enn yfir grænum
11. Staðfesta: Engar breytingar á vegaleiðarniðurstöðu, scrubber, kortapunktum

---

## Enn eftir (Phase B)

- Custom timestamp controls í drawer
- Veðurtákn/icons
- Commit + push þegar Stebbi staðfestir
