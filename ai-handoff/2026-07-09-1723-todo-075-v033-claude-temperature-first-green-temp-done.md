# Handoff: TODO #75 v033 - Temperature first and green temperature comparison

Created: 2026-07-09 17:23
Timezone: Atlantic/Reykjavik
Stada: Framkvæmt, type-check og tests grænir, ekki commitað

---

## Hvað var gert

### v033 breytingar

**Temperature-first cell order:**
- Bæði í summary strip og detail drawer er röðin nú: Hiti -> Vindur -> Hviður -> Úrkoma
- Hiti er `text-[12px] font-medium` (strip) og `text-sm font-medium` (drawer) -- sterkasta línan

**Green temperature highlighting:**
- Nýr helper `tempMetricClass(value, otherValue)` bætt við á module-stigi
- Regla: ef `value - otherValue >= 2.0` -> `text-emerald-600 dark:text-emerald-500`
- Ef munur < 2.0°C: engin litur
- Ef `otherValue === undefined`: engin litur
- Notað í báðum áttum (origin og dest)
- Fallback: `|| 'text-foreground'` svo texti sé alltaf lesanlegur

**Hlutlægnistryggt:**
- `tempMetricClass` hefur engin threshold-viðvörunar-skilyrði (ólíkt wind/gust/precip)
- Ekkert rautt/gult á hitastig vegna kuldameinar -- þetta á við vegaleiðarmat, ekki samanburð
- Viðvörunarlit vinna alltaf yfir grænum ef þeir eru bætt við síðar

---

## Skrár breyttar

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `tempMetricClass` helper bætt við (á eftir `precipMetricClass`)
  - Strip origin cell: Hiti fyrst, `tempMetricClass` notað
  - Strip dest cell: Hiti fyrst, `tempMetricClass` notað
  - Drawer origin cell: Hiti fyrst (`text-sm font-medium`), `tempMetricClass` notað
  - Drawer dest cell: Hiti fyrst (`text-sm font-medium`), `tempMetricClass` notað

---

## Niðurstöður

```
Type-check: PASS (0 villur)
Tests: 1958 pass, 27 skipped, 8 todo -- PASS
```

---

## Localhost checks fyrir Stebbi

1. Opna `/auth-mvp/vedrid`
2. Keyra Akureyri -> Garðabær og Garðabær -> Akureyri
3. Í summary strip: staðfesta hiti sé efst í hverjum samanburðardálk
4. Staðfesta: hitastig grænir þar sem munur er >= 2.0°C (t.d. Akureyri 13,7 vs Garðabær 10,8 -> Akureyri grænn)
5. Staðfesta: lítill munur (< 2.0°C) gefur engan lit
6. Staðfesta: vindur/hviður/úrkoma grænt og viðvörunarlit virkar sem fyrr
7. Opna "Skoða samanburð nánar"
8. Staðfesta: drawer sýnir einnig hita fyrst
9. Staðfesta: drawer notar sömu hitastig-græn-logik
10. Staðfesta: engar breytingar á vegaleiðarniðurstöðu, skrubb-talningu, kortapunktastöðu eða samantektartexta

---

## Enn eftir (Phase B / þarf samþykki)

- Custom timestamp controls í drawer (bæta við/fjarlægja klukku-tíma handvirkt)
- Veðurtákn/icons ef `symbolCode` er fáanlegur í `ForecastDrawerRow` (þarf athugun)
- Commit + push (þegar Stebbi staðfestir)
