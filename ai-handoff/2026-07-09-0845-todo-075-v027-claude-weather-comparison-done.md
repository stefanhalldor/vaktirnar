# Handoff: TODO #75 v027 — Weather comparison section done

Created: 2026-07-09 08:45
Timezone: Atlantic/Reykjavik
Staða: Framkvæmt, type-check og tests grænir, ekki commitað

---

## Hvað var gert

### "Fyrir þá sem eru að elta veðrið" — ný hluti neðst í summary kort

Bætt við nýjum hluta neðst í summary kortinu (fyrir disclaimer) sem ber saman
veður á brottfararstað og áfangastað.

**Staðsetning:** `FerdalagidClient.tsx` línur ~972–1065, rétt fyrir ofan `{/* Disclaimer */}`.

### Gögn

- **Brottfararstaður:** `routeWeatherPoints.find(p => p.isOrigin)` (isOrigin = routeFraction < 0.02).
  Næsta forecast-röð við `departureIso` via `nearestForecastIso()`.
- **Áfangastaður:** `activeOutboundCandidate.arrivalWeather` — var þegar til, engin ný API-köll.

### Samanburðarregla

Thresholds eins og í v027-plan:

| Mæling  | Mörk   | Lykill ef dest hærri       | Lykill ef dest lægri       |
|---------|--------|----------------------------|----------------------------|
| Vindur  | 1.0 m/s | `weatherCompareDestWindier` | `weatherCompareDestCalmer` |
| Úrkoma  | 0.2 mm/h | `weatherCompareDestWetter` | `weatherCompareDestDrier`  |
| Hiti    | 2.0°C   | `weatherCompareDestWarmer` | `weatherCompareDestColder` |
| (annars) | —      | `weatherCompareSimilar`     |                             |

Vindur er metinn fyrst, svo úrkoma, svo hiti. Einungis ein setning birtist.

### UI

Tvær raðir (brottfor + áfangastaður), hver með:
- Nafn staðar · kl. HH:MM (nearest forecast hour)
- vindur / úrkoma / hiti inline
- smá hlekkur á forecast drawer fyrir þann stað

Samanburðarsetning neðst (t.d. "Áfangastaður er vindasamari en brottfararstaðurinn.").

### Þýðingarlyklar — messages/is.json + messages/en.json

10 nýir lyklar:

| Lykill | IS | EN |
|--------|----|----|
| `weatherHuntersSection` | "Fyrir þá sem eru að elta veðrið" | "For weather watchers" |
| `weatherCompareOriginAt` | "spá kl. {time}" | "forecast at {time}" |
| `weatherCompareOriginForecastBtn` | "Skoða spána á brottfararstað" | "View origin forecast" |
| `weatherCompareSimilar` | "Veðrið er svipað á brottfararstað og áfangastað." | "Weather is similar at origin and destination." |
| `weatherCompareDestWindier` | "Áfangastaður er vindasamari en brottfararstaðurinn." | "Destination is windier than the origin." |
| `weatherCompareDestCalmer` | "Áfangastaður er rólegri en brottfararstaðurinn." | "Destination is calmer than the origin." |
| `weatherCompareDestWetter` | "Áfangastaður er blautari en brottfararstaðurinn." | "Destination is wetter than the origin." |
| `weatherCompareDestDrier` | "Áfangastaður er þurrari en brottfararstaðurinn." | "Destination is drier than the origin." |
| `weatherCompareDestWarmer` | "Áfangastaður er hlýrri en brottfararstaðurinn." | "Destination is warmer than the origin." |
| `weatherCompareDestColder` | "Áfangastaður er kaldari en brottfararstaðurinn." | "Destination is colder than the origin." |

---

## Niðurstöður

```
Type-check: PASS (0 villur)
Tests: 1958 pass, 27 skipped, 8 todo — PASS
```

---

## Skrár breyttar

- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — ný comparison section
- `messages/is.json` — 10 nýir lyklar
- `messages/en.json` — 10 nýir lyklar

---

## Localhost checks fyrir Stebbi

1. Opna `/auth-mvp/vedrid` og keyra leið (t.d. Garðabær -> Akranes)
2. Velja brottfararstund og reikna veður
3. Skruna niður í summary kortinu — "Fyrir þá sem eru að elta veðrið" birtist neðst, fyrir disclaimer
4. Staðfesta: nafn brottfararstaðar + kl. + vindur/úrkoma/hiti
5. Staðfesta: nafn áfangastaðar + kl. + vindur/úrkoma/hiti
6. Staðfesta: samanburðarsetning er nákvæm og of-segir ekki
7. Smella á "Skoða spána á brottfararstað" — forecast drawer opnast með sticky header fyrir brottfararstað
8. Smella á "Skoða spána nánar" við áfangastað — forecast drawer opnast fyrir áfangastað
9. Regression: summary kortið, kortið, og "Á leiðinni" hlutinn virka eins og áður
10. Prófaðu leið þar sem gögn vantar (ef einhver) — hlutinn birtist ekki, engar villur

---

## Hvað er eftir

- Commit + push (þegar Stebbi staðfestir)
- Design.md IS-þýðing á "Structured summary panels" (P3, frestað)
