# Handoff: TODO #75 v032 — Metric colors, green highlighting, presets, drawer fix

Created: 2026-07-09 17:15
Timezone: Atlantic/Reykjavik
Staða: Framkvæmt, type-check og tests grænir, ekki commitað

---

## Hvað var gert

### v031/v032 vandamál leyst

**Blocking:**
- `mm/klst` bætt við í stað `mm` (á báðum stöðum í strip og drawer)
- Drawer takmörkun: `w-full max-w-md mx-auto` — virkar eins og ForecastDrawer á desktop
- Backdrop overlay: `bg-black/40` bætt við
- Metric-specific litun: `windMetricClass`, `gustMetricClass`, `precipMetricClass` koma í stað `statusTextClass(row.status)` á vindlínu

**Medium:**
- Grænt "betri staðurinn" highlighting bætt við:
  - Vindur: `text-emerald-600` þegar minni um ≥1.0 m/s og yfir engum mörkum
  - Hviður: `text-emerald-600` þegar minni um ≥2.0 m/s og yfir engum mörkum
  - Úrkoma: `text-emerald-600` þegar minni um ≥0.2 mm/klst og yfir engum mörkum
  - Hiti: hlutlægt (engin litur á grundvelli hitamunar)
  - Viðvörunarlitir vinna alltaf yfir grænum lit
- `kl. 12` lokalisert: IS → `kl. ${hh}:00`, EN → `${hh}:00`
- Comparison drawer presets:
  - `Kl. 12` (bara kl. 12:00 per dagur)
  - `Morgun · hádegi · kvöld` (09:00, 12:00, 18:00)
  - `Á 3 klst fresti` (00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00)
- Drawer sýnir **öll tiltæk gögn** (engar dagamörk) — ekki bara 5 dagar

---

## Skipulagsbreyting: `buildCompareColumns`

`buildKl12Columns` skipt út fyrir `buildCompareColumns(originRows, destRows, targetHoursUtc, locale, maxDays?)`:
- `targetHoursUtc: number[]` — mælikvarðar per dagur (t.d. `[12]`, `[9,12,18]`, `[0,3,6,...]`)
- `maxDays = Infinity` — sjálfgefið öll gögn; summary strip kallar með `maxDays=5`
- `Kl12Col` → `CompareCol` (almennara nafn)

Ný helpers (module-level):
- `windMetricClass(value, otherValue, thresholds)` — rautt/gult/grænt/tómt
- `gustMetricClass(severity, value, otherValue, thresholds)` — notar `gust.severity` + green comparison
- `precipMetricClass(value, otherValue, thresholds)` — gult/grænt/tómt

`compareThresholds`, `compareOriginRows`, `compareDestRows` reiknuð á component-stigi.

---

## Þýðingalyklar bætt við (3)

- `comparePresetKl12` = "Kl. 12" / "12:00"
- `comparePresetMorning` = "Morgun · hádegi · kvöld" / "Morning · noon · evening"
- `comparePreset3h` = "Á 3 klst fresti" / "Every 3 hours"

---

## Niðurstöður

```
Type-check: PASS (0 villur)
Tests: 1958 pass, 27 skipped, 8 todo — PASS
```

---

## Skrár breyttar

- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — metric helpers, strip update, drawer rewrite, compute block, state
- `messages/is.json` — 3 nýir lyklar
- `messages/en.json` — 3 nýir lyklar

---

## Localhost checks fyrir Stebbi

### Summary strip
1. Keyra leið þar sem veður er mismunandi (t.d. Garðabær -> Akureyri eða Akureyri -> Garðabær)
2. Skruna í summary kortið — "Brottför og áfangastaður"
3. Staðfesta: vindur er **grænn** þar sem hann er lægri um ≥1,0 m/s
4. Staðfesta: vindur er **rauður** þar sem hann fer yfir rauð-mörk, **gulur** við gul-mörk
5. Staðfesta: úrkoma er **græn** þar sem hún er lægri um ≥0,2 mm/klst
6. Staðfesta: hiti er alltaf **hlutlægur** (engin litur á grundvelli munar)
7. Staðfesta: `mm/klst` er skýrlega merkt (ekki plain `mm`)
8. Staðfesta: hviður er `hvið. X,X` án `/X,X` formatsins

### Comparison drawer
9. Smella á "Skoða samanburð nánar"
10. Staðfesta: gluggi er **`max-w-md` þröngur** (ekki full-width á desktop)
11. Staðfesta: backdrop er skyggður
12. Staðfesta: **3 preset-takkflar** sýnilegir: "Kl. 12", "Morgun · hádegi · kvöld", "Á 3 klst fresti"
13. Velja "Morgun · hádegi · kvöld" — staðfesta að 3 tímar sýndir per dagur (kl. 09:00, 12:00, 18:00)
14. Velja "Á 3 klst fresti" — staðfesta að 8 tímar sýndir per dagur
15. Staðfesta: drawer sýnir **öll tiltæk dagar** (ekki bara 5)
16. Staðfesta: grænt/gult/rautt virkar eins og í strip
17. Staðfesta: `mm/klst` merkt í drawer líka
18. Loka drawer á bakgrunnssmelli

### Regression
19. Forecast spágluggi (Yr/GMaps hlekkirnir) virkar enn
20. Engin lárétt yfirflæði á 360px og 390px

---

## Enn eftir (Phase B / þarf samþykki)

- Custom timestamp controls í drawer (bæta við/fjarlægja klukku-tíma handvirkt)
- Veðurtákn/icons ef `symbolCode` er fáanlegur í `ForecastDrawerRow` (þarf athugun)
- Commit + push (þegar Stebbi staðfestir)
